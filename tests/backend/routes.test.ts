import http from "node:http";
import type { AddressInfo } from "node:net";
import { crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express, { type Router } from "express";
import {
  createMockCtx,
  createTestDb,
  type TestDb,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import { activate, deactivate } from "../../src/backend/index.js";
import { MAX_ICONS, MAX_TOTAL_BYTES } from "../../src/backend/routes.js";

const pluginDir = fileURLToPath(new URL("../..", import.meta.url));
const manifest = manifestJson as unknown as PluginManifest;

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** A PNG with the right frame but no image data, which is all the checks read. */
function png(width: number, height: number, padding = 0): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", Buffer.alloc(padding)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

let db: TestDb;
let servers: http.Server[] = [];
let activations = 0;

beforeEach(async () => {
  db = await createTestDb(pluginDir);
  for (const user of ["alice", "bob", "carol"]) {
    db.sqlite
      .prepare("INSERT INTO users (id, username) VALUES (?, ?)")
      .run(user, user);
  }
});

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  servers = [];
  db.close();
});

// A server for one user with the given permissions, all on the same database.
async function serve(actor: string, permissions: string[]) {
  let router: Router | null = null;
  const mock = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    db: db.database,
    router: () => (router = express.Router()),
    permissions,
  });
  await activate(mock.ctx);
  activations++;

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((_req, _res, next) => {
    mock.setActor(actor);
    next();
  });
  app.use((req, res, next) => router!(req, res, next));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;

  return async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : undefined,
    };
  };
}

const USER = ["host-icons.upload"];
const ADMIN = ["host-icons.upload", "host-icons.manage"];
const NOBODY: string[] = [];
const MANAGER_ONLY = ["host-icons.manage"];

async function upload(
  request: Awaited<ReturnType<typeof serve>>,
  name = "Logo",
  extra: Record<string, unknown> = {},
) {
  const created = await request("POST", "/icons", {
    name,
    kind: "svg",
    data: SVG,
    ...extra,
  });
  expect(created.status).toBe(201);
  return created.body.icon as { id: string };
}

describe("manifest", () => {
  it("declares the permissions and capabilities the routes need", () => {
    expect(manifest.capabilities).toEqual(
      expect.arrayContaining(["db:own", "network:serve"]),
    );
    const permissions = manifest.contributes?.permissions ?? [];
    expect(permissions.map((p) => [p.name, p.defaultRoles])).toEqual([
      ["upload", ["admin", "user"]],
      ["manage", ["admin"]],
    ]);
  });
});

describe("GET /icons", () => {
  it("starts empty", async () => {
    const request = await serve("alice", NOBODY);
    expect(await request("GET", "/icons")).toEqual({
      status: 200,
      body: { icons: [] },
    });
  });

  it("lets a user without any permission read the whole library", async () => {
    const alice = await serve("alice", USER);
    await upload(alice, "Zebra");
    await upload(alice, "apple");
    const reader = await serve("carol", NOBODY);
    const list = await reader("GET", "/icons");
    expect(list.status).toBe(200);
    expect(list.body.icons.map((icon: { name: string }) => icon.name)).toEqual([
      "apple",
      "Zebra",
    ]);
    expect(list.body.icons[0]).toEqual({
      id: expect.any(String),
      name: "apple",
      kind: "svg",
      data: SVG,
      tint: false,
      createdAt: expect.anything(),
      canEdit: false,
    });
  });

  it("says canEdit for own icons with upload and for any icon with manage", async () => {
    const alice = await serve("alice", USER);
    await upload(alice, "Alice icon");
    const bob = await serve("bob", USER);
    await upload(bob, "Bob icon");
    const admin = await serve("carol", ADMIN);

    const mine = (await alice("GET", "/icons")).body.icons;
    expect(mine.map((i: any) => [i.name, i.canEdit])).toEqual([
      ["Alice icon", true],
      ["Bob icon", false],
    ]);
    const all = (await admin("GET", "/icons")).body.icons;
    expect(all.map((i: any) => i.canEdit)).toEqual([true, true]);
  });

  it("does not let the uploader edit once the upload permission is gone", async () => {
    const alice = await serve("alice", USER);
    await upload(alice, "Mine");
    const revoked = await serve("alice", NOBODY);
    const list = await revoked("GET", "/icons");
    expect(list.body.icons[0].canEdit).toBe(false);
  });
});

