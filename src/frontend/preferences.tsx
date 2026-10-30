import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  useHosts,
  usePluginApi,
  useSettings,
} from "@termix-ssh/plugin-sdk/frontend";
import { isCustomId, refreshLibrary, useLibrary } from "./library";
import {
  collectTextIcons,
  collectUsedIcons,
  usedIcons,
  usedTextIcons,
} from "./used-text";
import {
  NO_RULES,
  RULES_KEY,
  activeRules,
  resolveAppearance,
  sameRuleLists,
  type RuleList,
} from "./rules";

/** User setting key, as declared in manifest.json. */
export const POSITION_KEY = "position";
export const SKIP_EMPTY_SLOT_KEY = "skipEmptySlot";
export const SIZE_KEY = "size";
export const FOLDER_SIZE_KEY = "folderSize";

/** Icon size in percent, as the manifest's number field bounds it. */
export const DEFAULT_SIZE = 100;
export const MIN_SIZE = 50;
export const MAX_SIZE = 150;

/** Folder icon size in percent of the layout's own folder icon. */
export const MIN_FOLDER_SIZE = 75;
export const MAX_FOLDER_SIZE = 200;

/** host-icons.css scales every icon size and the large slot by this. */
export const SCALE_PROPERTY = "--host-icons-scale";

/**
 * The list's icon size for the position, before scaling. host-icons.css
 * draws the picker's icons at it, so they show at the size the list will.
 */
export const BASE_PROPERTY = "--host-icons-base";

/**
 * The Folder icon size setting (1 = 100%). Set on the root, with
 * FOLDER_ATTRIBUTE, only while it isn't 100%; host-icons.css matches the
 * Classic Layout's folder rows only under the attribute, so at 100% folders
 * keep whatever size the layout gives them.
 */
export const FOLDER_SCALE_PROPERTY = "--host-icons-folder-scale";
export const FOLDER_ATTRIBUTE = "data-host-icons-folders";

/** A stored percent, rounded and put inside min-max; 100 when unusable. */
export function normalizePercent(
  value: unknown,
  min: number,
  max: number,
): number {
  if (typeof value === "string" && value.trim() === "") return DEFAULT_SIZE;
  const size = typeof value === "string" ? Number(value) : value;
  if (typeof size !== "number" || !Number.isFinite(size)) return DEFAULT_SIZE;
  return Math.min(max, Math.max(min, Math.round(size)));
}

export function normalizeSize(value: unknown): number {
  return normalizePercent(value, MIN_SIZE, MAX_SIZE);
}

export function normalizeFolderSize(value: unknown): number {
  return normalizePercent(value, MIN_FOLDER_SIZE, MAX_FOLDER_SIZE);
}

export const ICON_POSITIONS = ["large", "small", "after"] as const;

/**
 * large: a big icon left of the host row, the height of the row.
 * small: a small icon right before the host name.
 * after: a small icon after the host name, where badges normally go.
 */
export type IconPosition = (typeof ICON_POSITIONS)[number];

export const DEFAULT_POSITION: IconPosition = "large";

/** The sizes host-icons.css gives the icon in the list, at 100%. */
const BASE_SIZE: Record<IconPosition, string> = {
  large: "1.375rem",
  small: "0.875rem",
  after: "0.875rem",
};

export function normalizePosition(value: unknown): IconPosition {
  return ICON_POSITIONS.includes(value as IconPosition)
    ? (value as IconPosition)
    : DEFAULT_POSITION;
}

/**
 * What every host row needs to place and choose its icon, worked out once:
 * the user's icon position, their rules, and whether any host has an icon at
 * all. Each row asking useSettings itself would be one request per host.
 */
export interface IconLayout {
  position: IconPosition;
  /**
   * Some host has an icon, its own or one a rule gives it. Large icons then
   * keep an empty slot on hosts without one, so names line up; with no icons
   * anywhere, rows stay as the layout draws them.
   */
  anyIcon: boolean;
  /** The user turned the empty slot off: only hosts with an icon move over. */
  skipEmptySlot: boolean;
  /** Rules that can apply, one list per level, first match wins. */
  rules: readonly RuleList[];
}

