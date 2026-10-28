import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { icons } from "./tables.js";
import { registerRoutes } from "./routes.js";
import { checkIcon, hasRoom } from "./library.js";

// The wire name of the synced icons. It is part of the sync protocol: records
// on both sides match on it, so it never changes.
export const SYNC_ENTITY = "icons";

// The shared library of uploaded icons. Picking an icon, its color and the
// rules are still host and user settings that core stores; only uploaded icons
// need a table and routes of their own.
export async function activate(ctx: PluginContext) {
  const iconsTable = await ctx.db.define(icons);
  registerRoutes(ctx.http.router<Router>(), ctx, iconsTable);

  // A linked desktop gets the icons its user uploaded (core syncs the rows
  // whose uploadedBy is the user) and sends back the ones added there.
  // Icons other people uploaded do not sync: they belong to someone else.
  ctx.sync.registerEntity({
    type: SYNC_ENTITY,
    table: iconsTable,
    userColumn: "uploadedBy",
    // Core checks these names as given, so they carry the plugin id. A change
    // or delete only ever touches the pusher's own rows: no permission needed.
    permissions: { create: `${ctx.pluginId}.upload` },
    // A pushed row gets the same checks as an upload through the routes, and
    // the sanitized SVG is what is stored. Throwing rejects that row.
    deserialize: async (row) => {
      // The public id of the icon: a row without one could not be found again.
      const syncId = row.syncId;
      if (typeof syncId !== "string" || syncId === "") {
        throw new Error("syncId must be a non-empty string");
      }
      // A SQLite desktop may send tint as 0 or 1.
      const tint = row.tint === 0 || row.tint === 1 ? row.tint === 1 : row.tint;
      const checked = checkIcon({ ...row, tint });
      if (checked.ok === false) throw new Error(checked.error);
      const { icon } = checked;
      const db = await ctx.db.client();
      if (
        !(await hasRoom(db, iconsTable, Buffer.byteLength(icon.data), syncId))
      ) {
        throw new Error("The icon library is full");
      }
      return { ...row, ...icon };
    },
  });
}

export async function deactivate() {
  // Everything registered through ctx is disposed by core.
}
