/**
 * The icons already in use, offered again by the picker.
 *
 * Text icons are typed rather than picked from a list, and every icon in use
 * is worth a shortcut, so this collects the ones that hosts and rules already
 * hold. The preferences component fills the stores from the host list and the
 * user's rules, and every picker reads them, which keeps the pickers from
 * loading hosts or settings themselves.
 */

import { useSyncExternalStore } from "react";
import { ICON_KEY, PLUGIN_ID, parseTextIcon } from "./icons";
import { readRules } from "./rules";

type HostLike = {
  pluginSettings?: Record<string, Record<string, unknown>>;
};

/** Canonical text icon ids, sorted, without duplicates. */
export function collectTextIcons(
  hosts: readonly HostLike[],
  rawRules: unknown,
): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const icon = parseTextIcon(value);
    if (icon) ids.add(icon.id);
  };
  for (const host of hosts) add(host.pluginSettings?.[PLUGIN_ID]?.[ICON_KEY]);
  for (const rule of readRules(rawRules)) add(rule.icon);
  return [...ids].sort((a, b) => a.localeCompare(b));
}

/**
 * Every icon id that hosts and rules hold, most used first (ties by id).
 * Text ids are canonical. Whether an id is known is for the reader to decide:
 * an uploaded icon only resolves once the library has loaded.
 */
export function collectUsedIcons(
  hosts: readonly HostLike[],
  rawRules: unknown,
): string[] {
  const counts = new Map<string, number>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const id = parseTextIcon(value)?.id ?? value.trim();
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  for (const host of hosts) add(host.pluginSettings?.[PLUGIN_ID]?.[ICON_KEY]);
  for (const rule of readRules(rawRules)) add(rule.icon);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

const NONE: readonly string[] = [];

/** A small store of icon ids that listeners follow. */
function createIdStore() {
  let state: readonly string[] = NONE;
  const listeners = new Set<() => void>();
  const store = {
    get: (): readonly string[] => state,
    set(next: readonly string[]) {
      if (
        next.length === state.length &&
        next.every((id, i) => id === state[i])
      )
        return;
      state = next.length === 0 ? NONE : next;
      for (const listener of listeners) listener();
    },
    reset(): void {
      store.set(NONE);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return store;
}

export const usedTextIcons = createIdStore();
export const usedIcons = createIdStore();

export function useUsedTextIcons(): readonly string[] {
  return useSyncExternalStore(
    usedTextIcons.subscribe,
    usedTextIcons.get,
    usedTextIcons.get,
  );
}

export function useUsedIcons(): readonly string[] {
  return useSyncExternalStore(
    usedIcons.subscribe,
    usedIcons.get,
    usedIcons.get,
  );
}
