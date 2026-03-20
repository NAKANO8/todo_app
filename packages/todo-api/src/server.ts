// server.ts
import "dotenv/config";
import { buildApp } from "./app";

const PORT = Number(process.env.PORT) || 3001;

async function start() {
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
