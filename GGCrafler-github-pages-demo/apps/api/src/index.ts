import dotenv from 'dotenv';
import path from 'node:path';
// npm workspaces starts this package from apps/api; local development keeps .env at repository root.
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env'), override: false });
import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const db = new PrismaClient(); const app = express();
const port = Number(process.env.PORT || 3001);
app.use(helmet()); app.use(cors({origin:process.env.WEB_ORIGIN?.split(',') || true})); app.use(express.json({limit:'1mb'}));
type AuthedRequest = Request & { userId?: string };
function telegramUser(initData: string) {
  const params = new URLSearchParams(initData); const hash = params.get('hash');
  if (!hash || !process.env.TELEGRAM_BOT_TOKEN) return null;
  params.delete('hash'); const data = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const check = crypto.createHmac('sha256',secret).update(data).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(check))) return null;
  const authDate = Number(params.get('auth_date') || 0); if (Date.now()/1000-authDate > 86400) return null;
  const raw = params.get('user'); return raw ? JSON.parse(raw) : null;
}
async function userFromRequest(req: AuthedRequest, res: Response, next: NextFunction) {
 try {
  const tg = telegramUser(req.header('x-telegram-init-data') || '');
  // Local-only developer identity: disabled whenever a bot token is configured.
  const user = tg || (!process.env.TELEGRAM_BOT_TOKEN ? {id: 999001, username:'demo_player', first_name:'Demo', photo_url:null} : null);
  if (!user) return res.status(401).json({error:'Telegram authorization failed'});
  const record = await db.user.upsert({where:{telegramId:BigInt(user.id)},update:{username:user.username || null,displayName:[user.first_name,user.last_name].filter(Boolean).join(' '),avatarUrl:user.photo_url || null},create:{telegramId:BigInt(user.id),username:user.username || null,displayName:[user.first_name,user.last_name].filter(Boolean).join(' '),avatarUrl:user.photo_url || null}});
  req.userId=record.id; next();
 } catch { res.status(401).json({error:'Invalid Telegram data'}); }
}
const publicUser = (u:any) => ({...u,telegramId:u.telegramId.toString()});
async function lock(req:AuthedRequest,res:Response,next:NextFunction) { const key=req.header('idempotency-key'); if(!key || !req.userId) return res.status(400).json({error:'Idempotency-Key required'}); try {await db.requestLock.create({data:{id:key,userId:req.userId}});next();} catch {res.status(409).json({error:'This request was already processed'});} }
function admin(req:Request,res:Response,next:NextFunction){try {const v=jwt.verify((req.header('authorization')||'').replace('Bearer ',''),process.env.ADMIN_JWT_SECRET || 'dev'); if(typeof v==='object' && v.role==='admin') return next();}catch{} return res.status(403).json({error:'Admin access required'});}

