# Документація проєкту QR Payment App

## 1. Загальна ідея

`QR Payment App` - це демо-застосунок для створення QR-посилань на оплату через Solana.

Система дозволяє:

- бізнес-користувачу зареєструватися, додати Solana-гаманець і створити платіжний запит в EUR;
- застосунку згенерувати публічне посилання `/pay/:id` і QR-код для цього запиту;
- клієнту відкрити сторінку оплати, перейти у Solana-гаманець через Solana Pay URL і, за бажанням, зберегти інвойс у своєму акаунті;
- бізнес-користувачу створювати HTML-шаблони інвойсів у візуальному редакторі.

Проєкт побудований як npm workspace з двома застосунками:

- `apps/backend` - Express API, PostgreSQL, Sequelize, auth, бізнес-логіка платежів.
- `apps/frontend` - React/Vite інтерфейс, QR-генерація, сторінки бізнесу/клієнта, редактор інвойсів.

## 2. Структура проєкту

```text
qrForm/
  README.md
  DOCUMENTATION_UA.md
  package.json
  package-lock.json
  docker-compose.yml
  start.ps1
  .env.example
  apps/
    backend/
      package.json
      src/
        app.js
        server.js
        config/env.js
        db/sequelize.js
        models/index.js
        middleware/
        routes/
        services/
        utils/
      tests/api.test.js
    frontend/
      package.json
      vite.config.js
      index.html
      src/
        main.jsx
        styles.css
        services/api.js
        components/
        pages/
```

## 3. Основний потік роботи

### 3.1. Потік бізнес-користувача

1. Бізнес реєструється або входить через `/auth`.
2. Backend створює користувача з роллю `business`, хешує пароль і ставить HttpOnly cookie сесії.
3. Бізнес переходить у `/wallets` і додає Solana public key з коротким alias.
4. На `/requests` бізнес вибирає гаманець, вводить назву платежу та суму в EUR.
5. Backend створює запис `Transaction`, де в `payloadText` лежить JSON з даними інвойса.
6. Frontend показує QR-код, який веде на публічний URL `/pay/:id`.

### 3.2. Потік клієнта

1. Клієнт сканує QR і відкриває `/pay/:id`.
2. Frontend запитує публічні дані інвойса через `GET /api/pay/:id`.
3. При натисканні `Pay` frontend запитує `GET /api/pay/:id/solana-url`.
4. Backend бере суму в EUR, отримує курс SOL/EUR з CoinGecko і формує `solana:` URL.
5. Browser переходить на цей URL, і мобільний гаманець може відкрити оплату.
6. Якщо курс недоступний, backend все одно формує Solana Pay URL без суми, а клієнту показується попередження, що суму треба ввести вручну.
7. Якщо клієнт авторизований з роллю `client`, він може зберегти інвойс у своєму акаунті.

### 3.3. Потік шаблонів інвойсів

1. Бізнес відкриває `/invoices`.
2. Може створити новий HTML-шаблон або відкрити існуючий.
3. Візуальний редактор дозволяє додавати текст, активні input-поля та зображення.
4. При `Export` редактор конвертує внутрішній список елементів у HTML.
5. Backend перевіряє HTML на базові небезпечні конструкції та зберігає його в таблиці `invoice_templates`.

## 4. Backend

### 4.1. Точка входу

Файл `apps/backend/src/server.js` відповідає за запуск API:

- імпортує моделі, щоб Sequelize зареєстрував таблиці;
- перевіряє підключення до PostgreSQL через `sequelize.authenticate()`;
- виконує `sequelize.sync()`, тобто створює/синхронізує таблиці без окремих міграцій;
- запускає Express-сервер на порту з `env.port`.

Файл `apps/backend/src/app.js` створює Express application:

- підключає `helmet` для базових security headers;
- підключає CORS з `origin: env.frontendUrl` і `credentials: true`;
- вмикає JSON body parser з лімітом `1mb`;
- підключає `morgan` для логів запитів;
- реєструє API-маршрути;
- додає `notFound` і `errorHandler`.

### 4.2. Конфігурація

Файл `apps/backend/src/config/env.js` читає `.env` з кореня проєкту і формує об'єкт `env`.

Основні змінні:

| Змінна | Для чого |
|---|---|
| `APP_NAME` | Назва застосунку, повертається у health check. |
| `PORT` | Порт backend API, за замовчуванням `4000`. |
| `FRONTEND_URL` | Дозволений origin для CORS. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `AUTH_COOKIE_NAME` | Назва cookie сесії. |
| `AUTH_SESSION_DAYS` | Скільки днів живе сесія. |
| `COINGECKO_API_URL` | Базовий URL CoinGecko API. |

