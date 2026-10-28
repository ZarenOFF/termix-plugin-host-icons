import { randomUUID } from "node:crypto";
import type { Request, Response, Router } from "express";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  MAX_ICONS,
  MAX_NAME_LENGTH,
  MAX_TOTAL_BYTES,
  checkIcon,
  cleanName,
  hasRoom,
  insertWithinLimits,
} from "./library.js";

export { MAX_ICONS, MAX_NAME_LENGTH, MAX_TOTAL_BYTES, cleanName };

// The table object ctx.db.define hands back. Drizzle's own types are
// per dialect, so the routes treat it loosely.
type IconsTable = any;

interface IconRow {
  // The local key. Never leaves the server: clients and hosts use syncId.
  id: number;
  // The public id of the icon: what hosts store as custom:<syncId> and what
  // a linked desktop knows the icon by.
  syncId: string;
  name: string;
  kind: string;
  data: string;
  tint: boolean | number;
  uploadedBy: string;
  createdAt: string | Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  iconsTable: IconsTable,
): void {
  const client = () => ctx.db.client<BetterSQLite3Database>();
  const actor = () => ctx.currentActor() as string;

  const present = (row: IconRow, canUpload: boolean, canManage: boolean) => ({
    id: row.syncId,
    name: row.name,
    kind: row.kind,
    data: row.data,
    tint: Boolean(row.tint),
    createdAt: row.createdAt,
    canEdit: canManage || (canUpload && row.uploadedBy === actor()),
  });

  const find = async (syncId: string): Promise<IconRow | undefined> => {
    if (!UUID.test(syncId)) return undefined;
    const db = await client();
    const rows = (await db
      .select()
      .from(iconsTable)
      .where(eq(iconsTable.syncId, syncId))) as IconRow[];
    return rows[0];
  };

  /**
   * @openapi
   * /plugin-api/host-icons/icons:
   *   get:
   *     summary: List the shared icon library
   *     description: >
   *       Every signed-in user can read the library, so a shared host looks the
   *       same to everyone. canEdit says whether the caller may rename or
   *       delete that icon.
   *     tags:
   *       - Host Icons
   *     responses:
   *       200:
   *         description: The icons, ordered by name
   */
  router.get("/icons", async (_req: Request, res: Response) => {
    const db = await client();
    const rows = (await db.select().from(iconsTable)) as IconRow[];
    const canUpload = await ctx.rbac.has("upload");
    const canManage = await ctx.rbac.has("manage");
    const icons = rows
      .map((row) => present(row, canUpload, canManage))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
          a.id.localeCompare(b.id),
      );
    res.json({ icons });
  });

  /**
   * @openapi
   * /plugin-api/host-icons/icons:
   *   post:
   *     summary: Add an icon to the shared library
   *     description: >
   *       Needs the upload permission. SVG is sanitized and may be 100 KB at
   *       most after that. PNG is base64 without a data: prefix, 256 KB and
   *       512 by 512 pixels at most.
   *     tags:
   *       - Host Icons
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, kind, data]
   *             properties:
   *               name:
   *                 type: string
   *                 maxLength: 64
   *               kind:
   *                 type: string
   *                 enum: [svg, png]
   *               data:
   *                 type: string
   *               tint:
   *                 type: boolean
   *     responses:
   *       201:
   *         description: Icon added
   *       400:
   *         description: Bad name or kind, or an unsafe or too big file
   *       403:
   *         description: The caller may not upload
   *       409:
   *         description: The library is full
   */
  router.post("/icons", async (req: Request, res: Response) => {
    if (!(await ctx.rbac.has("upload"))) {
      return res.status(403).json({ error: "You may not upload icons" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const checked = checkIcon(body);
    if (checked.ok === false) {
      return res.status(400).json({ error: checked.error });
    }
    const { icon } = checked;

    const db = await client();
    const full = () =>
      res.status(409).json({
        error: `The library is full (${MAX_ICONS} icons or ${MAX_TOTAL_BYTES / 1024 / 1024} MB)`,
      });
    if (!(await hasRoom(db, iconsTable, Buffer.byteLength(icon.data)))) {
      return full();
    }

    const syncId = randomUUID();
    // No returning(): MySQL does not support it. The row is read back by its
    // syncId. The check above and the insert are not atomic, so the insert
    // checks the totals again and takes the row back out when over.
    const added = await insertWithinLimits(db, iconsTable, {
      syncId,
      ...icon,
      uploadedBy: actor(),
    });
    // SQLite only reaches disk when asked.
    await ctx.db.persist();
    if (!added) return full();
    const row = (await find(syncId)) as IconRow;
    res.status(201).json({ icon: present(row, true, true) });
  });

  /**
   * @openapi
   * /plugin-api/host-icons/icons/{id}:
   *   patch:
   *     summary: Rename an icon or change whether it takes the icon color
   *     description: >
   *       The uploader with the upload permission may change their own icons.
   *       The manage permission allows changing anyone's.
   *     tags:
   *       - Host Icons
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *                 maxLength: 64
   *               tint:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The changed icon
   *       400:
   *         description: Nothing to change, or a bad name
   *       403:
   *         description: The caller may not change this icon
   *       404:
   *         description: No such icon
   */
  router.patch("/icons/:id", async (req: Request, res: Response) => {
    const existing = await find(String(req.params.id));
    if (!existing) return res.status(404).json({ error: "Icon not found" });
    const canUpload = await ctx.rbac.has("upload");
    const canManage = await ctx.rbac.has("manage");
    if (!present(existing, canUpload, canManage).canEdit) {
      return res.status(403).json({ error: "You may not change this icon" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const changes: { name?: string; tint?: boolean } = {};
    if (body.name !== undefined) {
      const name = cleanName(body.name);
      if (name === null) {
        return res
          .status(400)
          .json({ error: `name must be 1 to ${MAX_NAME_LENGTH} characters` });
      }
      changes.name = name;
    }
    if (body.tint !== undefined) {
      if (typeof body.tint !== "boolean") {
        return res.status(400).json({ error: "tint must be true or false" });
      }
      changes.tint = body.tint;
    }
    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ error: "Send a name or tint to change" });
    }

    const db = await client();
    await db
      .update(iconsTable)
      .set(changes)
      .where(eq(iconsTable.syncId, existing.syncId));
    await ctx.db.persist();
    const row = (await find(existing.syncId)) as IconRow;
    res.json({ icon: present(row, canUpload, canManage) });
  });

  /**
   * @openapi
   * /plugin-api/host-icons/icons/{id}:
   *   delete:
   *     summary: Delete an icon from the library
   *     description: >
   *       The uploader with the upload permission may delete their own icons.
   *       The manage permission allows deleting anyone's. Hosts that use a
   *       deleted icon show the fallback icon.
   *     tags:
   *       - Host Icons
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       204:
   *         description: Icon deleted
   *       403:
   *         description: The caller may not delete this icon
   *       404:
   *         description: No such icon
   */
  router.delete("/icons/:id", async (req: Request, res: Response) => {
    const existing = await find(String(req.params.id));
    if (!existing) return res.status(404).json({ error: "Icon not found" });
    const canUpload = await ctx.rbac.has("upload");
    const canManage = await ctx.rbac.has("manage");
    if (!present(existing, canUpload, canManage).canEdit) {
      return res.status(403).json({ error: "You may not delete this icon" });
    }
    const db = await client();
    await db.delete(iconsTable).where(eq(iconsTable.syncId, existing.syncId));
    await ctx.db.persist();
    res.status(204).end();
  });
}
