/**
 * Automatic icon rules: "hosts with tag X", "hosts whose name contains Y" or
 * "hosts whose name matches a regular expression" get an icon, a color and a
 * corner badge.
 *
 * A rule gives an icon (with its color and badge), or, with its icon empty,
 * only a color and/or a badge for hosts that already have an icon. By default
 * a rule fills in what a host lacks; with `override` it replaces what the host
 * has, because core does not say whether an icon is the host's own or
 * inherited from a default. The first rule that applies decides the icon,
 * the color and the badge together.
 *
 * This file is pure. It takes rule lists (one per level) and a host, so a
 * second level, for example an admin's rules for everyone, can be added by
 * passing one more list. Today the only level is the user's own.
 */

import {
  BADGE_KEY,
  COLOR_KEY,
  PLUGIN_ID,
  findIcon,
  normalizeColor,
  parseBadge,
  readLayers,
  resolveIconForHost,
  type IconLayers,
  type ResolvedHostIcon,
} from "./icons";

/** User setting key, as declared in manifest.json. */
export const RULES_KEY = "rules";

export const RULE_MATCHES = ["tag", "name", "regex"] as const;

/**
 * tag: the host has this tag, compared whole and ignoring case.
 * name: the host name contains this text, ignoring case.
 * regex: the host name matches this JavaScript regular expression, ignoring
 * case. Not anchored: add ^ and $ to match the whole name.
 */
export type RuleMatch = (typeof RULE_MATCHES)[number];

export interface IconRule {
  match: RuleMatch;
  value: string;
  /**
   * An id from the icon catalog. Empty means "keep the host's icon": the rule
   * then only sets a color, and only for a host that has an icon.
   */
  icon: string;
  /** "#rrggbb", or empty for the theme color. */
  color: string;
  /**
   * A corner badge in the stored format of the host setting: "" for none,
   * "dot" or "text:<1 or 2 characters>". Rules written before badges existed
   * read as "".
   */
  badge: string;
  /** "#rrggbb" of the badge, or empty for the theme chip. Needs a badge. */
  badgeColor: string;
  /**
   * False: the rule only fills in what the host has not got (an icon, a
   * color or a badge). True: it applies over the host's icon, color or badge,
   * own or default; an empty color or badge keeps the host's.
   */
  override: boolean;
}

/** Rules in order, first match wins. One list per level. */
export type RuleList = readonly IconRule[];

export const NO_RULES: readonly RuleList[] = [];

export function newRule(): IconRule {
  return {
    match: "tag",
    value: "",
    icon: "",
    color: "",
    badge: "",
    badgeColor: "",
    override: false,
  };
}

/**
 * The stored rules as they are, for the editor: every entry that has a known
 * kind of match, with the color string kept as typed, even a half-finished
 * hex. A rule with no value yet, or nothing to give, stays, so the user can
 * finish it. A stored rule without `override` (written before it existed)
 * does not override.
 */
export function readRules(raw: unknown): IconRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: IconRule[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { match, value, icon, color, badge, badgeColor, override } =
      entry as Record<string, unknown>;
    if (!RULE_MATCHES.includes(match as RuleMatch)) continue;
    if (typeof value !== "string" || typeof icon !== "string") continue;
    rules.push({
      match: match as RuleMatch,
      value,
      icon,
      color: typeof color === "string" ? color : "",
      badge: typeof badge === "string" ? badge : "",
      badgeColor: typeof badgeColor === "string" ? badgeColor : "",
      override: override === true,
    });
  }
  return rules;
}

/**
 * `readRules` with every color valid or empty and every badge canonical or
 * empty: what evaluation works from. A badge color without a badge is empty.
 */
export function parseRules(raw: unknown): IconRule[] {
  return readRules(raw).map((rule) => {
    const badge = parseBadge(rule.badge)?.id ?? "";
    return {
      ...rule,
      color: normalizeColor(rule.color) ?? "",
      badge,
      badgeColor: badge ? (normalizeColor(rule.badgeColor) ?? "") : "",
    };
  });
}

// Rules are matched against every host on every render, so each pattern is
// compiled once. Null marks a pattern that does not compile.
const patterns = new Map<string, RegExp | null>();

/** The rule's regular expression, or null when it is not a valid one. */
export function rulePattern(value: string): RegExp | null {
  const source = value.trim();
  if (source === "") return null;
  let pattern = patterns.get(source);
  if (pattern === undefined) {
    try {
      pattern = new RegExp(source, "i");
    } catch {
      pattern = null;
    }
    patterns.set(source, pattern);
  }
  return pattern;
}

/** Whether a rule has a value to look for and something to give. */
export function isComplete(rule: IconRule): boolean {
  if (rule.value.trim() === "") return false;
  if (rule.match === "regex" && !rulePattern(rule.value)) return false;
  const icon = rule.icon.trim();
  if (icon === "")
    return (
      normalizeColor(rule.color) !== null || parseBadge(rule.badge) !== null
    );
  return findIcon(icon) !== undefined;
}

/**
 * The rules that can apply. An unknown icon id skips the rule; unlike a
 * host's own icon, a rule never draws the fallback. A rule with no icon, no
 * color and no badge gives nothing, so it is dropped too.
 */