### 4.3. Підключення до бази

Файл `apps/backend/src/db/sequelize.js` створює Sequelize instance:

```js
new Sequelize(env.databaseUrl, {
  dialect: "postgres",
  logging: false
});
```

База даних піднімається через `docker-compose.yml`. Там описаний сервіс `postgres` на образі `postgres:17-alpine`, порт `5432`, база `qrpay`, користувач `qrpay`, пароль `qrpay`.

### 4.4. Моделі даних

Усі Sequelize-моделі знаходяться в `apps/backend/src/models/index.js`.

#### `User`

Таблиця `users`.

Відповідає за акаунти користувачів.

Поля:

- `id` - UUID primary key.
- `email` - унікальний email.
- `passwordHash` - scrypt-хеш пароля.
- `role` - роль користувача: `business` або `client`.

Зв'язки:

- має багато `AuthSession`;
- має багато `Wallet`;
- має багато `InvoiceTemplate`.

#### `AuthSession`

Таблиця `auth_sessions`.

Відповідає за серверні сесії авторизації.

Поля:

- `id` - UUID primary key.
- `userId` - користувач, якому належить сесія.
- `tokenHash` - SHA-256 хеш токена з cookie.
- `userAgent` - браузер/клієнт.
- `ipAddress` - IP адреса.
- `expiresAt` - дата завершення сесії.
- `revokedAt` - дата відкликання сесії, якщо користувач вийшов.

Важливо: у cookie зберігається не `tokenHash`, а випадковий токен. У БД лежить тільки його хеш.

#### `Wallet`

Таблиця `wallets`.

Відповідає за Solana-гаманці бізнес-користувачів.

Поля:

- `userId` - власник гаманця.
- `alias` - коротка назва гаманця.
- `publicKey` - Solana public key.

Primary key складений: `userId + alias`.

Через це alias унікальний тільки в межах конкретного бізнес-користувача.

#### `Transaction`

Таблиця `transactions`.

Відповідає за створені payment requests.

Поля:

- `id` - короткий рядок з `nanoid(14)`, використовується у `/pay/:id`.
- `payloadText` - JSON-рядок з даними інвойса.

У `payloadText` зберігається приблизно така структура:

```json
{
  "alias": "main",
  "businessUserId": "uuid",
  "address": "Solana public key",
  "name": "Consulting",
  "amountEur": "25.00",
  "createdAt": "ISO date"
}
```

#### `SavedInvoice`

Таблиця `saved_invoices`.

Відповідає за інвойси, які клієнт зберіг у своєму акаунті.

Поля:

- `clientUserId` - користувач з роллю `client`.
- `transactionId` - payment request, який збережено.

Primary key складений: `clientUserId + transactionId`.

#### `InvoiceTemplate`

Таблиця `invoice_templates`.

Відповідає за HTML-шаблони інвойсів бізнес-користувача.

Поля:

- `userId` - власник шаблону.
- `name` - назва шаблону.
- `html` - HTML-документ шаблону.

Primary key складений: `userId + name`.

### 4.5. Middleware

#### `middleware/auth.js`

Містить три middleware/helper-и:

- `optionalAuth` - пробує прочитати сесію, але не блокує запит, якщо користувач не авторизований.
- `authenticate` - вимагає валідну сесію, інакше повертає `401`.
- `requireRole(role)` - перевіряє роль користувача, інакше повертає `403`.

Це використовується так:

- `/api/pay/:id` доступний публічно, але через `optionalAuth` може показати, чи інвойс уже збережений клієнтом.
- `/api/wallets`, `/api/payment-requests`, `/api/invoice-templates` доступні тільки бізнесу.
- `/api/saved-invoices` і `/api/pay/:id/save` доступні тільки клієнтам.

#### `middleware/errorHandler.js`

- `notFound` повертає `404`, якщо маршрут не знайдено.
- `errorHandler` читає `error.status` або ставить `500`, логує серверні помилки й повертає JSON `{ error }`.

### 4.6. Services

#### `passwordService.js`

Відповідає за паролі:

- `hashPassword(password)` - генерує salt, хешує пароль через `crypto.scrypt`, повертає рядок формату `scrypt:salt:hash`.
- `verifyPassword(password, storedHash)` - перевіряє пароль через `scrypt` і `timingSafeEqual`.