describe("POST /icons", () => {
  it("adds an SVG, sanitized, and answers with the icon", async () => {
    const alice = await serve("alice", USER);
    const created = await alice("POST", "/icons", {
      name: "  My logo  ",
      kind: "svg",
      data: SVG.replace("<path", '<script>alert(1)</script><path onclick="x"'),
      tint: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.icon).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "My logo",
      kind: "svg",
      data: SVG,
      tint: true,
      createdAt: expect.anything(),
      canEdit: true,
    });
    const list = await alice("GET", "/icons");
    expect(list.body.icons).toHaveLength(1);
    expect(list.body.icons[0].id).toBe(created.body.icon.id);
  });

  it("takes the user from the session, not from the body", async () => {
    const alice = await serve("alice", USER);
    const created = await alice("POST", "/icons", {
      name: "x",
      kind: "svg",
      data: SVG,
      uploadedBy: "bob",
    });
    expect(created.body.icon.uploadedBy).toBeUndefined();
    const stored = db.sqlite
      .prepare("SELECT uploaded_by FROM p_host_icons_icons")
      .get() as { uploaded_by: string };
    expect(stored.uploaded_by).toBe("alice");
  });

  it("adds a PNG and stores it as base64", async () => {
    const alice = await serve("alice", USER);
    const data = png(64, 48);
    const created = await alice("POST", "/icons", {
      name: "Pixel",
      kind: "png",
      data,
    });
    expect(created.status).toBe(201);
    expect(created.body.icon).toMatchObject({
      kind: "png",
      data,
      tint: false,
    });
  });

  it("persists every write", async () => {
    const alice = await serve("alice", USER);
    const before = db.persisted;
    await upload(alice);
    expect(db.persisted).toBeGreaterThan(before);
  });

  it("answers 403 without the upload permission", async () => {
    for (const permissions of [NOBODY, MANAGER_ONLY]) {
      const request = await serve("alice", permissions);
      const created = await request("POST", "/icons", {
        name: "x",
        kind: "svg",
        data: SVG,
      });
      expect(created.status).toBe(403);
    }
    const reader = await serve("alice", USER);
    expect((await reader("GET", "/icons")).body.icons).toEqual([]);
  });

  it("answers 400 for a bad name", async () => {
    const alice = await serve("alice", USER);
    for (const name of [
      "",
      "   ",
      "x".repeat(65),
      "tab\there",
      "nul\u0000",
      42,
      null,
      undefined,
      ["a"],
    ]) {
      const created = await alice("POST", "/icons", {
        name,
        kind: "svg",
        data: SVG,
      });
      expect(created.status, JSON.stringify(name)).toBe(400);
    }
    const longest = await alice("POST", "/icons", {
      name: "x".repeat(64),
      kind: "svg",
      data: SVG,
    });
    expect(longest.status).toBe(201);
  });

  it("answers 400 for a bad kind or tint", async () => {
    const alice = await serve("alice", USER);
    for (const kind of ["gif", "SVG", "", 1, null, undefined]) {
      const created = await alice("POST", "/icons", {
        name: "x",
        kind,
        data: SVG,
      });
      expect(created.status, JSON.stringify(kind)).toBe(400);
    }
    const tint = await alice("POST", "/icons", {
      name: "x",
      kind: "svg",
      data: SVG,
      tint: "yes",
    });
    expect(tint.status).toBe(400);
    expect((await alice("POST", "/icons")).status).toBe(400);
  });

  it("answers 400 for an SVG that is not an SVG, or is too big", async () => {
    const alice = await serve("alice", USER);
    for (const data of [
      "",
      "hello",
      "<html/>",
      42,
      null,
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="${"M0 0h1 ".repeat(20_000)}"/></svg>`,
    ]) {
      const created = await alice("POST", "/icons", {
        name: "x",
        kind: "svg",
        data,
      });
      expect(created.status, String(data).slice(0, 40)).toBe(400);
      expect(created.body.error).toEqual(expect.any(String));
    }
    expect((await alice("GET", "/icons")).body.icons).toEqual([]);
  });

  it("answers 400 for a PNG that is broken, too big or too large", async () => {
    const alice = await serve("alice", USER);
    const good = png(32, 32);
    const bad: Array<[string, unknown]> = [
      ["not base64", "not base64!!"],
      [
        "wrong magic",
        Buffer.from("GIF89a-not-a-png-at-all-really-not-one-no").toString(
          "base64",
        ),
      ],
      ["data url", `data:image/png;base64,${good}`],
      ["empty", ""],
      ["number", 5],
      ["513 wide", png(513, 10)],
      ["513 high", png(10, 513)],
      ["zero wide", png(0, 10)],
      ["huge dimensions", png(100_000, 100_000)],
      ["over 256 KB", png(64, 64, 256 * 1024)],
      ["cut off", good.slice(0, good.length - 20)],
      [
        "broken header checksum",
        (() => {
          const bytes = Buffer.from(good, "base64");
          bytes[20] ^= 0x01;
          return bytes.toString("base64");
        })(),
      ],
      ["gigantic string", "A".repeat(400_000)],
    ];
    for (const [label, data] of bad) {
      const created = await alice("POST", "/icons", {
        name: "x",
        kind: "png",
        data,
      });
      expect(created.status, label).toBe(400);
    }
    const edge = await alice("POST", "/icons", {
      name: "edge",
      kind: "png",
      data: png(512, 512),
    });
    expect(edge.status).toBe(201);
    const large = await alice("POST", "/icons", {
      name: "large",
      kind: "png",
      data: png(8, 8, 200 * 1024),
    });
    expect(large.status).toBe(201);
  });

  it("answers 409 once the library is full", async () => {
    const alice = await serve("alice", USER);
    const insert = db.sqlite.prepare(
      "INSERT INTO p_host_icons_icons (sync_id, name, kind, data, tint, uploaded_by) VALUES (?, ?, 'svg', ?, 0, 'alice')",
    );
    for (let i = 0; i < MAX_ICONS - 1; i++) {
      insert.run(
        `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        `i${i}`,
        SVG,
      );
    }
    expect(
      (await alice("POST", "/icons", { name: "last", kind: "svg", data: SVG }))
        .status,
    ).toBe(201);
    const full = await alice("POST", "/icons", {
      name: "one too many",
      kind: "svg",
      data: SVG,
    });
    expect(full.status).toBe(409);
    expect((await alice("GET", "/icons")).body.icons).toHaveLength(MAX_ICONS);
  });

  it("answers 409 when the stored data would pass 10 MB", async () => {
    const alice = await serve("alice", USER);
    const big = "x".repeat(MAX_TOTAL_BYTES - 10);
    db.sqlite
      .prepare(
        "INSERT INTO p_host_icons_icons (sync_id, name, kind, data, tint, uploaded_by) VALUES (?, ?, 'svg', ?, 0, 'alice')",
      )
      .run("00000000-0000-4000-8000-000000000001", "big", big);
    const full = await alice("POST", "/icons", {
      name: "tips it over",
      kind: "svg",
      data: SVG,
    });
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/full/);
    db.sqlite.prepare("DELETE FROM p_host_icons_icons").run();
    expect((await upload(alice, "fits")).id).toBeTruthy();
  });

  it("counts stored data in bytes, not characters", async () => {
    const alice = await serve("alice", USER);
    const big = "ы".repeat(MAX_TOTAL_BYTES / 2 - 10);
    db.sqlite
      .prepare(
        "INSERT INTO p_host_icons_icons (sync_id, name, kind, data, tint, uploaded_by) VALUES (?, ?, 'svg', ?, 0, 'alice')",
      )
      .run("00000000-0000-4000-8000-000000000001", "big", big);
    const full = await alice("POST", "/icons", {
      name: "tips it over",
      kind: "svg",
      data: SVG,
    });
    expect(full.status).toBe(409);
  });
});

