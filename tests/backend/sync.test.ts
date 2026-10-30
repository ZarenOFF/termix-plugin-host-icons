import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createMockCtx, createTestDb } from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import { activate } from "../../src/backend/index.js";
import { MAX_ICONS, MAX_TOTAL_BYTES } from "../../src/backend/library.js";

const pluginDir = fileURLToPath(new URL("../..", import.meta.url));
const manifest = manifestJson as unknown as PluginManifest;

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

type Deserialize = NonNullable<ReturnType<typeof entity>["deserialize"]>;
let db: Awaited<ReturnType<typeof createTestDb>>;
let registered: Awaited<ReturnType<typeof setup>>;

async function setup() {
  const mock = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    db: db.database,
    router: () => express.Router(),
  });
  await activate(mock.ctx);
  return mock;
}

function entity() {
  return registered.syncEntities[0]!;
}

function shared() {
  return registered.syncEntities.find((e) => e.type === "sharedIcons")!;
}

const resolveId = async () => null;
const wire = (extra: Record<string, unknown> = {}) => ({
  syncId: "a",
  name: "Logo",
  kind: "svg",
  data: SVG,
  tint: false,
  ...extra,
});
const incoming = (row: Record<string, unknown>) =>
  (entity().deserialize as Deserialize)(row, resolveId);

beforeEach(async () => {
  db = await createTestDb(pluginDir);
  for (const user of ["alice", "bob"]) {
    db.sqlite
      .prepare("INSERT INTO users (id, username) VALUES (?, ?)")
      .run(user, user);
  }
  registered = await setup();
});

afterEach(() => db.close());

describe("sync registration", () => {
  it("is declared in the manifest under the same name", () => {
    expect(manifest.contributes?.syncEntities).toEqual([
      "icons",
      "sharedIcons",
    ]);
    expect(registered.syncEntities.map((e) => e.type)).toEqual([
      "icons",
      "sharedIcons",
    ]);
  });

  it("registers the own icons owned by the uploader", () => {
    expect(entity()).toMatchObject({
      type: "icons",
      userColumn: "uploadedBy",
      permissions: { create: "host-icons.upload" },
    });
    expect(entity().table).toBeDefined();
  });

  it("needs the upload permission to create, and nothing to change or delete", () => {
    expect(entity().permissions).toEqual({ create: "host-icons.upload" });
  });
});

describe("sync deserialize", () => {
  it("keeps a valid row and stores the sanitized SVG", async () => {
    const row = await incoming(
      wire({
        data: SVG.replace(
          "<path",
          '<script>alert(1)</script><path onclick="x"',
        ),
        tint: true,
        syncId: "a",
      }),
    );
    expect(row).toMatchObject({
      name: "Logo",
      kind: "svg",
      data: SVG,
      tint: true,
    });
  });

  it("trims the name and reads tint sent as 0 or 1", async () => {
    expect(await incoming(wire({ name: "  Pad ", tint: 1 }))).toMatchObject({
      name: "Pad",
      tint: true,
    });
    expect(await incoming(wire({ tint: 0 }))).toMatchObject({ tint: false });
    expect(await incoming(wire({ tint: undefined }))).toMatchObject({
      tint: false,
    });
  });

  it("rejects what the upload route rejects", async () => {
    const bad: Array<Record<string, unknown>> = [
      wire({ name: "" }),
      wire({ name: "x".repeat(65) }),
      wire({ kind: "gif" }),
      wire({ tint: "yes" }),
      wire({ data: "<html/>" }),
      wire({ data: 42 }),
      wire({ kind: "png", data: SVG }),
      wire({ kind: "png", data: "A".repeat(400_000) }),
      wire({ data: `<svg xmlns="http://www.w3.org/2000/svg"/>` }),
    ];
    for (const row of bad) {
      await expect(
        incoming(row),
        JSON.stringify(row).slice(0, 60),
      ).rejects.toThrow();
    }
  });

  it("rejects a row without a usable syncId", async () => {
    for (const syncId of [undefined, null, "", 7, {}]) {
      await expect(incoming(wire({ syncId }))).rejects.toThrow(/syncId/);
    }
  });

  it("rejects a new icon once the library is full", async () => {
    const insert = db.sqlite.prepare(
      "INSERT INTO p_host_icons_icons (sync_id, name, kind, data, uploaded_by) VALUES (?, ?, 'svg', ?, 'alice')",
    );
    for (let i = 0; i < MAX_ICONS; i++) insert.run(`s${i}`, `i${i}`, SVG);
    await expect(incoming(wire({ syncId: "new" }))).rejects.toThrow(/full/);
    // A change to an icon that is already stored still fits.
    await expect(incoming(wire({ syncId: "s0" }))).resolves.toBeTruthy();
  });

  it("rejects an icon that would pass 10 MB", async () => {
    db.sqlite
      .prepare(
        "INSERT INTO p_host_icons_icons (sync_id, name, kind, data, uploaded_by) VALUES ('big', 'big', 'svg', ?, 'alice')",
      )
      .run("x".repeat(MAX_TOTAL_BYTES - 10));
    await expect(incoming(wire({ syncId: "new" }))).rejects.toThrow(/full/);
    await expect(incoming(wire({ syncId: "big" }))).resolves.toBeTruthy();
  });
});

