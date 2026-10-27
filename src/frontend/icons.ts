/**
 * The built-in icon packs and the rules for reading a host's icon settings.
 *
 * A host stores an icon id (ours, like "server" or "brand-ubuntu"), never a
 * Lucide name or a pack slug, so a rename there only means changing the
 * mapping here. Lucide icons are drawn with PluginIcon from
 * @termix-ssh/plugin-sdk/ui, which uses the Lucide copy Termix already ships.
 * Brand logos are path data in brands.generated.ts, drawn by HostIcon.
 */

import { BRAND_GROUPS, BRAND_ICONS, type BrandGroup } from "./brands.generated";

export { BRAND_GROUPS, BRAND_ICONS, type BrandGroup };

export const PLUGIN_ID = "host-icons";

/** Host setting keys, as declared in manifest.json. */
export const ICON_KEY = "icon";
export const COLOR_KEY = "color";

/** Shown when a host names an icon this version does not know. */
export const FALLBACK_ICON_ID = "server";

export const ICON_GROUPS = [
  "servers",
  "network",
  "devices",
  "security",
  "development",
  "other",
] as const;

export type IconGroup = (typeof ICON_GROUPS)[number];

/** A Lucide icon, drawn with PluginIcon. */
export interface LucideIconDef {
  /** Stored in the host setting. Never change one that has shipped. */
  id: string;
  /** Lucide component name, as PluginIcon takes it. */
  lucide: string;
  group: IconGroup;
  /** Extra English words the search matches, besides the label. */
  keywords?: string[];
}

/**
 * A brand logo, bundled as path data by scripts/generate-brands.mjs. The id
 * is "brand-<name>", ours and permanent like any other icon id.
 */
export interface BrandIconDef {
  id: string;
  /** The brand's name, shown as is: brand names are not translated. */
  title: string;
  group: BrandGroup;
  keywords?: string[];
  /** Path data on a 24x24 box. */
  d: string;
  /** Drawn as a 2px outline instead of a filled shape. */
  stroke?: boolean;
}

/** Either pack's icon: what a host's stored id resolves to. */
export type HostIconDef = LucideIconDef | BrandIconDef;

export function isBrandIcon(icon: HostIconDef): icon is BrandIconDef {
  return "d" in icon;
}

