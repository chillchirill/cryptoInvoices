import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { sequelize } from "../src/db/sequelize.js";
import { Invoice, InvoiceTemplate } from "../src/models/index.js";
import { extractActiveFields } from "../src/utils/invoiceFields.js";

const validSolanaAddress = "11111111111111111111111111111111";
const requiredInputsHtml = '<input active="true" name="money"><input active="true" name="message">';

function makePdfBuffer(text = "Invoice PDF") {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  const stream = `BT /F1 24 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

async function register(agent, email, role = "business") {
  return agent
    .post("/api/auth/register")
    .send({ email, password: "password123", role })
    .expect(201);
}

beforeAll(async () => {
  await sequelize.authenticate();
});

beforeEach(async () => {
  await sequelize.sync({ force: true });
  vi.restoreAllMocks();
});

afterAll(async () => {
  await sequelize.close();
});

describe("auth", () => {
  it("registers, reads session and logs out", async () => {
    const agent = request.agent(createApp());

    const registerResponse = await register(agent, "business@example.com");
    expect(registerResponse.headers["set-cookie"]?.[0]).toContain("qrpay_session");

    const session = await agent.get("/api/auth/session").expect(200);
    expect(session.body.authenticated).toBe(true);
    expect(session.body.user.email).toBe("business@example.com");

    await agent.post("/api/auth/logout").send({}).expect(200);
    const afterLogout = await agent.get("/api/auth/session").expect(200);
    expect(afterLogout.body.authenticated).toBe(false);
  });
});

describe("wallets and roles", () => {
  it("lets business users manage their own wallets", async () => {
    const agent = request.agent(createApp());
    await register(agent, "owner@example.com");

    await agent.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    const list = await agent.get("/api/wallets").expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].alias).toBe("main");

    await agent.put("/api/wallets/main").send({ alias: "sales", publicKey: validSolanaAddress }).expect(200);
    await agent.delete("/api/wallets/sales").expect(200);
  });

  it("blocks clients from business-only endpoints", async () => {
    const agent = request.agent(createApp());
    await register(agent, "client@example.com", "client");

    await agent.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(403);
    await agent.post("/api/payment-requests").send({ walletAlias: "main", name: "Order", amountEur: 10 }).expect(403);
  });
});

describe("payment requests", () => {
  it("extracts active fields from invoice template HTML", () => {
    const html = `
      <input active="true" name="money">
      <input active="true" name="message">
      <input data-active="true" data-name="client_name">
      <input class="invoice-input" value="name">
      <input class="active-field" name="money">
      <input name="ignored">
    `;

    expect(extractActiveFields(html)).toEqual([
      { name: "money" },
      { name: "message" },
      { name: "client_name" },
      { name: "name" }
    ]);
  });

  it("creates a random endpoint and public invoice", async () => {
    const agent = request.agent(createApp());
    await register(agent, "merchant@example.com");
    await agent.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);

    const created = await agent
      .post("/api/payment-requests")
      .send({ walletAlias: "main", name: "Consulting", amountEur: 25 })
      .expect(201);

    expect(created.body.id).toHaveLength(14);
    expect(created.body.address).toBe(validSolanaAddress);
    expect(created.body.amountEur).toBe("25.00");

    const publicInvoice = await request(createApp()).get(`/api/pay/${created.body.id}`).expect(200);
    expect(publicInvoice.body.name).toBe("Consulting");
  });

  it("creates a templated invoice from arbitrary active fields", async () => {
    const agent = request.agent(createApp());
    await register(agent, "templated-merchant@example.com");
    await agent.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    await agent
      .post("/api/invoice-templates")
      .send({
        name: "Sales invoice",
        html: `
          <div class="invoice-page">
            <input active="true" name="money">
            <input active="true" name="message">
            <input active="true" name="client_name">
            <input active="true" name="project">
            <input active="true" name="custom_note">
          </div>
        `
      })
      .expect(201);

    const created = await agent
      .post("/api/payment-requests")
      .send({
        walletAlias: "main",
        templateName: "Sales invoice",
        fields: { money: "25", message: "Invoice A-100", client_name: "Ada", project: "Consulting", custom_note: "" }
      })
      .expect(201);

    expect(created.body.id).toHaveLength(14);
    expect(created.body.templateName).toBe("Sales invoice");
    expect(created.body.fields).toEqual({
      money: "25.00",
      message: "Invoice A-100",
      client_name: "Ada",
      project: "Consulting",
      custom_note: ""
    });

    const stored = await Invoice.findByPk(created.body.id);
    expect(stored.senderUserId).toBeTruthy();
    expect(stored.receiverUserId).toBeNull();
    expect(stored.fieldValues.money).toBe("25.00");
    expect(stored.fieldValues.message).toBe("Invoice A-100");
    expect(stored.fieldValues.client_name).toBe("Ada");
    expect(stored.fieldValues.project).toBe("Consulting");
    expect(stored.fieldValues.custom_note).toBe("");

    const publicInvoice = await request(createApp()).get(`/api/pay/${created.body.id}`).expect(200);
    expect(publicInvoice.body.saved).toBe(false);
    expect(publicInvoice.body.fieldValues.client_name).toBe("Ada");
  });

  it("allows missing and empty arbitrary template fields", async () => {
    const agent = request.agent(createApp());
    await register(agent, "arbitrary-merchant@example.com");
    await agent.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    await agent
      .post("/api/invoice-templates")
      .send({
        name: "No required fields",
        html: `<div class="invoice-page">${requiredInputsHtml}<input active="true" name="client_name"><input active="true" name="notes"></div>`
      })
      .expect(201);

    const created = await agent
      .post("/api/payment-requests")
      .send({ walletAlias: "main", templateName: "No required fields", fields: { money: "12", message: "Optional test", client_name: "Ada" } })
      .expect(201);

    expect(created.body.fields).toEqual({ money: "12.00", message: "Optional test", client_name: "Ada", notes: "" });
  });

  it("rejects templated payment requests with missing or invalid money", async () => {
    const agent = request.agent(createApp());
    await register(agent, "invalid-money@example.com");
    await agent.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    await agent
      .post("/api/invoice-templates")
      .send({
        name: "Money invoice",
        html: `<div class="invoice-page">${requiredInputsHtml}</div>`
      })
      .expect(201);

    await agent
      .post("/api/payment-requests")
      .send({ walletAlias: "main", templateName: "Money invoice", fields: { message: "Missing money" } })
      .expect(400);

    await agent
      .post("/api/payment-requests")
      .send({ walletAlias: "main", templateName: "Money invoice", fields: { money: "0", message: "Bad money" } })
      .expect(400);
  });

  it("attaches a templated invoice when a logged-in client scans it", async () => {
    const business = request.agent(createApp());
    await register(business, "scan-merchant@example.com");
    await business.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    await business
      .post("/api/invoice-templates")
      .send({
        name: "Scan invoice",
        html: `<div class="invoice-page">${requiredInputsHtml}<input active="true" name="client"><input active="true" name="invoice_code"></div>`
      })
      .expect(201);
    const created = await business
      .post("/api/payment-requests")
      .send({
        walletAlias: "main",
        templateName: "Scan invoice",
        fields: { money: "80", message: "Design", client: "Buyer", invoice_code: "A-100" }
      })
      .expect(201);

    const anonymous = await request(createApp()).get(`/api/pay/${created.body.id}`).expect(200);
    expect(anonymous.body.saved).toBe(false);
    expect((await Invoice.findByPk(created.body.id)).receiverUserId).toBeNull();

    const client = request.agent(createApp());
    const registered = await register(client, "scan-client@example.com", "client");
    const scanned = await client.get(`/api/pay/${created.body.id}`).expect(200);
    expect(scanned.body.saved).toBe(true);
    expect((await Invoice.findByPk(created.body.id)).receiverUserId).toBe(registered.body.user.id);

    const list = await client.get("/api/saved-invoices").expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  it("saves a templated invoice after client authentication", async () => {
    const business = request.agent(createApp());
    await register(business, "redirect-merchant@example.com");
    await business.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    await business
      .post("/api/invoice-templates")
      .send({
        name: "Redirect invoice",
        html: `<div class="invoice-page">${requiredInputsHtml}<input active="true" name="customer"><input active="true" name="description"></div>`
      })
      .expect(201);
    const created = await business
      .post("/api/payment-requests")
      .send({
        walletAlias: "main",
        templateName: "Redirect invoice",
        fields: { money: "35", message: "After login", customer: "Client", description: "After login" }
      })
      .expect(201);

    const client = request.agent(createApp());
    const registered = await register(client, "redirect-client@example.com", "client");
    const saved = await client.post(`/api/pay/${created.body.id}/save`).send({}).expect(200);

    expect(saved.body.saved).toBe(true);
    expect((await Invoice.findByPk(created.body.id)).receiverUserId).toBe(registered.body.user.id);
  });

  it("saves invoice for a logged-in client", async () => {
    const business = request.agent(createApp());
    await register(business, "merchant2@example.com");
    await business.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    const created = await business
      .post("/api/payment-requests")
      .send({ walletAlias: "main", name: "Design", amountEur: 80 })
      .expect(201);

    const client = request.agent(createApp());
    await register(client, "buyer@example.com", "client");
    const saved = await client.post(`/api/pay/${created.body.id}/save`).send({}).expect(200);
    expect(saved.body.saved).toBe(true);

    const list = await client.get("/api/saved-invoices").expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  it("converts EUR to SOL for the wallet link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ solana: { eur: 100 } })
    })));

    const business = request.agent(createApp());
    await register(business, "merchant3@example.com");
    await business.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    const created = await business
      .post("/api/payment-requests")
      .send({ walletAlias: "main", name: "Hosting", amountEur: 50 })
      .expect(201);

    const link = await request(createApp()).get(`/api/pay/${created.body.id}/solana-url`).expect(200);
    expect(link.body.solAmount).toBe("0.500000000");
    expect(link.body.url).toContain("solana:");
    expect(link.body.url).toContain("amount=0.5");
  });

  it("uses templated money and message for the wallet link query", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ solana: { eur: 100 } })
    })));

    const business = request.agent(createApp());
    await register(business, "templated-wallet@example.com");
    await business.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    await business
      .post("/api/invoice-templates")
      .send({
        name: "Wallet invoice",
        html: `<div class="invoice-page">${requiredInputsHtml}<input active="true" name="client_name"></div>`
      })
      .expect(201);
    const created = await business
      .post("/api/payment-requests")
      .send({
        walletAlias: "main",
        templateName: "Wallet invoice",
        fields: { money: "50", message: "Invoice A-100", client_name: "Ada" }
      })
      .expect(201);

    const link = await request(createApp()).get(`/api/pay/${created.body.id}/solana-url`).expect(200);
    expect(link.body.solAmount).toBe("0.500000000");
    expect(link.body.url).toContain("amount=0.5");
    expect(link.body.url).toContain("message=Invoice+A-100");
    expect(link.body.url).toContain(`memo=${created.body.id}`);
  });

  it("lists business invoices newest first and only for the sender", async () => {
    const business = request.agent(createApp());
    await register(business, "invoice-list@example.com");
    await business.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    await business
      .post("/api/invoice-templates")
      .send({
        name: "Archive invoice",
        html: `<div class="invoice-page">${requiredInputsHtml}<input active="true" name="client_name"></div>`
      })
      .expect(201);

    const first = await business
      .post("/api/payment-requests")
      .send({
        walletAlias: "main",
        templateName: "Archive invoice",
        fields: { money: "10", message: "Older invoice", client_name: "Ada" }
      })
      .expect(201);
    const second = await business
      .post("/api/payment-requests")
      .send({
        walletAlias: "main",
        templateName: "Archive invoice",
        fields: { money: "20", message: "Newer invoice", client_name: "Grace" }
      })
      .expect(201);

    const otherBusiness = request.agent(createApp());
    await register(otherBusiness, "other-invoice-list@example.com");
    await otherBusiness.post("/api/wallets").send({ alias: "main", publicKey: validSolanaAddress }).expect(201);
    await otherBusiness
      .post("/api/invoice-templates")
      .send({
        name: "Other invoice",
        html: `<div class="invoice-page">${requiredInputsHtml}</div>`
      })
      .expect(201);
    await otherBusiness
      .post("/api/payment-requests")
      .send({
        walletAlias: "main",
        templateName: "Other invoice",
        fields: { money: "99", message: "Other business" }
      })
      .expect(201);

    const list = await business.get("/api/invoices").expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].id).toBe(second.body.id);
    expect(list.body[1].id).toBe(first.body.id);
    expect(list.body[0].title).toMatch(/^Invoice - /);
    expect(list.body[0].templateHtml).toContain("invoice-page");
    expect(list.body[0].fieldValues.message).toBe("Newer invoice");

    const client = request.agent(createApp());
    await register(client, "invoice-list-client@example.com", "client");
    await client.get("/api/invoices").expect(403);
  });
});

describe("invoice templates", () => {
  it("extracts editable template HTML from a PDF without saving it", async () => {
    const agent = request.agent(createApp());
    await register(agent, "pdf-extract@example.com");

    const response = await agent
      .post("/api/invoice-templates/extract-pdf")
      .attach("pdf", makePdfBuffer(), { filename: "invoice.pdf", contentType: "application/pdf" })
      .expect(200);

    expect(response.body.html).toContain('class="invoice-page"');
    expect(response.body.html).toContain('class="invoice-text"');
    expect(response.body.html).toContain("Invoice PDF");
    expect(response.body.html).toContain('name="money"');
    expect(response.body.html).toContain('name="message"');
    expect(response.body.warnings).toEqual([]);
    expect(await InvoiceTemplate.count()).toBe(0);
  });

  it("rejects missing and non-PDF extraction uploads", async () => {
    const agent = request.agent(createApp());
    await register(agent, "pdf-reject@example.com");

    await agent.post("/api/invoice-templates/extract-pdf").expect(400);
    await agent
      .post("/api/invoice-templates/extract-pdf")
      .attach("pdf", Buffer.from("not a pdf"), { filename: "invoice.txt", contentType: "text/plain" })
      .expect(400);
  });

  it("lets business users create, list, read, update and delete templates", async () => {
    const agent = request.agent(createApp());
    await register(agent, "templates@example.com");

    const created = await agent
      .post("/api/invoice-templates")
      .send({ html: `<div class="invoice-page">${requiredInputsHtml}<input active="true" name="client_name"></div>` })
      .expect(201);

    expect(created.body.name).toBe("Invoice template");

    const list = await agent.get("/api/invoice-templates").expect(200);
    expect(list.body).toHaveLength(1);

    const read = await agent.get(`/api/invoice-templates/${encodeURIComponent(created.body.name)}`).expect(200);
    expect(read.body.html).toContain("client_name");

    const updated = await agent
      .put(`/api/invoice-templates/${encodeURIComponent(created.body.name)}`)
      .send({ name: "Sales invoice", html: `<div class="invoice-page">${requiredInputsHtml}<input active="true" name="client_name"></div>` })
      .expect(200);
    expect(updated.body.name).toBe("Sales invoice");

    await agent.delete(`/api/invoice-templates/${encodeURIComponent(updated.body.name)}`).expect(200);
    const empty = await agent.get("/api/invoice-templates").expect(200);
    expect(empty.body).toHaveLength(0);
  });

  it("blocks clients and unsafe HTML", async () => {
    const client = request.agent(createApp());
    await register(client, "client-templates@example.com", "client");
    await client.post("/api/invoice-templates").send({ html: "<div></div>" }).expect(403);

    const business = request.agent(createApp());
    await register(business, "unsafe-templates@example.com");

    await business.post("/api/invoice-templates").send({ html: "<script>alert(1)</script>" }).expect(400);
    await business.post("/api/invoice-templates").send({ html: '<div onclick="alert(1)">x</div>' }).expect(400);
    await business.post("/api/invoice-templates").send({ html: '<a href="javascript:alert(1)">x</a>' }).expect(400);
    await business
      .post("/api/invoice-templates")
      .send({ html: '<div class="invoice-page"><input active="true" name="money"></div>' })
      .expect(400);
  });

  it("increments automatic template names", async () => {
    const agent = request.agent(createApp());
    await register(agent, "auto-name@example.com");

    const first = await agent.post("/api/invoice-templates").send({ html: `<div>${requiredInputsHtml}</div>` }).expect(201);
    const second = await agent.post("/api/invoice-templates").send({ html: `<div>${requiredInputsHtml}<input active="true" name="client"></div>` }).expect(201);

    expect(first.body.name).toBe("Invoice template");
    expect(second.body.name).toBe("Invoice template 2");
  });
});