export interface Preferences {
  get: () => IconLayout;
  set: (next: IconLayout) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPreferences(): Preferences {
  let layout: IconLayout = {
    position: DEFAULT_POSITION,
    anyIcon: false,
    skipEmptySlot: true,
    rules: NO_RULES,
  };
  const listeners = new Set<() => void>();
  return {
    get: () => layout,
    set: (next) => {
      if (
        next.position === layout.position &&
        next.anyIcon === layout.anyIcon &&
        next.skipEmptySlot === layout.skipEmptySlot &&
        sameRuleLists(next.rules, layout.rules)
      )
        return;
      layout = { ...next };
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useIconLayout(preferences: Preferences): IconLayout {
  return useSyncExternalStore(
    preferences.subscribe,
    preferences.get,
    preferences.get,
  );
}

/**
 * Mounted once through the shell.overlay slot. useSettings reads again when
 * the user saves a setting, and useHosts follows the host list, so rows
 * follow both without a reload. It also loads the library of uploaded icons
 * into its store, and again for an uploaded id it does not know; whoever
 * changes the library refreshes that store, and the badges, which only read
 * it, follow.
 */
export function createPreferencesSync(preferences: Preferences) {
  return function HostIconsPreferences() {
    const { values, loaded } = useSettings("user");
    const { hosts } = useHosts();
    const api = usePluginApi();
    // Uploaded icons resolve through the library, so what is active and what
    // is drawn changes when it loads or changes.
    const library = useLibrary();
    useEffect(() => {
      void refreshLibrary(api);
    }, [api]);
    // Someone else may upload an icon and give it to a shared host after the
    // library loaded here. An uploaded id the library does not know reads it
    // again, once per id, so a deleted icon does not ask over and over.
    const askedFor = useRef(new Set<string>());
    useEffect(() => {
      if (!library.loaded) return;
      const used = collectUsedIcons(hosts, loaded ? values[RULES_KEY] : []);
      const missing = used.filter(
        (id) =>
          isCustomId(id) && !library.byId.has(id) && !askedFor.current.has(id),
      );
      if (missing.length === 0) return;
      for (const id of missing) askedFor.current.add(id);
      void refreshLibrary(api);
    }, [api, hosts, library, loaded, values]);
    const position = loaded
      ? normalizePosition(values[POSITION_KEY])
      : preferences.get().position;
    const skipEmptySlot = loaded
      ? values[SKIP_EMPTY_SLOT_KEY] !== false
      : preferences.get().skipEmptySlot;
    // Only the user's own rules for now. An admin's would be one more list.
    const rulesJson = loaded ? JSON.stringify(values[RULES_KEY] ?? []) : null;
    const userRules = useMemo(
      () => (rulesJson === null ? null : activeRules(JSON.parse(rulesJson))),
      // activeRules looks icons up in the library, which is not an argument.
      [rulesJson, library],
    );
    const rules = useMemo(
      () => (userRules ? [userRules] : preferences.get().rules),
      [userRules],
    );
    const anyIcon = hosts.some(
      (host) => resolveAppearance(host, rules).resolved !== null,
    );
    useEffect(() => {
      preferences.set({ position, anyIcon, skipEmptySlot, rules });
    }, [position, anyIcon, skipEmptySlot, rules]);
    // Text icons are typed, not listed, so the Text filter offers these
    // again; the picker's first section shows every icon in use.
    useEffect(() => {
      const rawRules = loaded ? values[RULES_KEY] : undefined;
      usedTextIcons.set(collectTextIcons(hosts, rawRules));
      usedIcons.set(collectUsedIcons(hosts, rawRules));
    }, [hosts, loaded, values]);
    // The large icon's room is padding on the row's text column, which can't
    // read a variable from the badge inside it, so the scale sits on the root.
    const size = loaded ? normalizeSize(values[SIZE_KEY]) : null;
    useEffect(() => {
      if (size === null) return;
      const root = document.documentElement.style;
      root.setProperty(SCALE_PROPERTY, String(size / 100));
      return () => {
        root.removeProperty(SCALE_PROPERTY);
      };
    }, [size]);
    const base = loaded ? BASE_SIZE[position] : null;
    useEffect(() => {
      if (base === null) return;
      const root = document.documentElement.style;
      root.setProperty(BASE_PROPERTY, base);
      return () => {
        root.removeProperty(BASE_PROPERTY);
      };
    }, [base]);
    const folderSize = loaded
      ? normalizeFolderSize(values[FOLDER_SIZE_KEY])
      : DEFAULT_SIZE;
    useEffect(() => {
      if (folderSize === DEFAULT_SIZE) return;
      const root = document.documentElement;
      root.style.setProperty(FOLDER_SCALE_PROPERTY, String(folderSize / 100));
      root.setAttribute(FOLDER_ATTRIBUTE, "");
      return () => {
        root.style.removeProperty(FOLDER_SCALE_PROPERTY);
        root.removeAttribute(FOLDER_ATTRIBUTE);
      };
    }, [folderSize]);
    return null;
  };
}