/** The Lucide icons, in the order the picker shows them. */
export const HOST_ICONS: readonly LucideIconDef[] = [
  { id: "server", lucide: "Server", group: "servers" },
  { id: "server-cog", lucide: "ServerCog", group: "servers" },
  { id: "database", lucide: "Database", group: "servers", keywords: ["sql"] },
  {
    id: "hard-drive",
    lucide: "HardDrive",
    group: "servers",
    keywords: ["nas", "storage", "disk"],
  },
  {
    id: "container",
    lucide: "Container",
    group: "servers",
    keywords: ["docker", "podman", "kubernetes"],
  },
  { id: "box", lucide: "Box", group: "servers", keywords: ["vm", "lxc"] },
  { id: "boxes", lucide: "Boxes", group: "servers", keywords: ["cluster"] },
  { id: "layers", lucide: "Layers", group: "servers", keywords: ["stack"] },
  { id: "cloud", lucide: "Cloud", group: "servers", keywords: ["vps"] },
  { id: "cloud-cog", lucide: "CloudCog", group: "servers" },
  { id: "cpu", lucide: "Cpu", group: "servers", keywords: ["processor"] },
  { id: "memory", lucide: "MemoryStick", group: "servers", keywords: ["ram"] },
  { id: "router", lucide: "Router", group: "network", keywords: ["gateway"] },
  {
    id: "network",
    lucide: "Network",
    group: "network",
    keywords: ["switch", "lan"],
  },
  {
    id: "ethernet",
    lucide: "EthernetPort",
    group: "network",
    keywords: ["port"],
  },
  {
    id: "wifi",
    lucide: "Wifi",
    group: "network",
    keywords: ["wireless", "access point"],
  },
  {
    id: "globe",
    lucide: "Globe",
    group: "network",
    keywords: ["web", "internet"],
  },
  {
    id: "radio-tower",
    lucide: "RadioTower",
    group: "network",
    keywords: ["antenna"],
  },
  {
    id: "monitor",
    lucide: "Monitor",
    group: "devices",
    keywords: ["desktop", "pc", "workstation"],
  },
  { id: "laptop", lucide: "Laptop", group: "devices", keywords: ["notebook"] },
  {
    id: "smartphone",
    lucide: "Smartphone",
    group: "devices",
    keywords: ["phone", "mobile"],
  },
  { id: "tablet", lucide: "Tablet", group: "devices" },
  { id: "tv", lucide: "Tv", group: "devices", keywords: ["media"] },
  { id: "printer", lucide: "Printer", group: "devices" },
  { id: "cctv", lucide: "Cctv", group: "devices", keywords: ["camera", "nvr"] },
  { id: "gamepad", lucide: "Gamepad2", group: "devices", keywords: ["game"] },
  {
    id: "house",
    lucide: "House",
    group: "devices",
    keywords: ["home", "smart home"],
  },
  { id: "shield", lucide: "Shield", group: "security", keywords: ["firewall"] },
  { id: "shield-check", lucide: "ShieldCheck", group: "security" },
  { id: "lock", lucide: "Lock", group: "security", keywords: ["vault"] },
  { id: "key", lucide: "Key", group: "security", keywords: ["auth"] },
  {
    id: "fingerprint",
    lucide: "FingerprintPattern",
    group: "security",
    keywords: ["identity"],
  },
  {
    id: "terminal",
    lucide: "SquareTerminal",
    group: "development",
    keywords: ["shell", "console"],
  },
  { id: "code", lucide: "Code", group: "development" },
  {
    id: "git-branch",
    lucide: "GitBranch",
    group: "development",
    keywords: ["git", "ci"],
  },
  {
    id: "bug",
    lucide: "Bug",
    group: "development",
    keywords: ["debug", "test"],
  },
  {
    id: "flask",
    lucide: "FlaskConical",
    group: "development",
    keywords: ["lab", "staging"],
  },
  {
    id: "rocket",
    lucide: "Rocket",
    group: "development",
    keywords: ["production", "deploy"],
  },
  {
    id: "wrench",
    lucide: "Wrench",
    group: "development",
    keywords: ["tools", "maintenance"],
  },
  {
    id: "gauge",
    lucide: "Gauge",
    group: "other",
    keywords: ["monitoring", "metrics"],
  },
  {
    id: "activity",
    lucide: "Activity",
    group: "other",
    keywords: ["monitoring", "status"],
  },
  { id: "bot", lucide: "Bot", group: "other", keywords: ["ai", "automation"] },
  { id: "mail", lucide: "Mail", group: "other", keywords: ["smtp", "email"] },
  { id: "zap", lucide: "Zap", group: "other", keywords: ["power", "ups"] },
  { id: "flame", lucide: "Flame", group: "other", keywords: ["hot"] },
  { id: "star", lucide: "Star", group: "other", keywords: ["favorite"] },
  { id: "flag", lucide: "Flag", group: "other" },
  {
    id: "building",
    lucide: "Building",
    group: "other",
    keywords: ["office", "company"],
  },
  {
    id: "database-backup",
    lucide: "DatabaseBackup",
    group: "servers",
    keywords: ["backup", "dump"],
  },
  {
    id: "archive",
    lucide: "Archive",
    group: "servers",
    keywords: ["backup", "storage"],
  },
  {
    id: "server-off",
    lucide: "ServerOff",
    group: "servers",
    keywords: ["down", "offline"],
  },
  {
    id: "circuit-board",
    lucide: "CircuitBoard",
    group: "servers",
    keywords: ["board", "sbc", "raspberry"],
  },
  {
    id: "microchip",
    lucide: "Microchip",
    group: "servers",
    keywords: ["chip", "iot", "esp"],
  },
  {
    id: "cable",
    lucide: "Cable",
    group: "network",
    keywords: ["lan", "patch"],
  },
  {
    id: "waypoints",
    lucide: "Waypoints",
    group: "network",
    keywords: ["proxy", "relay", "jump"],
  },
  {
    id: "satellite",
    lucide: "Satellite",
    group: "network",
    keywords: ["sat", "starlink"],
  },
  {
    id: "signal",
    lucide: "Signal",
    group: "network",
    keywords: ["radio", "cellular"],
  },
  {
    id: "speaker",
    lucide: "Speaker",
    group: "devices",
    keywords: ["audio", "sonos"],
  },
  { id: "camera", lucide: "Camera", group: "devices", keywords: ["photo"] },
  { id: "keyboard", lucide: "Keyboard", group: "devices", keywords: ["kvm"] },
  {
    id: "lightbulb",
    lucide: "Lightbulb",
    group: "devices",
    keywords: ["lamp", "smart home"],
  },
  {
    id: "thermometer",
    lucide: "Thermometer",
    group: "devices",
    keywords: ["sensor"],
  },
  { id: "fan", lucide: "Fan", group: "devices", keywords: ["cooling"] },
  {
    id: "shield-alert",
    lucide: "ShieldAlert",
    group: "security",
    keywords: ["ids", "alert"],
  },
  {
    id: "key-round",
    lucide: "KeyRound",
    group: "security",
    keywords: ["ssh", "certificate"],
  },
  { id: "siren", lucide: "Siren", group: "security", keywords: ["alert"] },
  {
    id: "braces",
    lucide: "Braces",
    group: "development",
    keywords: ["json", "config"],
  },
  {
    id: "package",
    lucide: "Package",
    group: "development",
    keywords: ["artifact", "registry"],
  },
  {
    id: "workflow",
    lucide: "Workflow",
    group: "development",
    keywords: ["ci", "workflow"],
  },
  {
    id: "webhook",
    lucide: "Webhook",
    group: "development",
    keywords: ["api", "callback"],
  },
  {
    id: "git-merge",
    lucide: "GitMerge",
    group: "development",
    keywords: ["git", "pull request"],
  },
  {
    id: "folder",
    lucide: "Folder",
    group: "other",
    keywords: ["files", "directory"],
  },
  {
    id: "file-text",
    lucide: "FileText",
    group: "other",
    keywords: ["log", "docs", "file"],
  },
  { id: "clock", lucide: "Clock", group: "other", keywords: ["cron", "time"] },
  {
    id: "bell",
    lucide: "Bell",
    group: "other",
    keywords: ["notification", "alert"],
  },
  {
    id: "users",
    lucide: "Users",
    group: "other",
    keywords: ["shared", "people"],
  },
  {
    id: "music",
    lucide: "Music",
    group: "other",
    keywords: ["media", "audio"],
  },
  { id: "heart", lucide: "Heart", group: "other", keywords: ["like"] },
];

