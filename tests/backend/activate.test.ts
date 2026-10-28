import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import express from "express";
import { createMockCtx, createTestDb } from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import { activate, deactivate } from "../../src/backend/index.js";

const pluginDir = fileURLToPath(new URL("../..", import.meta.url));
const manifest = manifestJson as unknown as PluginManifest;

async function context() {
  const db = await createTestDb(pluginDir);
  const mock = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    db: db.database,
    router: () => express.Router(),
  });
  return { db, mock };
}

describe("backend", () => {
  it("activates and deactivates with the capabilities the manifest asks for", async () => {
    const { db, mock } = await context();
    await expect(activate(mock.ctx)).resolves.toBeUndefined();
    await expect(deactivate()).resolves.toBeUndefined();
    db.close();
  });

  it("activates twice, as when the plugin is disabled and enabled", async () => {
    const { db, mock } = await context();
    await activate(mock.ctx);
    await deactivate();
    const second = createMockCtx({
      pluginId: manifest.id,
      manifest,
      capabilities: manifest.capabilities,
      db: db.database,
      router: () => express.Router(),
    });
    await expect(activate(second.ctx)).resolves.toBeUndefined();
    await deactivate();
    db.close();
  });

  it("asks for the database and the routes, and nothing riskier", () => {
    expect([...manifest.capabilities].sort()).toEqual([
      "db:own",
      "network:serve",
      "ui:surface",
    ]);
  });
});
