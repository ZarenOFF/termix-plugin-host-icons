import { count, ne, sql } from "drizzle-orm";
import { validatePng } from "./png.js";
import { sanitizeSvg } from "./sanitize-svg.js";

export const MAX_ICONS = 500;
export const MAX_NAME_LENGTH = 64;
// GET returns every icon with its data, so the library as a whole is bounded.
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

// Control characters would only make a name hard to read or to search for.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** A trimmed name of 1 to 64 characters, or null. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name === "" || name.length > MAX_NAME_LENGTH || CONTROL.test(name)) {
    return null;
  }
  return name;
}

export interface IconFields {
  name: string;
  kind: "svg" | "png";
  /** Sanitized SVG markup, or the PNG as base64 without a data: prefix. */
  data: string;
  tint: boolean;
}

export type IconCheck =
  { ok: true; icon: IconFields } | { ok: false; error: string };

/**
 * The one check every new icon goes through, whether it arrives from the
 * upload route or from a linked desktop: name, kind, tint and the file itself.
 * The returned data is what gets stored, never the input.
 */
export function checkIcon(input: {
  name?: unknown;
  kind?: unknown;
  data?: unknown;
  tint?: unknown;
}): IconCheck {
  const name = cleanName(input.name);
  if (name === null) {
    return {
      ok: false,
      error: `name must be 1 to ${MAX_NAME_LENGTH} characters`,
    };
  }
  if (input.kind !== "svg" && input.kind !== "png") {
    return { ok: false, error: "kind must be svg or png" };
  }
  if (input.tint !== undefined && typeof input.tint !== "boolean") {
    return { ok: false, error: "tint must be true or false" };
  }
  const tint = input.tint === true;
  if (input.kind === "svg") {
    const result = sanitizeSvg(input.data);
    if (result.ok === false) return { ok: false, error: result.error };
    return { ok: true, icon: { name, kind: "svg", data: result.svg, tint } };
  }
  const result = validatePng(input.data);
  if (result.ok === false) return { ok: false, error: result.error };
  return { ok: true, icon: { name, kind: "png", data: result.base64, tint } };
}

/**
 * Whether one more icon of `bytes` fits in the library. `exceptSyncId` leaves
 * that icon out of the count, for a change to an icon that is already stored.
 */
export async function hasRoom(
  db: any,
  table: any,
  bytes: number,
  exceptSyncId?: string,
): Promise<boolean> {
  const query = db
    .select({
      total: count(),
      bytes: sql<number>`coalesce(sum(length(${table.data})), 0)`,
    })
    .from(table);
  const [row] = (await (exceptSyncId === undefined
    ? query
    : query.where(ne(table.syncId, exceptSyncId)))) as Array<{
    total: number;
    bytes: number;
  }>;
  return (
    Number(row!.total) < MAX_ICONS &&
    Number(row!.bytes) + bytes <= MAX_TOTAL_BYTES
  );
}
