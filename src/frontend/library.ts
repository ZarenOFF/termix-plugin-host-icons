/**
 * The shared library of uploaded icons, as one store for the whole frontend.
 *
 * It is a module level store, not React state, because the pieces that read
 * it live in separate React roots: the host badges, the shell.overlay
 * components and the settings screen's custom fields. The overlay's
 * preferences component loads it once; whoever changes the library asks for a
 * refresh, so badges and pickers follow without a reload. Badges only read
 * the store and never make a request of their own.
 */

import { useSyncExternalStore } from "react";
import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";

export const CUSTOM_PREFIX = "custom:";

const CUSTOM_ID =
  /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Limits the backend enforces; checked here too, to spare an upload. */
export const MAX_SVG_FILE_BYTES = 512 * 1024;
export const MAX_PNG_FILE_BYTES = 256 * 1024;
export const MAX_NAME_LENGTH = 64;

export type CustomIconKind = "svg" | "png";

/**
 * An uploaded icon. Its id is "custom:<uuid>", the uuid the server gave it.
 * `data` is sanitized SVG markup, or a PNG as base64 without a prefix. It is
 * only ever shown through an <img> or a CSS mask, never as markup.
 */
export interface CustomIconDef {
  id: string;
  custom: true;
  name: string;
  kind: CustomIconKind;
  data: string;
  /** Drawn as a mask filled with the icon color instead of as it is. */
  tint: boolean;
  /** The current user may rename or delete it. */
  canEdit: boolean;
  /**
   * A stand in for an id the library has not been loaded for yet. It draws
   * an empty slot, so a host does not flash the fallback icon on start.
   */
  pending?: boolean;
}

export function isCustomId(id: string): boolean {
  return CUSTOM_ID.test(id);
}

export interface LibraryState {
  /** The first list has arrived. */
  loaded: boolean;
  /** Ordered by name, as the server sends them. */
  icons: readonly CustomIconDef[];
  byId: ReadonlyMap<string, CustomIconDef>;
}

const EMPTY: LibraryState = { loaded: false, icons: [], byId: new Map() };

let state: LibraryState = EMPTY;
const listeners = new Set<() => void>();

function sameIcon(a: CustomIconDef, b: CustomIconDef): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind === b.kind &&
    a.data === b.data &&
    a.tint === b.tint &&
    a.canEdit === b.canEdit
  );
}

/** One row of GET /icons as an icon, or null when it is not usable. */
function toIcon(row: unknown): CustomIconDef | null {
  if (!row || typeof row !== "object") return null;
  const { id, name, kind, data, tint, canEdit } = row as Record<
    string,
    unknown
  >;
  if (typeof id !== "string" || typeof name !== "string") return null;
  if (typeof data !== "string" || data === "") return null;
  if (kind !== "svg" && kind !== "png") return null;
  return {
    id: `${CUSTOM_PREFIX}${id}`,
    custom: true,
    name,
    kind,
    data,
    tint: tint === true,
    canEdit: canEdit === true,
  };
}

function emit() {
  for (const listener of listeners) listener();
}

export const library = {
  get: (): LibraryState => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /**
   * Replaces the list with the server's rows. An icon that did not change
   * keeps its object, so drawing code that caches by object stays valid.
   */
  set(rows: unknown): void {
    const before = state.byId;
    const icons: CustomIconDef[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const icon = toIcon(row);
      if (!icon) continue;
      const old = before.get(icon.id);
      icons.push(old && sameIcon(old, icon) ? old : icon);
    }
    state = {
      loaded: true,
      icons,
      byId: new Map(icons.map((icon) => [icon.id, icon])),
    };
    emit();
  },
  /** Back to "not loaded", when the plugin is disabled. */
  reset(): void {
    // Anything in flight belongs to the old session.
    sequence++;
    if (state === EMPTY) return;
    state = EMPTY;
    emit();
  },
};

/** The library, re-read by the component whenever it changes. */
export function useLibrary(): LibraryState {
  return useSyncExternalStore(library.subscribe, library.get, library.get);
}

/**
 * What a custom id resolves to: the icon, undefined for an id the loaded
 * library does not hold, and a pending stand in before the first load.
 */
export function findCustomIcon(id: string): CustomIconDef | undefined {
  if (!isCustomId(id)) return undefined;
  if (!state.loaded) {
    return {
      id,
      custom: true,
      name: "",
      kind: "svg",
      data: "",
      tint: false,
      canEdit: false,
      pending: true,
    };
  }
  return state.byId.get(id);
}

let sequence = 0;

/**
 * Reads the library from the server into the store. A slower, older request
 * never overwrites a newer one. Resolves false when the request failed; the
 * store then keeps what it had, and a library that never loaded keeps
 * custom icons as empty slots.
 */
export async function refreshLibrary(api: PluginApiClient): Promise<boolean> {
  const mine = ++sequence;
  try {
    const { data } = await api.get<{ icons?: unknown }>("/icons");
    if (mine !== sequence) return true;
    library.set(data?.icons);
    return true;
  } catch {
    return false;
  }
}