#### `sessionService.js`

Відповідає за cookie-сесії:

- читає cookie з request headers;
- створює випадковий token через `crypto.randomBytes(32)`;
- хешує token через SHA-256;
- створює запис `AuthSession`;
- ставить HttpOnly cookie з `SameSite=Lax`;
- знаходить активну сесію за token hash;
- відкликає сесію при logout через `revokedAt`.

#### `priceService.js`

Відповідає за курс SOL/EUR:

- викликає CoinGecko endpoint `/simple/price?ids=solana&vs_currencies=eur`;
- дістає `data.solana.eur`;
- перевіряє, що курс є додатним числом.

Якщо CoinGecko недоступний, помилка обробляється в `pay.js`, і застосунок переходить у режим ручної суми.

#### `solanaService.js`

Відповідає за Solana-адреси й Solana Pay URL:

- `assertSolanaPublicKey(value)` перевіряє адресу через `new PublicKey(...)` з `@solana/web3.js`;
- `buildSolanaPayUrl(...)` формує URL виду:

```text
solana:<recipient>?amount=<SOL>&label=<label>&message=<message>&memo=<transactionId>
```

### 4.7. Utils

Файл `utils/http.js`:

- `asyncRoute(handler)` - обгортка для async Express route, щоб помилки йшли в `next`.
- `httpError(status, message)` - створює Error зі статусом.
- `normalizeEmail(email)` - trim + lowercase.
- `parseAmount(value)` - перевіряє, що сума є числом більше 0.
- `parseTransactionPayload(transaction)` - парсить JSON з `Transaction.payloadText`.

## 5. Backend API

### 5.1. Health

#### `GET /api/health`

Повертає:

```json
{
  "ok": true,
  "app": "QR Pay"
}
```

### 5.2. Auth

#### `GET /api/auth/session`

Перевіряє поточну cookie-сесію.

Повертає:

```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "business",
    "createdAt": "date"
  }
}
```

або:

```json
{
  "authenticated": false,
  "user": null
}
```

#### `POST /api/auth/register`