const BY_ID = new Map<string, HostIconDef>(
  [...HOST_ICONS, ...BRAND_ICONS].map((icon) => [icon.id, icon]),
);

/** An icon of either pack by its stored id. */
export function findIcon(id: unknown): HostIconDef | undefined {
  return typeof id === "string" ? BY_ID.get(id) : undefined;
}

const HEX_6 = /^#[0-9a-f]{6}$/i;
const HEX_3 = /^#[0-9a-f]{3}$/i;

/**
 * A color as "#rrggbb" in lower case, or null for "use the theme color".
 * The color field is a custom one, so core stores whatever it is sent and
 * anything that is not a hex color has to be ignored here.
 */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  if (HEX_6.test(color)) return color.toLowerCase();
  if (HEX_3.test(color)) {
    const [r, g, b] = color.slice(1).toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

export interface ResolvedHostIcon {
  icon: HostIconDef;
  color: string | null;
  /** False when the stored id was unknown and the fallback stands in. */
  known: boolean;
}

/**
 * What to draw for one host's settings (`host.pluginSettings["host-icons"]`).
 * Null means the host has no icon: nothing stored, or the stored id is empty.
 */
export function resolveHostIcon(settings: unknown): ResolvedHostIcon | null {
  if (!settings || typeof settings !== "object") return null;
  const values = settings as Record<string, unknown>;
  const id =
    typeof values[ICON_KEY] === "string" ? values[ICON_KEY].trim() : "";
  if (!id) return null;
  const icon = findIcon(id);
  return {
    icon: icon ?? BY_ID.get(FALLBACK_ICON_ID)!,
    color: normalizeColor(values[COLOR_KEY]),
    known: !!icon,
  };
}

/** The same, read from a host record the shell handed over. */
export function resolveIconForHost(host: {
  pluginSettings?: Record<string, Record<string, unknown>>;
}): ResolvedHostIcon | null {
  return resolveHostIcon(host.pluginSettings?.[PLUGIN_ID]);
}

/**
 * What the user reads for an icon: a Lucide icon's translated label, or a
 * brand's own name.
 */
export function iconLabel(
  icon: HostIconDef,
  t: (key: string) => string,
): string {
  return isBrandIcon(icon) ? icon.title : t(`icons.${icon.id}`);
}

function matches(needle: string, texts: string[]): boolean {
  return texts.some((text) => text.toLowerCase().includes(needle));
}

/**
 * Lucide icons whose id, translated label or keywords contain the query. An
 * empty query returns the whole set in catalog order.
 */
export function searchIcons(
  query: string,
  label: (icon: LucideIconDef) => string,
): LucideIconDef[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...HOST_ICONS];
  return HOST_ICONS.filter((icon) =>
    matches(needle, [icon.id, label(icon), ...(icon.keywords ?? [])]),
  );
}

/**
 * Brand logos whose name, id or keywords contain the query. The "brand-"
 * prefix of the id is not matched, so "brand" does not find everything.
 */
export function searchBrands(query: string): BrandIconDef[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...BRAND_ICONS];
  return BRAND_ICONS.filter((icon) =>
    matches(needle, [
      icon.id.slice("brand-".length),
      icon.title,
      ...(icon.keywords ?? []),
    ]),
  );
}
