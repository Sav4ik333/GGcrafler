import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const skins = [
  ['Neon Phantom', 35, 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=500&q=80', 'Rare'],
  ['Azure Strike', 48, 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=500&q=80', 'Uncommon'],
  ['Gold Circuit', 62, 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=500&q=80', 'Epic'],
  ['Night Pixel', 26, 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=500&q=80', 'Common'],
  ['Royal Core', 130, 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=500&q=80', 'Legendary']
];
async function main(){
 for (const [name, price, imageUrl, rarity] of skins) await prisma.skin.upsert({where:{name:String(name)},update:{},create:{name:String(name),price:Number(price),imageUrl:String(imageUrl),rarity:String(rarity),description:'Demo skin for GGcrafter'}});
 await prisma.promoCode.upsert({where:{code:'GPT'},update:{reward:50,usageLimit:100000,active:true},create:{code:'GPT',reward:50,usageLimit:100000}});
 const demo=await prisma.user.upsert({where:{telegramId:BigInt(999001)},update:{},create:{telegramId:BigInt(999001),username:'demo_player',displayName:'Demo Player'}});
 const count=await prisma.inventory.count({where:{userId:demo.id}}); if(!count){const starter=await prisma.skin.findMany({where:{name:{in:['Neon Phantom','Azure Strike','Night Pixel']}}});await prisma.inventory.createMany({data:starter.map(s=>({userId:demo.id,skinId:s.id}))});}
}
main().finally(()=>prisma.$disconnect());
