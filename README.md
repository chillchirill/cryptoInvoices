# QR Pay

QR Pay is a web app for creating invoice-based QR payment requests for Solana wallet payments.
It is designed for businesses that need a simple way to prepare an invoice, generate a payment
link, and let a client open the invoice from a QR code.

Pairhold website: https://pairhold.com

## What It Does

QR Pay helps a business turn an invoice template into a client-ready payment page.

A business user can create reusable invoice templates, add Solana wallet addresses, fill invoice
details, and generate a QR code. The client scans the QR code or opens the payment link, reviews
the invoice, and continues to payment from a wallet.

## Main Features

- Business and client accounts.
- Solana wallet management for business users.
- Visual invoice template editor.
- PDF extraction for turning an existing PDF invoice into an editable template.
- QR code generation for payment requests.
- Public payment page for each generated request.
- Saved invoices for client accounts.
- EUR to SOL payment flow with live conversion.

## Basic Workflow

1. Register or sign in as a business user.
2. Add a Solana wallet address in the wallet section.
3. Create an invoice template or extract one from a PDF.
4. Edit the template and add the fields that should be filled later.
5. Create a payment request from the template.
6. Fill the generated form fields, choose the wallet, and create the QR code.
7. Share the QR code or payment link with the client.
8. The client opens the link, reviews the invoice, and pays from a Solana wallet.

## Invoice Templates

Invoice templates are reusable documents. They define how the invoice looks and which values must
be entered when a payment request is created.

You can create a new template from the editor or import an existing invoice from a PDF. After
reviewing the layout, use **Export** to save the template.

## Regular Editing vs Blue Active Fields

The editor has two different kinds of content.

**Regular editing** is for static invoice content. Use it for titles, company information, labels,
descriptions, images, layout, and any text that should always stay the same in the template.

**Blue Active Input fields** are dynamic fields. These blue fields are not just visual elements:
they become form inputs when you create a payment request from the template. Whatever you type into
those generated form inputs will appear in the final invoice/payment page.

For example, if you add blue active fields named `client_name`, `money`, and `message`, the payment
request form will ask for those values. After the QR code is created, the invoice page will show
the values you entered.

Every invoice template must include these required blue active fields:

- `money` - the payment amount in EUR.
- `message` - the invoice title, purpose, or payment description.

You can add more blue active fields for custom information such as `client_name`, `invoice_number`,
`project`, `due_date`, or `notes`.

## Creating a QR Payment Request

After saving at least one wallet and one invoice template:

1. Open the payment requests page.
2. Select the wallet that should receive the payment.
3. Select the invoice template.
4. Fill the form fields generated from the template's blue active fields.
5. Click **Create QR**.

The app creates a payment endpoint and displays a QR code. The payment link opens a public invoice
page where the client can review the payment details.

## Client Experience

A client can scan the QR code or open the payment link directly. The payment page shows the invoice
details, wallet information, and payment action. If the client is signed in, the invoice can also be
saved to the client's account.

## Local Development

Run the app locally with:

```powershell
copy .env.example .env
docker compose up -d
npm install
npm run dev
```

Frontend: http://localhost:5173

Backend health check: http://localhost:4000/api/health

For phone testing on the same network, set the public payment origin in `.env` to the address your
phone can reach, for example:

```env
VITE_PUBLIC_PAYMENT_ORIGIN=http://192.168.137.1:5173
```

For production or hosted use, replace that value with your real domain.
