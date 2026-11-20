import { createServer } from "./app";
import { configFromEnv } from "./config";

const config = configFromEnv();
const server = await createServer(config);
console.log(`[server] listening on ${server.url} (db ${config.databaseUrl.replace(/:[^:@/]+@/, ":***@")})`);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`[server] ${signal}: shutting down`);
  await server.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
