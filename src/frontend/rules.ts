/**
 * Automatic icon rules: "hosts with tag X" or "hosts whose name contains Y"
 * get an icon and a color.
 *
 * A rule gives an icon (and maybe a color), or only a color (its icon is
 * empty) for hosts that already have an icon. By default a rule fills in what
 * a host lacks; with `override` it replaces what the host has, because core
 * does not say whether an icon is the host's own or inherited from a default.
 *
 * This file is pure. It takes rule lists (one per level) and a host, so a
 * second level, for example an admin's rules for everyone, can be added by
 * passing one more list. Today the only level is the user's own.
 */

import {
  COLOR_KEY,
  PLUGIN_ID,
  findIcon,
  normalizeColor,
  resolveIconForHost,
  type ResolvedHostIcon,
} from "./icons";

/** User setting key, as declared in manifest.json. */
export const RULES_KEY = "rules";

export const RULE_MATCHES = ["tag", "name"] as const;

/**
 * tag: the host has this tag, compared whole and ignoring case.
 * name: the host name contains this text, ignoring case.
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
   * False: the rule only fills in what the host has not got (an icon, or a
   * color). True: it applies over the host's icon or color, own or default.
   */
  override: boolean;
}

/** Rules in order, first match wins. One list per level. */
export type RuleList = readonly IconRule[];

export const NO_RULES: readonly RuleList[] = [];

export function newRule(): IconRule {
  return { match: "tag", value: "", icon: "", color: "", override: false };
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
    const { match, value, icon, color, override } = entry as Record<
      string,
      unknown
    >;
    if (!RULE_MATCHES.includes(match as RuleMatch)) continue;
    if (typeof value !== "string" || typeof icon !== "string") continue;
    rules.push({
      match: match as RuleMatch,
      value,
      icon,
      color: typeof color === "string" ? color : "",
      override: override === true,
    });
  }
  return rules;
}

/** `readRules` with every color valid or empty: what evaluation works from. */
export function parseRules(raw: unknown): IconRule[] {
  return readRules(raw).map((rule) => ({
    ...rule,
    color: normalizeColor(rule.color) ?? "",
  }));
}

/** Whether a rule has a value to look for and something to give. */
export function isComplete(rule: IconRule): boolean {
  if (rule.value.trim() === "") return false;
  const icon = rule.icon.trim();
  if (icon === "") return normalizeColor(rule.color) !== null;
  return findIcon(icon) !== undefined;
}

/**
 * The rules that can apply. An unknown icon id skips the rule; unlike a
 * host's own icon, a rule never draws the fallback. A rule with neither an
 * icon nor a color gives nothing, so it is dropped too.
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

/**
 * Whether a rule applies to a host: it matches, and the host is in the state
 * the rule is for.
 * - An icon rule without override needs a host with no icon.
 * - A color-only rule needs a host with an icon, and without override also
 *   one with no color.
 * - With override, an icon rule applies to any host it matches.
 */
export function ruleApplies(rule: IconRule, host: RuleHost): boolean {
  if (!ruleMatches(rule, host)) return false;
  const hasIcon = resolveIconForHost(host) !== null;
  if (rule.icon.trim() === "") {
    if (!hasIcon) return false;
    return rule.override || hostColorOf(host) === null;
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
 * applies then changes it. Color: a rule that overrides sets its color (an
 * empty one keeps the host's), one that does not yields to the host's color.
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
  if (!icon) {
    // A color-only rule: ruleApplies made sure the host has an icon.
    return own
      ? { resolved: { ...own, color }, rule }
      : { resolved: own, rule: null };
  }
  return { resolved: { icon, color, known: true }, rule };
}

export function sameRuleLists(
  a: readonly RuleList[],
  b: readonly RuleList[],
): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