Тіло:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "role": "business"
}
```

Логіка:

- email нормалізується;
- пароль має бути мінімум 8 символів;
- якщо роль не `client`, автоматично буде `business`;
- перевіряється унікальність email;
- пароль хешується;
- створюється користувач;
- створюється сесія і ставиться cookie.

#### `POST /api/auth/login`

Тіло:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Логіка:

- шукає користувача за email;
- перевіряє пароль;
- створює нову сесію.

#### `POST /api/auth/logout`

Відкликає поточну сесію і очищає cookie.

### 5.3. Wallets

Усі маршрути `/api/wallets` вимагають:

- авторизацію;
- роль `business`.

#### `GET /api/wallets`

Повертає всі гаманці поточного бізнес-користувача.

#### `POST /api/wallets`

Тіло:

```json
{
  "alias": "main",
  "publicKey": "11111111111111111111111111111111"
}
```

Логіка:

- alias має бути непорожній і до 80 символів;
- public key перевіряється як Solana address;
- alias має бути унікальний для користувача.

#### `PUT /api/wallets/:alias`

Оновлює гаманець.

Якщо alias змінився, backend створює новий запис з новим alias і видаляє старий, бо alias є частиною primary key.

#### `DELETE /api/wallets/:alias`

Видаляє гаманець бізнес-користувача.

### 5.4. Payment requests

Усі маршрути `/api/payment-requests` вимагають:

- авторизацію;
- роль `business`.

#### `GET /api/payment-requests`

Повертає payment requests, створені поточним бізнес-користувачем.

Технічна деталь: backend читає всі `Transaction`, парсить `payloadText`, а потім фільтрує по `businessUserId`. Це працює для демо, але для великого обсягу даних краще винести `businessUserId` в окрему колонку.

#### `POST /api/payment-requests`

Тіло:

```json
{
  "walletAlias": "main",
  "name": "Consulting",
  "amountEur": 25
}
```

Логіка:

- перевіряє, що гаманець вибраний;
- перевіряє, що назва непорожня;
- перевіряє, що сума більше 0;
- знаходить гаманець поточного бізнесу;
- створює `Transaction` з випадковим `id`;
- зберігає дані запиту в `payloadText`.

### 5.5. Public pay routes

#### `GET /api/pay/:id`

Публічний endpoint для читання інвойса.

Якщо користувач авторизований як `client`, endpoint також перевіряє, чи інвойс збережений.

Повертає:

```json
{
  "id": "transactionId",
  "saved": false,
  "alias": "main",
  "address": "Solana public key",
  "name": "Consulting",
  "amountEur": "25.00",
  "createdAt": "ISO date"
}
```

#### `POST /api/pay/:id/save`

Вимагає:

- авторизацію;
- роль `client`.

Створює запис `SavedInvoice` для поточного клієнта. Використовується `findOrCreate`, тому повторне збереження не створює дублікат.

#### `GET /api/pay/:id/solana-url`

Створює Solana Pay URL.

Нормальний сценарій:

1. Читає payment request.
2. Отримує курс SOL/EUR.
3. Рахує `solAmount = amountEur / rateEur`.
4. Формує URL з amount, label, message і memo.

Повертає:

```json
{
  "url": "solana:...",
  "solAmount": "0.500000000",
  "rateEur": 100,
  "manualAmount": false
}
```

Fallback-сценарій, якщо курс недоступний:

```json
{
  "url": "solana:...",
  "solAmount": null,
  "rateEur": null,
  "manualAmount": true,
  "warning": "Could not fetch the SOL/EUR rate. Enter the amount manually."
}
```

#### `GET /api/saved-invoices`

Вимагає:

- авторизацію;
- роль `client`.

Повертає всі інвойси, збережені поточним клієнтом.

### 5.6. Invoice templates

Усі маршрути `/api/invoice-templates` вимагають:

- авторизацію;
- роль `business`.

#### `GET /api/invoice-templates`

Повертає короткий список шаблонів:

```json
[
  {
    "name": "Invoice template",
    "createdAt": "date",
    "updatedAt": "date"
  }
]
```

#### `GET /api/invoice-templates/:name`

Повертає конкретний шаблон разом з HTML.

#### `POST /api/invoice-templates`

Створює шаблон.

Тіло:

```json
{
  "name": "Sales invoice",
  "html": "<div class=\"invoice-page\">...</div>"
}
```

Якщо `name` не передано, backend створює автоматичну назву:

- `Invoice template`;
- `Invoice template 2`;
- `Invoice template 3`;
- і так далі.

HTML проходить базову перевірку:

- не можна `<script>`;
- не можна inline event handlers типу `onclick=`;
- не можна `javascript:` URLs;
- розмір HTML не більше 500 000 символів.

#### `PUT /api/invoice-templates/:name`

Оновлює HTML і, за потреби, назву шаблону.

Якщо назва змінюється, backend створює новий запис і видаляє старий, бо `name` є частиною primary key.

#### `DELETE /api/invoice-templates/:name`

Видаляє шаблон бізнес-користувача.

## 6. Frontend

### 6.1. Точка входу

Файл `apps/frontend/src/main.jsx`:

- створює React root;
- підключає `BrowserRouter`;
- реєструє маршрути застосунку;
- імпортує глобальні стилі.

Маршрути:

| Route | Компонент | Призначення |
|---|---|---|
| `/` | `LandingPage` | Публічна стартова сторінка. |
| `/auth` | `AuthPage` | Login/register для бізнесу й клієнта. |
| `/pay/:id` | `PayPage` | Публічна сторінка оплати. |
| `/wallets` | `WalletsPage` | Керування гаманцями бізнесу. |
| `/requests` | `PaymentRequestsPage` | Створення payment requests і QR. |
| `/invoices` | `InvoicesPage` | HTML-шаблони інвойсів. |
| `/saved` | `SavedInvoicesPage` | Збережені інвойси клієнта. |

Маршрути `/wallets`, `/requests`, `/invoices`, `/saved` вкладені в `AppShell`, який перевіряє сесію.

### 6.2. API-клієнт

Файл `apps/frontend/src/services/api.js` - єдина обгортка над backend API.

Він:

- бере базовий URL з `VITE_API_URL` або використовує `/api`;
- додає `credentials: "include"`, щоб браузер відправляв cookie сесії;
- ставить `Content-Type: application/json`;
- при помилці читає `{ error }` з відповіді й кидає `Error`.

Усі сторінки frontend працюють через об'єкт `api`.

### 6.3. Vite config

Файл `apps/frontend/vite.config.js`:

- читає env з кореня проєкту через `envDir: "../.."`;
- запускає dev server на порту `5173`;
- проксіює `/api` на `http://localhost:4000`.

Завдяки proxy frontend у dev-режимі може викликати `/api/...`, не вказуючи повний backend URL.

### 6.4. `AppShell`

Файл `components/AppShell.jsx`.

