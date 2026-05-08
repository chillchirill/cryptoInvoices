import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { sequelize } from "./db/sequelize.js";
import "./models/index.js";

async function start() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  createApp().listen(env.port, () => {
    console.log(`${env.appName} API listening on http://localhost:${env.port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
