# QR Payment App

Легка демо-програма для створення QR-посилань на оплату Solana.

Повна документація українською: [DOCUMENTATION_UA.md](DOCUMENTATION_UA.md).

## Запуск

```powershell
copy .env.example .env
docker compose up -d
npm install
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:4000/api/health

Для тестів з телефону QR-посилання генеруються через:

```env
VITE_PUBLIC_PAYMENT_ORIGIN=http://192.168.137.1:5173
```

Пізніше замініть це значення в `.env` на ваш домен, наприклад `https://pay.example.com`.

## Ubuntu start.sh

На Ubuntu можна скористатися універсальним скриптом, який встановить Node.js/npm і Docker, якщо їх немає, підніме PostgreSQL, встановить npm dependencies і запустить потрібний режим:

```bash
chmod +x start.sh
./start.sh
```

Корисні режими:

```bash
APP_ORIGIN=https://your-domain.com ./start.sh prod
./start.sh start
./start.sh dev
./start.sh build
./start.sh test
```

За замовчуванням `./start.sh` запускає production режим: білдить frontend і стартує Express на `http://localhost:4000`, який віддає frontend як статику.

## Що є всередині

- React/Vite frontend українською мовою.
- Express backend з власною email/password auth.
- PostgreSQL у Docker.
- Sequelize models і `sequelize.sync()` при старті.
- CRUD криптогаманців для бізнесу.
- Створення payment request з QR на `/pay/:id`.
- Public сторінка оплати з live EUR -> SOL конвертацією через CoinGecko.