Відповідає за authenticated layout:

- при завантаженні викликає `api.session()`;
- якщо користувач не авторизований, перекидає на `/auth`;
- показує sidebar;
- для ролі `business` показує навігацію `Wallets`, `Payment Requests`, `Invoices`;
- для ролі `client` показує `Saved Invoices`;
- має кнопку logout.

### 6.5. `LandingPage`

Публічна головна сторінка.

Відповідає за:

- коротке пояснення продукту;
- кнопки реєстрації бізнесу або клієнта;
- візуальний preview платіжного запиту.

### 6.6. `AuthPage`

Сторінка авторизації та реєстрації.

Основна логіка:

- режим береться з query parameter `mode`, за замовчуванням `login`;
- роль при реєстрації береться з query parameter `role`, за замовчуванням `business`;
- після login/register викликається `finishAuthRedirect()`;
- якщо в URL є `redirect=/pay/:id&save=1`, після авторизації сторінка пробує автоматично зберегти інвойс для клієнта;
- якщо redirect немає, бізнес іде на `/wallets`, клієнт - на `/saved`.

Цей механізм потрібен для сценарію: клієнт відкрив інвойс, хоче його зберегти, але ще не авторизований.

### 6.7. `WalletsPage`

Сторінка керування Solana-гаманцями бізнесу.

Відповідає за:

- завантаження списку гаманців;
- створення нового гаманця;
- редагування alias/public key;
- видалення гаманця;
- показ помилок backend validation.

### 6.8. `PaymentRequestsPage`

Сторінка створення платіжних запитів.

Відповідає за:

- завантаження wallets і payment requests паралельно;
- вибір гаманця;
- введення назви платежу і суми в EUR;
- створення payment request;
- генерацію QR-коду через `qrcode.react`;
- показ останнього створеного QR.

Публічний URL для QR формується так:

```js
const paymentOrigin = (
  import.meta.env.VITE_PUBLIC_PAYMENT_ORIGIN || window.location.origin
).replace(/\/$/, "");

const paymentUrl = `${paymentOrigin}/pay/${created.id}`;
```

`VITE_PUBLIC_PAYMENT_ORIGIN` потрібен, щоб QR можна було тестувати з телефону в локальній мережі.

### 6.9. `PayPage`

Публічна сторінка інвойса `/pay/:id`.

Відповідає за:

- завантаження інвойса;
- паралельну перевірку сесії;
- показ назви, суми, alias і Solana address;
- кнопку `Pay`;
- перехід на `solana:` URL;
- показ warning, якщо курс SOL/EUR недоступний;
- логіку збереження інвойса клієнтом.

Якщо користувач не авторизований, сторінка показує посилання на login/register з параметрами:

```text
/auth?mode=login&redirect=/pay/:id&save=1
/auth?mode=register&role=client&redirect=/pay/:id&save=1
```

### 6.10. `SavedInvoicesPage`

Сторінка клієнта.

Відповідає за:

- завантаження `/api/saved-invoices`;
- показ таблиці збережених інвойсів;
- посилання для повторного відкриття `/pay/:id`.

### 6.11. `InvoicesPage`

Сторінка бізнесу для керування HTML-шаблонами інвойсів.

Відповідає за:

- завантаження списку шаблонів;
- вибір шаблону з лівого списку;
- створення нового шаблону;
- відкриття fullscreen overlay редактора;
- передачу HTML у `InvoiceTemplateEditor`;
- збереження HTML через `api.createInvoiceTemplate` або `api.updateInvoiceTemplate`;
- видалення шаблонів.

Важлива логіка:

- `selectedName` - назва шаблону, який редагується.
- `selectedTemplate` - повний шаблон з HTML.
- `nameDraft` - поточна назва у полі вводу.
- `creating` - чи відкритий редактор для нового документа.
- `exportTemplate(html)` - callback, який отримує HTML з редактора і зберігає його в backend.

## 7. Редактор інвойсів

Файл `apps/frontend/src/components/InvoiceTemplateEditor.jsx` - найбільший frontend-компонент у проєкті.

Він працює не як звичайна форма, а як mini document builder.

### 7.1. Внутрішня модель елементів

Редактор зберігає документ як масив `elements`.

Є три типи елементів:

#### Text

```js
{
  id: "text-...",
  type: "text",
  x: 72,
  y: 68,
  width: 280,
  height: 52,
  text: "Invoice",
  fontSize: 36,
  fontFamily: "Arial",
  color: "#111827"
}
```

