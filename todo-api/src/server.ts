// server.ts
import { config } from "dotenv";
config({ quiet: true });
import { buildApp } from "./app";
import { pool } from "./db/client";

const PORT = Number(process.env.PORT) || 3001;

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connection established');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }

  try {
    const app = await buildApp();
    const address = await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🚀 Server running at ${address}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
