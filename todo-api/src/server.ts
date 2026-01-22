// server.ts
import "dotenv/config";
import { app } from "./app";

const PORT = Number(process.env.PORT) || 3001;

app.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`🚀 Server running at ${address}`);
});