Відповідає за звичайний текст на інвойсі.

#### Input

```js
{
  id: "input-...",
  type: "input",
  name: "client_name",
  x: 455,
  y: 150,
  width: 220,
  height: 38,
  fontSize: 16,
  fontFamily: "Arial",
  color: "#111827"
}
```

Відповідає за активне поле, яке позначається в HTML як:

```html
<input active="true" name="client_name" class="invoice-input active-field">
```

Порожні input без `name` автоматично прибираються при втраті фокусу або export, щоб у шаблон не потрапляли незавершені поля.

#### Image

```js
{
  id: "image-...",
  type: "image",
  src: "data:image/png;base64,...",
  x: 96,
  y: 360,
  width: 220,
  height: 150
}
```

Відповідає за зображення. Файл читається через `FileReader` і зберігається як base64 у HTML.

### 7.2. Розмір сторінки

```js
const PAGE_SIZE = { width: 794, height: 1123 };
```

Це приблизний A4 canvas у пікселях. Усі елементи мають absolute positioning всередині `.invoice-page`.

### 7.3. Starter document

Якщо HTML не передано або його не вдалося розпарсити, редактор стартує з `STARTER_ELEMENTS`:

- заголовок `Invoice`;
- блок з адресою компанії;
- активне поле `client_name`.

### 7.4. Конвертація елементів у HTML

Функція `elementsToHtml(elements)`:

- проходить по всіх елементах;
- для кожного формує HTML через `elementToHtml`;
- додає inline styles з позицією, розміром, кольором, шрифтом;
- загортає все у:

```html
<div class="invoice-page" style="position:relative;width:794px;height:1123px;...">
  ...
</div>
```

Текст екранується через `escapeHtml`, щоб користувацький текст не ставав HTML-кодом.

### 7.5. Імпорт HTML назад у редактор

Функція `parseHtmlToElements(html)`:

- парсить HTML через `DOMParser`;
- шукає `.invoice-page`, якщо її немає - бере `body`;
- проходить по дочірніх елементах;
- визначає тип за tag/class:
  - `input` або `.invoice-input` -> input;
  - `img` або `.invoice-image` -> image;
  - `div` або `.invoice-text` -> text;
- читає inline styles: `left`, `top`, `width`, `height`, `fontSize`, `fontFamily`, `color`;
- створює внутрішні `elements`.

Це дозволяє збережений шаблон відкрити знову і редагувати у тому ж редакторі.

### 7.6. Drag & resize

Редактор використовує `react-rnd`.

Кожен елемент загорнутий у `<Rnd>`:

- `position` береться з `element.x/y`;
- `size` береться з `element.width/height`;
- `bounds=".invoice-page"` не дає винести елемент за межі сторінки;
- `onDragStop` оновлює `x/y`;
- `onResizeStop` оновлює позицію і розмір.

Перетягування йде тільки за `.drag-handle`, щоб редагування тексту/input не конфліктувало з drag.

### 7.7. Selection і delete

Стан:

- `selectedId` - елемент, який зараз вибраний;
- `deleteTargetId` - елемент, який готовий до видалення клавішею `Delete`.

Видалити елемент можна:

- кнопкою `Delete` у toolbar;
- клавішею `Delete`, якщо елемент був вибраний через drag handle.

### 7.8. Toolbar

Toolbar відповідає за:

- додавання `Text`;
- додавання `Active Input`;
- додавання `Image`;
- зміну шрифту;
- зміну розміру шрифту;
- зміну кольору;
- редагування `name` для active input;
- export;
- import request;
- очищення документа.

Для image стилі шрифту заблоковані, бо вони не застосовуються до зображень.

### 7.9. Export

`exportHtml()`:

1. Прибирає input-поля без `name`.
2. Конвертує elements у HTML.
3. Викликає callback `onExport(html)`.
4. `InvoicesPage` вже вирішує, чи створювати новий шаблон, чи оновлювати існуючий.

## 8. Стилі

Файл `apps/frontend/src/styles.css` містить усі глобальні стилі.

Основні блоки:

- базові змінні й глобальні стилі;
- кнопки `.button`, `.icon-button`;
- landing page;
- authenticated shell/sidebar;
- сторінки форм і таблиць;
- pay page;
- стани повідомлень `.error-box`, `.warning-box`, `.success-box`;
- layout для сторінки інвойсів;
- fullscreen overlay редактора;
- toolbar і canvas редактора;
- mobile адаптація через `@media (max-width: 880px)`.

