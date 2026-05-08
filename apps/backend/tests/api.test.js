import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { sequelize } from "../src/db/sequelize.js";
import "../src/models/index.js";

const validSolanaAddress = "11111111111111111111111111111111";

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
});

describe("invoice templates", () => {
  it("lets business users create, list, read, update and delete templates", async () => {
    const agent = request.agent(createApp());
    await register(agent, "templates@example.com");

    const created = await agent
      .post("/api/invoice-templates")
      .send({ html: '<div class="invoice-page"><input active="true" name="client_name"></div>' })
      .expect(201);

    expect(created.body.name).toBe("Invoice template");

    const list = await agent.get("/api/invoice-templates").expect(200);
    expect(list.body).toHaveLength(1);

    const read = await agent.get(`/api/invoice-templates/${encodeURIComponent(created.body.name)}`).expect(200);
    expect(read.body.html).toContain("client_name");

    const updated = await agent
      .put(`/api/invoice-templates/${encodeURIComponent(created.body.name)}`)
      .send({ name: "Sales invoice", html: '<div class="invoice-page"><input active="true" name="amount"></div>' })
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
  });

  it("increments automatic template names", async () => {
    const agent = request.agent(createApp());
    await register(agent, "auto-name@example.com");

    const first = await agent.post("/api/invoice-templates").send({ html: "<div>one</div>" }).expect(201);
    const second = await agent.post("/api/invoice-templates").send({ html: "<div>two</div>" }).expect(201);

    expect(first.body.name).toBe("Invoice template");
    expect(second.body.name).toBe("Invoice template 2");
  });
});