describe("PATCH /icons/:id", () => {
  it("lets the uploader rename and retint", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice, "Old");
    const renamed = await alice("PATCH", `/icons/${id}`, { name: " New " });
    expect(renamed.status).toBe(200);
    expect(renamed.body.icon).toMatchObject({
      id,
      name: "New",
      tint: false,
      canEdit: true,
    });
    const tinted = await alice("PATCH", `/icons/${id}`, { tint: true });
    expect(tinted.body.icon).toMatchObject({ name: "New", tint: true });
    const both = await alice("PATCH", `/icons/${id}`, {
      name: "Both",
      tint: false,
    });
    expect(both.body.icon).toMatchObject({ name: "Both", tint: false });
    expect((await alice("GET", "/icons")).body.icons[0]).toMatchObject({
      name: "Both",
      tint: false,
      data: SVG,
    });
  });

  it("does not change the data, kind or owner", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice);
    await alice("PATCH", `/icons/${id}`, {
      name: "Z",
      data: "<svg/>",
      kind: "png",
      uploadedBy: "bob",
      id: "other",
    });
    expect((await alice("GET", "/icons")).body.icons[0]).toMatchObject({
      id,
      data: SVG,
      kind: "svg",
    });
    const stored = db.sqlite
      .prepare("SELECT uploaded_by FROM p_host_icons_icons")
      .get() as { uploaded_by: string };
    expect(stored.uploaded_by).toBe("alice");
  });

  it("answers 403 for someone else's icon", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice, "Alice's");
    const bob = await serve("bob", USER);
    const denied = await bob("PATCH", `/icons/${id}`, { name: "Mine now" });
    expect(denied.status).toBe(403);
    expect((await alice("GET", "/icons")).body.icons[0].name).toBe("Alice's");
  });

  it("answers 403 for the uploader without the upload permission", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice);
    const revoked = await serve("alice", NOBODY);
    expect((await revoked("PATCH", `/icons/${id}`, { name: "x" })).status).toBe(
      403,
    );
  });

  it("lets a manager change anyone's icon", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice, "Alice's");
    for (const permissions of [ADMIN, MANAGER_ONLY]) {
      const manager = await serve("carol", permissions);
      const changed = await manager("PATCH", `/icons/${id}`, {
        name: `By ${permissions.length}`,
      });
      expect(changed.status).toBe(200);
      expect(changed.body.icon).toMatchObject({
        name: `By ${permissions.length}`,
        canEdit: true,
      });
    }
  });

  it("answers 404 for an unknown or malformed id", async () => {
    const admin = await serve("carol", ADMIN);
    for (const id of [
      "00000000-0000-4000-8000-000000000000",
      "nope",
      "1; DROP TABLE x",
      "%27%20OR%201%3D1",
    ]) {
      const missing = await admin("PATCH", `/icons/${id}`, { name: "x" });
      expect(missing.status, id).toBe(404);
    }
  });

  it("answers 404 before 403, never leaking more than the list does", async () => {
    const nobody = await serve("bob", NOBODY);
    const missing = await nobody(
      "PATCH",
      "/icons/00000000-0000-4000-8000-000000000000",
      {
        name: "x",
      },
    );
    expect(missing.status).toBe(404);
  });

  it("answers 400 for a bad name, a bad tint or nothing to change", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice, "Keep");
    for (const body of [
      {},
      { name: "" },
      { name: "x".repeat(65) },
      { name: 3 },
      { tint: "true" },
      { tint: 1 },
      { other: 1 },
    ]) {
      const bad = await alice("PATCH", `/icons/${id}`, body);
      expect(bad.status, JSON.stringify(body)).toBe(400);
    }
    expect((await alice("PATCH", `/icons/${id}`)).status).toBe(400);
    expect((await alice("GET", "/icons")).body.icons[0].name).toBe("Keep");
  });
});