## 9. Запуск

### 9.1. Швидкий запуск вручну

```powershell
copy .env.example .env
docker compose up -d
npm install
npm run dev
```

Після запуску:

- frontend: `http://localhost:5173`;
- backend health check: `http://localhost:4000/api/health`.

### 9.2. Запуск через `start.ps1`

Файл `start.ps1` автоматизує локальний старт:

- перевіряє наявність `npm` і `docker`;
- створює `.env` з `.env.example`, якщо його немає;
- додає `VITE_PUBLIC_PAYMENT_ORIGIN`, якщо змінної немає;
- запускає Docker Desktop, якщо Docker ще не готовий;
- запускає PostgreSQL через `docker compose up -d`;
- встановлює залежності, якщо немає `node_modules`;
- запускає frontend build;
- стартує `npm run dev`, якщо не передано `-NoDev`.

Корисні параметри:

```powershell
.\start.ps1 -NoDev
.\start.ps1 -SkipDocker
.\start.ps1 -DockerTimeoutSeconds 240
```

### 9.3. NPM scripts

У кореневому `package.json`:

| Script | Що робить |
|---|---|
| `npm run dev` | Паралельно запускає backend і frontend. |
| `npm run dev:backend` | Запускає backend через workspace. |
| `npm run dev:frontend` | Запускає frontend через workspace. |
| `npm run build` | Збирає frontend. |
| `npm test` | Запускає backend tests. |

## 10. Тестування

Тести знаходяться у `apps/backend/tests/api.test.js`.

Вони використовують:

- `vitest`;
- `supertest`;
- реальний Express app через `createApp()`;
- Sequelize sync з `force: true` перед кожним тестом.

Покриті сценарії:

- реєстрація, читання сесії, logout;
- CRUD гаманців;
- блокування business-only endpoint-ів для клієнтів;
- створення payment request;
- публічне читання інвойса;
- збереження інвойса клієнтом;
- конвертація EUR у SOL;
- CRUD HTML-шаблонів;
- блокування небезпечного HTML;
- автоматичне інкрементування назв шаблонів.

Запуск:

```powershell
npm test
```

Важливо: тести очікують доступну PostgreSQL базу з `DATABASE_URL`.

## 11. Ролі та права доступу

У системі є дві ролі:

### `business`

Може:

- керувати Solana-гаманцями;
- створювати payment requests;
- бачити власні payment requests;
- створювати, редагувати й видаляти HTML-шаблони інвойсів.

Не може:

- зберігати інвойси як клієнт через `/api/pay/:id/save`;
- дивитися `/api/saved-invoices`.

### `client`

Може:

- відкривати публічні інвойси;
- зберігати інвойси;
- переглядати власні збережені інвойси.

Не може:

- керувати гаманцями;
- створювати payment requests;
- керувати шаблонами інвойсів.

## 12. Безпека

У проєкті вже є такі базові захисти:

- паролі не зберігаються відкритим текстом, використовується `scrypt`;
- session token у БД зберігається тільки як SHA-256 hash;
- cookie є `HttpOnly`;
- використовується `SameSite=Lax`;
- business/client доступ розділений через `requireRole`;
- Solana public key валідується через `@solana/web3.js`;
- HTML шаблонів перевіряється на `<script>`, inline event handlers і `javascript:` URLs;
- `helmet` додає базові HTTP security headers;
- CORS обмежений `FRONTEND_URL`.

Обмеження, які варто враховувати:

- cookie не має прапорця `Secure`, тому для production HTTPS його треба додати;
- немає CSRF-токенів;
- HTML sanitizer дуже базовий, для production краще використати надійний sanitizer;
- немає rate limiting для auth endpoint-ів;
- немає refresh/rotation політики сесій;
- `sequelize.sync()` зручно для демо, але production зазвичай потребує міграцій.

## 13. Відомі архітектурні компроміси

Проєкт виглядає як навчальний або демо-застосунок, тому деякі рішення простіші за production-рівень:

- `Transaction.payloadText` зберігає JSON замість нормалізованих колонок.
- Список payment requests читає всі `Transaction` і фільтрує в пам'яті.
- Немає окремої таблиці для invoice line items або статусів оплати.
- Немає перевірки фактичного on-chain платежу.
- Solana Pay URL тільки відкриває гаманець, але backend не підтверджує транзакцію.
- Зображення в шаблонах зберігаються як base64 у HTML, що просто для демо, але може збільшувати розмір записів.
- Frontend локалізований частково: README українською, але UI тексти здебільшого англійською.