app.get('/health',(_,res)=>res.json({ok:true}));
app.get('/api/me',userFromRequest,async(req:AuthedRequest,res)=>{const u=await db.user.findUniqueOrThrow({where:{id:req.userId}}); const inventory=await db.inventory.findMany({where:{userId:req.userId},include:{skin:true},orderBy:{obtainedAt:'desc'}});res.json({user:publicUser(u),inventory});});
app.get('/api/skins',userFromRequest,async(_,res)=>res.json(await db.skin.findMany({where:{active:true},orderBy:{price:'asc'}})));
app.post('/api/promo/redeem',userFromRequest,lock,async(req:AuthedRequest,res)=>{const code=z.string().trim().toUpperCase().min(1).max(32).parse(req.body.code); try {const data=await db.$transaction(async tx=>{const p=await tx.promoCode.findUnique({where:{code}});if(!p||!p.active||p.usesCount>=p.usageLimit) throw Error('Промокод недоступен'); const previous=await tx.promoCodeUse.findFirst({where:{promoId:p.id,userId:req.userId}});if(previous)throw Error('Вы уже использовали этот промокод'); await tx.promoCodeUse.create({data:{promoId:p.id,userId:req.userId!}});await tx.promoCode.update({where:{id:p.id},data:{usesCount:{increment:1}}});return tx.user.update({where:{id:req.userId},data:{balance:{increment:p.reward}}});});res.json({user:publicUser(data),message:`+${data.balance ? 'монеты начислены' : ''}`});}catch(e:any){res.status(400).json({error:e.message});}});
app.post('/api/inventory/:id/sell',userFromRequest,lock,async(req:AuthedRequest,res)=>{try {const result=await db.$transaction(async tx=>{const item=await tx.inventory.findFirst({where:{id:req.params.id,userId:req.userId},include:{skin:true}});if(!item)throw Error('Предмет не найден');await tx.inventory.delete({where:{id:item.id}});return tx.user.update({where:{id:req.userId},data:{balance:{increment:item.skin.price}}});});res.json({user:publicUser(result)});}catch(e:any){res.status(400).json({error:e.message});}});
app.post('/api/craft',userFromRequest,lock,async(req:AuthedRequest,res)=>{const ids=z.array(z.string()).min(3).max(6).parse(req.body.inventoryIds);if(new Set(ids).size!==ids.length)return res.status(400).json({error:'Предметы должны быть уникальными'}); try {const out=await db.$transaction(async tx=>{const inputs=await tx.inventory.findMany({where:{id:{in:ids},userId:req.userId},include:{skin:true}});if(inputs.length!==ids.length)throw Error('Часть предметов уже недоступна');const value=inputs.reduce((a,x)=>a+x.skin.price,0); const min=Math.round(value*.365),max=Math.round(value*1.355); const options=await tx.skin.findMany({where:{active:true,craftEnabled:true,price:{gte:min,lte:max}}});if(!options.length)throw Error('Нет подходящих результатов — измените набор'); const total=options.reduce((a,x)=>a+x.craftWeight,0);let roll=Math.random()*total;const skin=options.find(x=>(roll-=x.craftWeight)<=0) || options[0]; await tx.inventory.deleteMany({where:{id:{in:ids},userId:req.userId}});const item=await tx.inventory.create({data:{userId:req.userId!,skinId:skin.id},include:{skin:true}});await tx.craftHistory.create({data:{userId:req.userId!,usedSkinIds:ids,resultSkinId:skin.id,inputValue:value,resultValue:skin.price}});return {item,inputValue:value,min,max};});res.json(out);}catch(e:any){res.status(400).json({error:e.message});}});
app.post('/api/admin/login',userFromRequest,(req,res)=>{if(!process.env.ADMIN_PASSWORD || req.body.password!==process.env.ADMIN_PASSWORD)return res.status(401).json({error:'Неверный пароль'});res.json({token:jwt.sign({role:'admin'},process.env.ADMIN_JWT_SECRET || 'dev',{expiresIn:'4h'})});});
app.get('/api/admin/skins',userFromRequest,admin,async(_,res)=>res.json(await db.skin.findMany({orderBy:{createdAt:'desc'}})));
const skinSchema=z.object({name:z.string().min(2).max(80),price:z.number().int().positive(),imageUrl:z.string().url(),description:z.string().max(500).default(''),rarity:z.string().max(32).default('Common'),active:z.boolean().default(true),craftEnabled:z.boolean().default(true),craftWeight:z.number().int().min(0).max(100000).default(100)});
app.post('/api/admin/skins',userFromRequest,admin,async(req,res)=>res.status(201).json(await db.skin.create({data:skinSchema.parse(req.body)})));
app.patch('/api/admin/skins/:id',userFromRequest,admin,async(req,res)=>res.json(await db.skin.update({where:{id:req.params.id},data:skinSchema.partial().parse(req.body)})));
app.delete('/api/admin/skins/:id',userFromRequest,admin,async(req,res)=>res.json(await db.skin.update({where:{id:req.params.id},data:{active:false,craftEnabled:false}})));
const promoSchema=z.object({code:z.string().trim().toUpperCase().min(2).max(32),reward:z.number().int().positive(),usageLimit:z.number().int().positive(),active:z.boolean().default(true)});
app.get('/api/admin/promos',userFromRequest,admin,async(_,res)=>res.json(await db.promoCode.findMany({orderBy:{createdAt:'desc'}})));
app.post('/api/admin/promos',userFromRequest,admin,async(req,res)=>res.status(201).json(await db.promoCode.create({data:promoSchema.parse(req.body)})));
app.use((err:any,_:Request,res:Response,_next:NextFunction)=>res.status(err?.name==='ZodError'?400:500).json({error:err?.issues?.[0]?.message || 'Server error'}));
app.listen(port,()=>console.log(`GGcrafter API on :${port}`));