describe("shared icons", () => {
  const stored = (syncId: string, uploadedBy: string, extra = "") =>
    db.sqlite
      .prepare(
        `INSERT INTO p_host_icons_icons (sync_id, name, kind, data, tint, uploaded_by) VALUES (?, ?, 'svg', ?, ${extra === "tint" ? 1 : 0}, ?)`,
      )
      .run(syncId, `Icon ${syncId}`, SVG, uploadedBy);
  const copies = () =>
    db.sqlite
      .prepare(
        "SELECT user_id, sync_id, name, kind, data, tint FROM p_host_icons_shared_icons ORDER BY user_id, sync_id",
      )
      .all();
  const write = (userId: string, row: Record<string, unknown>) =>
    shared().write!(userId, row);

  it("is a read only entity with no table of its own", () => {
    expect(shared()).toMatchObject({ table: null, readOnly: true });
    expect(shared().load).toBeTypeOf("function");
    expect(shared().write).toBeTypeOf("function");
    expect(shared().erase).toBeTypeOf("function");
  });

  it("loads the icons other people uploaded, without the uploader", async () => {
    stored("mine", "alice");
    stored("theirs", "bob", "tint");
    const rows = await shared().load!("alice");
    expect(rows).toEqual([
      {
        syncId: "theirs",
        name: "Icon theirs",
        kind: "svg",
        data: SVG,
        tint: true,
      },
    ]);
    expect((await shared().load!("bob")).map((r) => r.syncId)).toEqual([
      "mine",
    ]);
  });

  it("keeps a sanitized copy for the user and replaces it on change", async () => {
    await write(
      "alice",
      wire({
        syncId: "b1",
        data: SVG.replace("<path", "<script>x</script><path"),
        tint: 1,
      }),
    );
    expect(copies()).toEqual([
      {
        user_id: "alice",
        sync_id: "b1",
        name: "Logo",
        kind: "svg",
        data: SVG,
        tint: 1,
      },
    ]);
    await write("alice", wire({ syncId: "b1", name: "Renamed", tint: false }));
    expect(copies()).toMatchObject([
      { sync_id: "b1", name: "Renamed", tint: 0 },
    ]);
  });

  it("stores one copy when two writes of the same icon race", async () => {
    await Promise.all([
      write("alice", wire({ syncId: "b1", name: "First" })),
      write("alice", wire({ syncId: "b1", name: "Second" })),
    ]);
    expect(copies()).toHaveLength(1);
  });

  it("keeps copies apart per user and erases only the one asked for", async () => {
    await write("alice", wire({ syncId: "b1" }));
    await write("bob", wire({ syncId: "b1" }));
    await write("alice", wire({ syncId: "b2" }));
    await shared().erase!("alice", "b1");
    expect(copies().map((r: any) => `${r.user_id}:${r.sync_id}`)).toEqual([
      "alice:b2",
      "bob:b1",
    ]);
  });

  it("persists every write and erase", async () => {
    const before = db.persisted;
    await write("alice", wire({ syncId: "b1" }));
    await shared().erase!("alice", "b1");
    expect(db.persisted).toBe(before + 2);
  });

  it("rejects what the upload route rejects and stores nothing", async () => {
    for (const row of [
      wire({ syncId: "" }),
      wire({ syncId: 7 }),
      wire({ name: "" }),
      wire({ kind: "gif" }),
      wire({ data: "<html/>" }),
    ]) {
      await expect(write("alice", row)).rejects.toThrow();
    }
    expect(copies()).toEqual([]);
  });

  it("does not count copies against the library limits", async () => {
    await write("alice", wire({ syncId: "b1" }));
    const insert = db.sqlite.prepare(
      "INSERT INTO p_host_icons_icons (sync_id, name, kind, data, uploaded_by) VALUES (?, ?, 'svg', ?, 'alice')",
    );
    for (let i = 0; i < MAX_ICONS - 1; i++) insert.run(`s${i}`, `i${i}`, SVG);
    await expect(incoming(wire({ syncId: "new" }))).resolves.toBeTruthy();
  });
});
