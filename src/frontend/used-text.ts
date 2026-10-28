/**
 * The text icons already in use, offered again on the picker's Text tab.
 *
 * Text icons are typed rather than picked from a list, so this collects the
 * ones that hosts and rules already hold. The preferences component fills it
 * from the host list and the user's rules, and every picker reads it, which
 * keeps the pickers from loading hosts or settings themselves.
 */

import { useSyncExternalStore } from "react";
import { ICON_KEY, PLUGIN_ID, parseTextIcon } from "./icons";
import { readRules } from "./rules";

/** Canonical text icon ids, sorted, without duplicates. */
export function collectTextIcons(
  hosts: readonly {
    pluginSettings?: Record<string, Record<string, unknown>>;
  }[],
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

const NONE: readonly string[] = [];
let state: readonly string[] = NONE;
const listeners = new Set<() => void>();

export const usedTextIcons = {
  get: (): readonly string[] => state,
  set(next: readonly string[]) {
    if (next.length === state.length && next.every((id, i) => id === state[i]))
      return;
    state = next.length === 0 ? NONE : next;
    for (const listener of listeners) listener();
  },
  reset(): void {
    usedTextIcons.set(NONE);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useUsedTextIcons(): readonly string[] {
  return useSyncExternalStore(
    usedTextIcons.subscribe,
    usedTextIcons.get,
    usedTextIcons.get,
  );
}