describe("DELETE /icons/:id", () => {
  it("lets the uploader delete their own icon", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice);
    const before = db.persisted;
    const deleted = await alice("DELETE", `/icons/${id}`);
    expect(deleted.status).toBe(204);
    expect(deleted.body).toBeUndefined();
    expect(db.persisted).toBeGreaterThan(before);
    expect((await alice("GET", "/icons")).body.icons).toEqual([]);
    expect((await alice("DELETE", `/icons/${id}`)).status).toBe(404);
  });

  it("answers 403 for someone else's icon, with or without upload", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice);
    for (const permissions of [USER, NOBODY]) {
      const other = await serve("bob", permissions);
      expect((await other("DELETE", `/icons/${id}`)).status).toBe(403);
    }
    expect((await alice("GET", "/icons")).body.icons).toHaveLength(1);
  });

  it("answers 403 for the uploader without the upload permission", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice);
    const revoked = await serve("alice", NOBODY);
    expect((await revoked("DELETE", `/icons/${id}`)).status).toBe(403);
  });

  it("lets a manager delete anyone's icon", async () => {
    const alice = await serve("alice", USER);
    const first = await upload(alice, "One");
    const second = await upload(alice, "Two");
    const admin = await serve("carol", ADMIN);
    expect((await admin("DELETE", `/icons/${first.id}`)).status).toBe(204);
    const managerOnly = await serve("carol", MANAGER_ONLY);
    expect((await managerOnly("DELETE", `/icons/${second.id}`)).status).toBe(
      204,
    );
    expect((await admin("GET", "/icons")).body.icons).toEqual([]);
  });

  it("answers 404 for an unknown or malformed id", async () => {
    const admin = await serve("carol", ADMIN);
    expect(
      (await admin("DELETE", "/icons/00000000-0000-4000-8000-000000000000"))
        .status,
    ).toBe(404);
    expect((await admin("DELETE", "/icons/nope")).status).toBe(404);
  });
});

