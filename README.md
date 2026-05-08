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

## Що є всередині

- React/Vite frontend українською мовою.
- Express backend з власною email/password auth.
- PostgreSQL у Docker.
- Sequelize models і `sequelize.sync()` при старті.
- CRUD криптогаманців для бізнесу.
- Створення payment request з QR на `/pay/:id`.
- Public сторінка оплати з live EUR -> SOL конвертацією через CoinGecko.
