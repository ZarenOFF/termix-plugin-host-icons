import { and, eq, ne } from "drizzle-orm";
import { checkIcon } from "./library.js";

// The wire name of the icons other people uploaded, synced down to a linked
// desktop. Part of the sync protocol like "icons": it never changes.
export const SHARED_SYNC_ENTITY = "sharedIcons";

/**
 * On the server: the icons a user's linked desktop should keep a copy of,
 * which are all the icons someone else uploaded. The library is shared, so a
 * host may use any of them. uploadedBy stays on the server.
 */
export async function loadShared(
  db: any,
  iconsTable: any,
  userId: string,
): Promise<Record<string, unknown>[]> {
  const rows = (await db
    .select()
    .from(iconsTable)
    .where(ne(iconsTable.uploadedBy, userId))) as Array<{
    syncId: string;
    name: string;
    kind: string;
    data: string;
    tint: boolean | number;
  }>;
  return rows.map((row) => ({
    syncId: row.syncId,
    name: row.name,
    kind: row.kind,
    data: row.data,
    tint: Boolean(row.tint),
  }));
}

/**
 * On the desktop: stores or replaces the copy of one icon. It gets the same
 * checks as an upload, so only sanitized data is ever stored. Throwing
 * rejects the row.
 */
export async function writeShared(
  db: any,
  sharedTable: any,
  userId: string,
  row: Record<string, unknown>,
): Promise<void> {
  const syncId = row.syncId;
  if (typeof syncId !== "string" || syncId === "") {
    throw new Error("syncId must be a non-empty string");
  }
  // A SQLite server may send tint as 0 or 1.
  const tint = row.tint === 0 || row.tint === 1 ? row.tint === 1 : row.tint;
  const checked = checkIcon({ ...row, tint });
  if (checked.ok === false) throw new Error(checked.error);
  const { icon } = checked;
  const match = and(
    eq(sharedTable.userId, userId),
    eq(sharedTable.syncId, syncId),
  );
  // No upsert: it is spelled differently on every dialect.
  const existing = (await db
    .select({ id: sharedTable.id })
    .from(sharedTable)
    .where(match)) as unknown[];
  if (existing.length > 0) {
    await db.update(sharedTable).set(icon).where(match);
    return;
  }
  try {
    await db.insert(sharedTable).values({ userId, syncId, ...icon });
  } catch (error) {
    // Another write of the same icon got in between: the unique index on
    // (userId, syncId) refused this one, so change that copy instead.
    const raced = (await db
      .select({ id: sharedTable.id })
      .from(sharedTable)
      .where(match)) as unknown[];
    if (raced.length === 0) throw error;
    await db.update(sharedTable).set(icon).where(match);
  }
}

/** On the desktop: drops the copy of an icon that is gone from the server. */
export async function eraseShared(
  db: any,
  sharedTable: any,
  userId: string,
  syncId: string,
): Promise<void> {
  await db
    .delete(sharedTable)
    .where(and(eq(sharedTable.userId, userId), eq(sharedTable.syncId, syncId)));
}