export function activeRules(raw: unknown): IconRule[] {
  return parseRules(raw).flatMap((rule) =>
    isComplete(rule)
      ? [{ ...rule, value: rule.value.trim(), icon: rule.icon.trim() }]
      : [],
  );
}

interface Matchable {
  name?: string;
  tags?: string[];
}

type RuleHost = Matchable & {
  pluginSettings?: Record<string, Record<string, unknown>>;
};

export function ruleMatches(rule: IconRule, host: Matchable): boolean {
  const value = rule.value.trim().toLowerCase();
  if (!value) return false;
  if (rule.match === "regex") {
    const pattern = rulePattern(rule.value);
    return (
      pattern !== null &&
      typeof host.name === "string" &&
      pattern.test(host.name)
    );
  }
  if (rule.match === "tag") {
    return (host.tags ?? []).some(
      (tag) => typeof tag === "string" && tag.trim().toLowerCase() === value,
    );
  }
  return (
    typeof host.name === "string" && host.name.toLowerCase().includes(value)
  );
}

function hostColorOf(host: RuleHost): string | null {
  return normalizeColor(host.pluginSettings?.[PLUGIN_ID]?.[COLOR_KEY]);
}

function hostBadgeOf(host: RuleHost) {
  return parseBadge(host.pluginSettings?.[PLUGIN_ID]?.[BADGE_KEY]);
}

/**
 * Whether a rule applies to a host: it matches, and the host is in the state
 * the rule is for.
 * - An icon rule (its color and badge go with the icon) without override
 *   needs a host with no icon.
 * - A rule with no icon, giving a color and/or a badge, needs a host with an
 *   icon. Without override it also needs something to fill: no color for a
 *   color, no badge for a badge.
 * - With override, a rule applies to any host it matches (a no-icon rule
 *   still needs the host's icon).
 */
export function ruleApplies(rule: IconRule, host: RuleHost): boolean {
  if (!ruleMatches(rule, host)) return false;
  const hasIcon = resolveIconForHost(host) !== null;
  if (rule.icon.trim() === "") {
    if (!hasIcon) return false;
    if (rule.override) return true;
    const fillsColor =
      normalizeColor(rule.color) !== null && hostColorOf(host) === null;
    const fillsBadge =
      parseBadge(rule.badge) !== null && hostBadgeOf(host) === null;
    return fillsColor || fillsBadge;
  }
  return rule.override || !hasIcon;
}

/** The first rule that applies, going through the lists in order. */
export function findRule(
  lists: readonly RuleList[],
  host: RuleHost,
): IconRule | null {
  for (const list of lists) {
    for (const rule of list) {
      if (ruleApplies(rule, host)) return rule;
    }
  }
  return null;
}

export interface HostAppearance {
  /** What to draw, or null for no icon. */
  resolved: ResolvedHostIcon | null;
  /** The rule that changed what the host shows. Null when none did. */
  rule: IconRule | null;
}

/**
 * What a host row shows. The host's own icon, which already includes the
 * folder, user and server defaults, is the start; the first rule that
 * applies then changes it, all of icon, color and badge from that one rule.
 * Color: a rule that overrides sets its color (an empty one keeps the host's),
 * one that does not yields to the host's color. Badge the same way: an
 * overriding rule's badge replaces the host's (an empty one keeps it, and an
 * empty badge color keeps the host's badge color); otherwise the host's badge
 * wins and the rule's fills only a host with none. A badge is drawn only on a
 * base icon, which is the caller's check, as for the host's own.
 */
export function resolveAppearance(
  host: RuleHost,
  lists: readonly RuleList[],
): HostAppearance {
  const own = resolveIconForHost(host);
  const rule = findRule(lists, host);
  if (!rule) return { resolved: own, rule: null };
  const ruleColor = normalizeColor(rule.color);
  const hostColor = hostColorOf(host);
  const color = rule.override
    ? (ruleColor ?? hostColor)
    : (hostColor ?? ruleColor);
  const icon = findIcon(rule.icon);
  if (!icon && rule.icon.trim() !== "") return { resolved: own, rule: null };
  const layers = ruleLayers(rule, readLayers(host.pluginSettings?.[PLUGIN_ID]));
  if (!icon) {
    // A color or badge rule without an icon: ruleApplies made sure the host
    // has an icon.
    return own
      ? { resolved: { ...own, color, ...layers }, rule }
      : { resolved: own, rule: null };
  }
  return { resolved: { icon, color, known: true, ...layers }, rule };
}

/** The badge and its color after a rule, from the host's own layers. */
function ruleLayers(rule: IconRule, host: IconLayers): IconLayers {
  const ruleBadge = parseBadge(rule.badge);
  const ruleBadgeColor = normalizeColor(rule.badgeColor);
  // The rule's badge is used when it has one and either overrides or the
  // host has none; otherwise the host keeps its own badge and color.
  const fromRule = ruleBadge !== null && (rule.override || !host.badge);
  if (!fromRule) return host;
  const badgeColor = rule.override
    ? (ruleBadgeColor ?? host.badgeColor)
    : ruleBadgeColor;
  return { badge: ruleBadge, ...(badgeColor ? { badgeColor } : {}) };
}

export function sameRuleLists(
  a: readonly RuleList[],
  b: readonly RuleList[],
): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
