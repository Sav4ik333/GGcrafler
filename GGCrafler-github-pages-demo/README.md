# GGcrafter — Telegram Mini App

Полноценный мобильный игровой Mini App: React/Vite frontend, Express/TypeScript API и PostgreSQL/Prisma. Все ценные операции выполняются на сервере: проверка Telegram init data, создание пользователя, крафт, промокоды, продажа предметов и доступ администратора.

## Что реализовано

- Тёмный mobile-first игровой UI, нижняя навигация, плавные нажатия и анимация крафта.
- Профиль Telegram, баланс игровых монет, инвентарь и продажа скинов.
- Крафт 3–6 разных предметов. Сервер в одной транзакции списывает вход, выбирает результат по серверным весам и пишет `CraftHistory`. Диапазон: 36.5–135.5% от входной стоимости.
- Маркет из БД, тестовый промокод `GPT` (+50), запрет повторного использования одним пользователем.
- Админ-вход проверяется API; создание/отключение скинов, настройка веса крафта и создание промокодов.
- Экран пополнения и вывода намеренно не выполняет платёжных операций: это только подготовленная UX-точка для будущего провайдера.

## Локальный запуск

Нужен Node.js 20+ и Docker Desktop.

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Откройте `http://localhost:5173`. Если `TELEGRAM_BOT_TOKEN` пуст, API включает строго локальный demo-профиль с тремя стартовыми скинами. Перед публичным запуском задайте токен — demo-режим автоматически выключится.

## Быстрый тест через GitHub Pages — без Telegram и сервера

В репозитории есть workflow `.github/workflows/deploy-demo.yml`. После push в ветку `main` он собирает мобильную/desktop версию в browser-demo режиме: тестовые профиль, инвентарь, крафт, продажа, промокоды и админка сохраняются в `localStorage` конкретного браузера. Для включения откройте GitHub → **Settings → Pages** и выберите **Source: GitHub Actions**. Ссылка будет `https://ВАШ_GITHUB_LOGIN.github.io/ИМЯ_РЕПОЗИТОРИЯ/`; workflow автоматически учитывает имя репозитория. В demo-версии не используются Telegram, сервер, платежи или реальные пользователи.

## Telegram / BotFather

1. Создайте бота в [@BotFather](https://t.me/BotFather) командой `/newbot` и сохраните token только в `.env` API.
2. Задеплойте frontend и API на HTTPS-домены; укажите frontend-домен в `WEB_ORIGIN`.
3. В BotFather используйте `/setmenubutton`, выберите бота, задайте текст `Открыть GGcrafter` и HTTPS URL фронтенда. Можно также использовать Web App кнопку в клавиатуре своего бота.
4. Установите `TELEGRAM_BOT_TOKEN`, перезапустите API. Клиент передаёт `Telegram.WebApp.initData` в заголовке, а сервер проверяет его HMAC и срок жизни до создания/обновления пользователя.

## Deploy

Подходящий недорогой вариант: Vercel/Cloudflare Pages для `apps/web`, Render/Fly.io/Railway для API и Neon/Supabase PostgreSQL. На API задайте `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, сильный `ADMIN_JWT_SECRET`, `ADMIN_PASSWORD`, `WEB_ORIGIN`; выполните `npm run db:generate`, `npm run db:migrate`, затем однократно `npm run db:seed`. В web укажите proxy/rewrite `/api` на API-домен (либо замените base URL в `src/main.tsx`).

## Безопасность и дальнейшее развитие

- В production используйте длинный уникальный `ADMIN_PASSWORD` или замените его на Telegram ID allow-list/OAuth; пароль не попадает во frontend.
- Для финансовых действий используйте Telegram Payments: server создаёт invoice, принимает webhook/успешный callback, затем в транзакции зачисляет баланс. Не доверяйте клиентскому подтверждению.
- `RequestLock` использует обязательный `Idempotency-Key` для мутирующих действий. Периодически удаляйте старые записи фоновым job.
- Загрузка картинок сейчас URL-ориентированная. Перед публичным запуском добавьте серверную загрузку в S3/R2 с проверкой MIME, размера и антивирусным сканированием.

## Структура

`apps/api` — Express API, Prisma schema/seed/migration. `apps/web` — Telegram Mini App. Секреты только в корневом `.env`; `.env.example` содержит безопасные шаблоные значения. Для раздельного облачного хостинга фронтенду задаётся публичная переменная `VITE_API_URL`.