describe("shared icons outlive their uploader", () => {
  it("keeps an icon when the user who added it is deleted", async () => {
    const alice = await serve("alice", USER);
    await upload(alice, "Stays");
    db.sqlite.prepare("DELETE FROM users WHERE id = ?").run("alice");
    const reader = await serve("bob", NOBODY);
    const list = await reader("GET", "/icons");
    expect(list.body.icons).toHaveLength(1);
    expect(list.body.icons[0].uploadedBy).toBeUndefined();
  });
});

describe("copies synced from the server", () => {
  const B1 = "11111111-1111-4111-8111-111111111111";
  const copy = (userId: string, syncId: string, name: string) =>
    db.sqlite
      .prepare(
        "INSERT INTO p_host_icons_shared_icons (user_id, sync_id, name, kind, data, tint) VALUES (?, ?, ?, 'svg', ?, 1)",
      )
      .run(userId, syncId, name, SVG);

  it("lists the caller's copies with the library, read only", async () => {
    const alice = await serve("alice", ADMIN);
    await upload(alice, "Own");
    copy("alice", B1, "Bob's");
    copy("bob", "22222222-2222-4222-8222-222222222222", "Not for alice");
    const list = await alice("GET", "/icons");
    expect(
      list.body.icons.map((icon: any) => [icon.name, icon.canEdit]),
    ).toEqual([
      ["Bob's", false],
      ["Own", true],
    ]);
    expect(list.body.icons[0]).toMatchObject({ id: B1, tint: true });
  });

  it("lists an icon once when it is also in the library", async () => {
    const alice = await serve("alice", USER);
    const { id } = await upload(alice, "Own");
    copy("alice", id, "Copy");
    const list = await alice("GET", "/icons");
    expect(list.body.icons.map((icon: any) => icon.name)).toEqual(["Own"]);
  });

  it("can't change or delete a copy", async () => {
    const alice = await serve("alice", ADMIN);
    copy("alice", B1, "Bob's");
    expect((await alice("PATCH", `/icons/${B1}`, { name: "x" })).status).toBe(
      404,
    );
    expect((await alice("DELETE", `/icons/${B1}`)).status).toBe(404);
    expect((await alice("GET", "/icons")).body.icons[0].name).toBe("Bob's");
  });
});

describe("lifecycle", () => {
  it("works again after it is disabled and enabled", async () => {
    const first = await serve("alice", USER);
    const { id } = await upload(first, "Before");
    await deactivate();

    // Enable: activate runs again on the same module and the same database.
    const second = await serve("alice", USER);
    const list = await second("GET", "/icons");
    expect(list.body.icons.map((icon: any) => icon.id)).toEqual([id]);
    await upload(second, "After");
    expect((await second("GET", "/icons")).body.icons).toHaveLength(2);
    expect(activations).toBeGreaterThanOrEqual(2);
  });
});
