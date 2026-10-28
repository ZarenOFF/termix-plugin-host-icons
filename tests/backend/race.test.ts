import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Router } from "express";
import {
  createMockCtx,
  createTestDb,
  type TestDb,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import { activate } from "../../src/backend/index.js";
import { MAX_ICONS, MAX_TOTAL_BYTES } from "../../src/backend/library.js";

// Two uploads that both pass the room check before either one inserts: the
// check is stubbed to always pass, so only the check after the insert is left.
vi.mock("../../src/backend/library.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/backend/library.js")>()),
  hasRoom: async () => true,
}));

const pluginDir = fileURLToPath(new URL("../..", import.meta.url));
const manifest = manifestJson as unknown as PluginManifest;
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

let db: TestDb;
let server: http.Server;
let post: (name: string) => Promise<number>;

beforeEach(async () => {
  db = await createTestDb(pluginDir);
  db.sqlite
    .prepare("INSERT INTO users (id, username) VALUES (?, ?)")
    .run("alice", "alice");
  let router: Router | null = null;
  const mock = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    db: db.database,
    router: () => (router = express.Router()),
    permissions: ["host-icons.upload"],
  });
  await activate(mock.ctx);
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((_req, _res, next) => {
    mock.setActor("alice");
    next();
  });
  app.use((req, res, next) => router!(req, res, next));
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  post = async (name) =>
    (
      await fetch(`http://127.0.0.1:${port}/icons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, kind: "svg", data: SVG }),
      })
    ).status;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
});

const insert = (id: string, name: string, data: string) =>
  db.sqlite
    .prepare(
      "INSERT INTO p_host_icons_icons (sync_id, name, kind, data, tint, uploaded_by) VALUES (?, ?, 'svg', ?, 0, 'alice')",
    )
    .run(id, name, data);
const count = () =>
  (
    db.sqlite.prepare("SELECT count(*) AS n FROM p_host_icons_icons").get() as {
      n: number;
    }
  ).n;

describe("uploads that race past the room check", () => {
  it("keep the icon count at the limit", async () => {
    for (let i = 0; i < MAX_ICONS - 1; i++) {
      insert(
        `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        `i${i}`,
        SVG,
      );
    }
    const a = await post("a");
    const b = await post("b");
    expect([a, b].sort()).toEqual([201, 409]);
    expect(count()).toBe(MAX_ICONS);
  });

  it("keep the stored data within 10 MB", async () => {
    insert(
      "00000000-0000-4000-8000-000000000001",
      "big",
      "x".repeat(MAX_TOTAL_BYTES - SVG.length - 5),
    );
    expect(await post("fits")).toBe(201);
    expect(await post("too much")).toBe(409);
    expect(count()).toBe(2);
  });
});