## 14. Як додавати нову функціональність

### Додати новий backend endpoint

1. Створити або змінити файл у `apps/backend/src/routes`.
2. Обгорнути async handler через `asyncRoute`.
3. Для помилок використовувати `httpError`.
4. Якщо потрібна авторизація, підключити route у `app.js` з `authenticate` і `requireRole`.
5. Додати тест у `apps/backend/tests/api.test.js`.

### Додати нову таблицю

1. Додати модель у `apps/backend/src/models/index.js`.
2. Описати поля через Sequelize `DataTypes`.
3. Додати зв'язки між моделями.
4. Перезапустити backend, щоб `sequelize.sync()` створив таблицю.
5. Для production краще замінити це на міграції.

### Додати новий frontend API метод

1. Додати метод в `apps/frontend/src/services/api.js`.
2. Використати його у сторінці або компоненті.
3. Обробляти помилки через `try/catch` і показувати `.error-box`.

### Додати нову сторінку

1. Створити компонент у `apps/frontend/src/pages`.
2. Додати route у `main.jsx`.
3. Якщо сторінка має бути в authenticated layout, додати її всередину route з `AppShell`.
4. Якщо треба пункт меню, змінити `AppShell.jsx`.

## 15. Коротка мапа відповідальностей файлів

| Файл | Відповідальність |
|---|---|
| `README.md` | Короткий опис і запуск. |
| `DOCUMENTATION_UA.md` | Повна документація логіки проєкту. |
| `docker-compose.yml` | PostgreSQL для локальної розробки. |
| `start.ps1` | Автоматизований запуск на Windows/PowerShell. |
| `package.json` | Root workspace scripts. |
| `apps/backend/src/server.js` | Старт backend, DB sync, listen. |
| `apps/backend/src/app.js` | Express app, middleware, routes. |
| `apps/backend/src/config/env.js` | Env-конфіг backend. |
| `apps/backend/src/db/sequelize.js` | Sequelize connection. |
| `apps/backend/src/models/index.js` | Усі моделі й зв'язки БД. |
| `apps/backend/src/middleware/auth.js` | Авторизація і ролі. |
| `apps/backend/src/middleware/errorHandler.js` | 404 і централізовані помилки. |
| `apps/backend/src/routes/auth.js` | Register/login/logout/session. |
| `apps/backend/src/routes/wallets.js` | CRUD Solana-гаманців. |
| `apps/backend/src/routes/paymentRequests.js` | Створення/list payment requests. |
| `apps/backend/src/routes/pay.js` | Публічний інвойс, save, Solana URL. |
| `apps/backend/src/routes/invoiceTemplates.js` | CRUD HTML-шаблонів. |
| `apps/backend/src/services/passwordService.js` | Хешування і перевірка паролів. |
| `apps/backend/src/services/sessionService.js` | Cookie-сесії. |
| `apps/backend/src/services/priceService.js` | Курс SOL/EUR з CoinGecko. |
| `apps/backend/src/services/solanaService.js` | Solana address validation і Solana Pay URL. |
| `apps/backend/src/utils/http.js` | HTTP helpers, amount parsing, JSON payload parsing. |
| `apps/backend/tests/api.test.js` | Інтеграційні API тести. |
| `apps/frontend/vite.config.js` | Vite, envDir, dev proxy. |
| `apps/frontend/src/main.jsx` | React routes. |
| `apps/frontend/src/services/api.js` | Frontend API client. |
| `apps/frontend/src/components/AppShell.jsx` | Authenticated layout і sidebar. |
| `apps/frontend/src/components/InvoiceTemplateEditor.jsx` | Візуальний HTML-редактор інвойсів. |
| `apps/frontend/src/pages/LandingPage.jsx` | Публічна стартова сторінка. |
| `apps/frontend/src/pages/AuthPage.jsx` | Login/register і redirect після auth. |
| `apps/frontend/src/pages/WalletsPage.jsx` | UI для гаманців. |
| `apps/frontend/src/pages/PaymentRequestsPage.jsx` | UI для payment requests і QR. |
| `apps/frontend/src/pages/PayPage.jsx` | Публічна сторінка оплати. |
| `apps/frontend/src/pages/SavedInvoicesPage.jsx` | UI збережених інвойсів клієнта. |
| `apps/frontend/src/pages/InvoicesPage.jsx` | UI керування HTML-шаблонами. |
| `apps/frontend/src/styles.css` | Усі стилі застосунку. |

