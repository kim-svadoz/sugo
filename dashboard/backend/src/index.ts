import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { config } from "./config.js";
import { initDb } from "./db/init.js";
import type { DbClient } from "./db/client.js";
import { createSyncRouter } from "./routes/sync.js";
import { createActivityRouter } from "./routes/activity.js";
import { createWorkspacesRouter } from "./routes/workspaces.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

export async function createApp(dbOverride?: DbClient) {
  const db = dbOverride ?? (await initDb());
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: pkg.version, build: process.env.BUILD_ID ?? "dev" });
  });

  app.use("/api/sync", createSyncRouter(db));
  app.use("/api/activity", createActivityRouter(db));
  app.use("/api/workspaces", createWorkspacesRouter(db));

  return { app, db };
}

async function main() {
  const { app } = await createApp();
  app.listen(config.port, () => {
    console.log(`sugo-dashboard-backend listening on :${config.port} (db=${config.dbDriver})`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
