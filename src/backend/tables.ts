import {
  boolean,
  defineTable,
  id,
  refUser,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

// Stored as p_host_icons_icons. The prefix comes from the plugin id.
// The shared library of uploaded icons. uploadedBy is a plain varchar and not
// refUser on purpose: icons are shared, so they outlive the user who added them.
export const icons = defineTable(
  "icons",
  {
    // The local key, which sync needs to be an auto increment number. It never
    // leaves the server: everything outside uses syncId.
    id: id(),
    // The public id, a uuid the server picks. Hosts store custom:<syncId>, and
    // a linked desktop knows the icon by it. Picking it ourselves also lets a
    // new row be read back without returning().
    syncId: varchar(36).notNull(),
    name: varchar(64).notNull(),
    // "svg" or "png"
    kind: varchar(8).notNull(),
    // Sanitized SVG markup, or the PNG as base64 without a data: prefix.
    data: text().notNull(),
    // Draw as a mask filled with the icon color.
    tint: boolean().notNull().default(false),
    // The owner for sync: a desktop only gets the icons its user uploaded.
    uploadedBy: varchar(255).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      {
        name: "idx_p_host_icons_icons_sync_id",
        columns: ["syncId"],
        unique: true,
      },
    ],
  },
);

// Stored as p_host_icons_shared_icons. On a linked desktop: copies of the
// icons other people uploaded to the server, which the sharedIcons sync entity
// writes and erases. Never edited here and never pushed back. Empty on a
// server. userId is the desktop user the copy was synced for.
export const sharedIcons = defineTable(
  "shared_icons",
  {
    id: id(),
    userId: refUser().notNull(),
    // The icon's syncId on the server, so custom:<syncId> finds the copy.
    syncId: varchar(36).notNull(),
    name: varchar(64).notNull(),
    kind: varchar(8).notNull(),
    data: text().notNull(),
    tint: boolean().notNull().default(false),
  },
  {
    indexes: [
      {
        name: "idx_p_host_icons_shared_icons_user_sync_id",
        columns: ["userId", "syncId"],
        unique: true,
      },
    ],
  },
);

// termix-plugin migrations reads this list.
export const tables = [icons, sharedIcons];
