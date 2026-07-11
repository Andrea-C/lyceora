import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

// Local-dev stand-in for Postgres (no Docker on this machine). Persists to
// .superpowers/devdb so restarts keep data; exposes a real TCP/Postgres wire
// protocol on 5502 so node-postgres (pg.Pool) and drizzle-kit can connect
// via DATABASE_URL exactly as they would against real Postgres.
const dataDir = fileURLToPath(new URL("../../../.superpowers/devdb", import.meta.url));
mkdirSync(dataDir, { recursive: true });

async function main() {
  const db = new PGlite(dataDir);
  await db.waitReady;

  const server = new PGLiteSocketServer({
    db,
    port: 5502,
    host: "127.0.0.1",
    maxConnections: 10
  });
  await server.start();
  console.log("ready");

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
