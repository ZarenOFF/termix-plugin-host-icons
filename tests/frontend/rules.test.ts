import { describe, expect, it } from "vitest";
import {
  activeRules,
  findRule,
  parseRules,
  readRules,
  resolveAppearance,
  ruleMatches,
  rulePattern,
  type IconRule,
} from "../../src/frontend/rules";

const rule = (over: Partial<IconRule> = {}): IconRule => ({
  match: "tag",
  value: "prod",
  icon: "database",
  color: "",
  badge: "",
  badgeColor: "",
  override: false,
  ...over,
});

const host = (
  over: Record<string, unknown> = {},
  settings: Record<string, unknown> = {},
) => ({
  name: "Web-1",
  tags: ["Prod", "eu"],
  pluginSettings: { "host-icons": settings },
  ...over,
});

describe("rule matching", () => {
  it("matches a tag whole and ignores case", () => {
    expect(ruleMatches(rule(), host())).toBe(true);
    expect(ruleMatches(rule({ value: "PROD" }), host())).toBe(true);
    expect(ruleMatches(rule({ value: " eu " }), host())).toBe(true);
    expect(ruleMatches(rule({ value: "pro" }), host())).toBe(false);
    expect(ruleMatches(rule(), host({ tags: undefined }))).toBe(false);
  });

  it("matches part of a name and ignores case", () => {
    const byName = (value: string) => rule({ match: "name", value });
    expect(ruleMatches(byName("web"), host())).toBe(true);
    expect(ruleMatches(byName("B-1"), host())).toBe(true);
    expect(ruleMatches(byName("db"), host())).toBe(false);
  });

  it("matches a name by regular expression and ignores case", () => {
    const byRegex = (value: string) => rule({ match: "regex", value });
    expect(ruleMatches(byRegex("^web-\\d+$"), host())).toBe(true);
    expect(ruleMatches(byRegex("^(db|WEB)-"), host())).toBe(true);
    expect(ruleMatches(byRegex(" -1$ "), host())).toBe(true);
    expect(ruleMatches(byRegex("^eb"), host())).toBe(false);
    expect(ruleMatches(byRegex("web"), host({ name: undefined }))).toBe(false);
  });

  it("never matches a pattern that does not compile", () => {
    const broken = rule({ match: "regex", value: "web(" });
    expect(rulePattern("web(")).toBeNull();
    expect(ruleMatches(broken, host({ name: "web(" }))).toBe(false);
    expect(activeRules([broken])).toEqual([]);
    expect(readRules([broken])).toEqual([broken]);
    expect(activeRules([{ ...broken, value: "web" }])).toHaveLength(1);
  });

  it("never matches an empty value", () => {
    expect(ruleMatches(rule({ value: "" }), host({ tags: [""] }))).toBe(false);
    expect(
      ruleMatches(rule({ match: "name", value: "  " }), host({ name: " x" })),
    ).toBe(false);
  });

  it("lets the first matching rule win, across lists", () => {
    const first = rule({ icon: "cloud" });
    const second = rule({ icon: "router" });
    expect(findRule([[first, second]], host())).toBe(first);
    expect(findRule([[rule({ value: "none" })], [second]], host())).toBe(
      second,
    );
    expect(findRule([[rule({ value: "none" })]], host())).toBeNull();
    expect(findRule([], host())).toBeNull();
  });
});

describe("reading stored rules", () => {
  it("drops malformed entries", () => {
    expect(parseRules("nope")).toEqual([]);
    expect(
      parseRules([
        null,
        "x",
        { match: "folder", value: "a", icon: "cloud", color: "" },
        { match: "tag", value: 3, icon: "cloud", color: "" },
        { match: "tag", value: "a", icon: null, color: "" },
        { match: "tag", value: "a", icon: "cloud", color: "" },
      ]),
    ).toEqual([
      {
        match: "tag",
        value: "a",
        icon: "cloud",
        color: "",
        badge: "",
        badgeColor: "",
        override: false,
      },
    ]);
  });

  it("turns an invalid color into the theme color", () => {
    expect(parseRules([rule({ color: "red" })])[0]!.color).toBe("");
    expect(parseRules([rule({ color: "#ABC" })])[0]!.color).toBe("#aabbcc");
    // The editor reads the color as stored, so a half-typed hex survives.
    expect(readRules([rule({ color: "#12" })])[0]!.color).toBe("#12");
    expect(readRules([rule({ color: 5 as never })])[0]!.color).toBe("");
    expect(activeRules([rule({ color: "#12" })])[0]!.color).toBe("");
  });

  it("reads a rule stored before override existed as not overriding", () => {
    const old = { match: "tag", value: "a", icon: "cloud", color: "" };
    expect(parseRules([old])[0]!.override).toBe(false);
    expect(parseRules([{ ...old, override: "yes" }])[0]!.override).toBe(false);
    expect(parseRules([{ ...old, override: true }])[0]!.override).toBe(true);
  });

  it("drops a rule with neither an icon nor a color", () => {
    expect(activeRules([rule({ icon: "", color: "" })])).toEqual([]);
    expect(activeRules([rule({ icon: "", color: "red" })])).toEqual([]);
    expect(activeRules([rule({ icon: "", color: "#ff0000" })])).toHaveLength(1);
  });

  it("keeps only rules that can apply", () => {
    expect(
      activeRules([
        rule({ icon: "no-such-icon" }),
        rule({ icon: "" }),
        rule({ value: " " }),
        rule({ icon: "brand-ubuntu", value: " prod " }),
        rule({ icon: "cloud" }),
      ]),
    ).toEqual([rule({ icon: "brand-ubuntu" }), rule({ icon: "cloud" })]);
  });
});

describe("what a host shows", () => {
  const lists = [activeRules([rule({ color: "#ff0000" })])];

  it("uses the rule for a host without an icon", () => {
    const shown = resolveAppearance(host(), lists);
    expect(shown.resolved?.icon.id).toBe("database");
    expect(shown.resolved?.color).toBe("#ff0000");
    expect(shown.rule).toBe(lists[0]![0]);
  });

  it("lets the host's own or default icon win", () => {
    const shown = resolveAppearance(host({}, { icon: "cloud" }), lists);
    expect(shown.resolved?.icon.id).toBe("cloud");
    expect(shown.resolved?.color).toBeNull();
    expect(shown.rule).toBeNull();
  });

  it("lets the host's color win over the rule's", () => {
    const shown = resolveAppearance(host({}, { color: "#00ff00" }), lists);
    expect(shown.resolved?.icon.id).toBe("database");
    expect(shown.resolved?.color).toBe("#00ff00");
  });

  it("falls back to the rule's color when the host color is invalid", () => {
    const shown = resolveAppearance(host({}, { color: "green" }), lists);
    expect(shown.resolved?.color).toBe("#ff0000");
  });

  it("shows nothing when no rule matches", () => {
    expect(resolveAppearance(host({ tags: [] }), lists)).toEqual({
      resolved: null,
      rule: null,
    });
    expect(resolveAppearance(host(), [])).toEqual({
      resolved: null,
      rule: null,
    });
  });
});

describe("overriding rules", () => {
  const owned = (settings: Record<string, unknown>) => host({}, settings);
  const shownFor = (h: ReturnType<typeof host>, ...rules: IconRule[]) =>
    resolveAppearance(h, [activeRules(rules)]);

  it("lets an override beat the host's own icon and defaults", () => {
    const shown = shownFor(
      owned({ icon: "cloud", color: "#00ff00" }),
      rule({ override: true, color: "#ff0000" }),
    );
    expect(shown.resolved?.icon.id).toBe("database");
    expect(shown.resolved?.color).toBe("#ff0000");
    expect(shown.rule).not.toBeNull();
  });

  it("keeps the host's color when an overriding icon rule has none", () => {
    const shown = shownFor(
      owned({ icon: "cloud", color: "#00ff00" }),
      rule({ override: true }),
    );
    expect(shown.resolved?.icon.id).toBe("database");
    expect(shown.resolved?.color).toBe("#00ff00");
  });

  it("skips a rule without override for a host with an icon", () => {
    const shown = shownFor(owned({ icon: "cloud" }), rule());
    expect(shown.resolved?.icon.id).toBe("cloud");
    expect(shown.rule).toBeNull();
  });

  it("lets a later override apply after a skipped rule", () => {
    const later = rule({ icon: "router", override: true });
    const shown = shownFor(owned({ icon: "cloud" }), rule(), later);
    expect(shown.resolved?.icon.id).toBe("router");
    expect(shown.rule).toEqual(later);
  });

  it("lets the first applying rule win, not the first match", () => {
    const shown = shownFor(
      host(),
      rule({ icon: "", color: "#ff0000" }),
      rule({ icon: "router" }),
    );
    expect(shown.resolved?.icon.id).toBe("router");
  });

  it("changes only the color for an overriding color-only rule", () => {
    const shown = shownFor(
      owned({ icon: "cloud", color: "#00ff00" }),
      rule({ icon: "", color: "#ff0000", override: true }),
    );
    expect(shown.resolved?.icon.id).toBe("cloud");
    expect(shown.resolved?.color).toBe("#ff0000");
  });

  it("fills only an empty color for a color-only rule without override", () => {
    const colorOnly = rule({ icon: "", color: "#ff0000" });
    const filled = shownFor(owned({ icon: "cloud" }), colorOnly);
    expect(filled.resolved?.icon.id).toBe("cloud");
    expect(filled.resolved?.color).toBe("#ff0000");
    const kept = shownFor(
      owned({ icon: "cloud", color: "#00ff00" }),
      colorOnly,
    );
    expect(kept.resolved?.color).toBe("#00ff00");
    expect(kept.rule).toBeNull();
  });

  it("does not apply a color-only rule to a host without an icon", () => {
    const colorOnly = rule({ icon: "", color: "#ff0000", override: true });
    expect(shownFor(host(), colorOnly)).toEqual({ resolved: null, rule: null });
    const later = rule({ icon: "router" });
    const shown = shownFor(host(), colorOnly, later);
    expect(shown.resolved?.icon.id).toBe("router");
    expect(shown.resolved?.color).toBeNull();
  });
});

describe("rules with a badge", () => {
  const owned = (settings: Record<string, unknown>) => host({}, settings);
  const shownFor = (h: ReturnType<typeof host>, ...rules: IconRule[]) =>
    resolveAppearance(h, [activeRules(rules)]);
  const badgeOnly = (over: Partial<IconRule> = {}) =>
    rule({ icon: "", badge: "text:PR", badgeColor: "#00ff00", ...over });

  it("reads a rule stored before badges existed as having none", () => {
    const old = { match: "tag", value: "a", icon: "cloud", color: "" };
    const [read] = parseRules([old]);
    expect(read!.badge).toBe("");
    expect(read!.badgeColor).toBe("");
    expect(readRules([old])[0]!.badge).toBe("");
  });

  it("normalizes a badge and drops its color without one", () => {
    const [read] = parseRules([rule({ badge: "text:ab", badgeColor: "#ABC" })]);
    expect(read!.badge).toBe("text:ab");
    expect(read!.badgeColor).toBe("#aabbcc");
    const [none] = parseRules([rule({ badge: "nope", badgeColor: "#ff0000" })]);
    expect(none!.badge).toBe("");
    expect(none!.badgeColor).toBe("");
    // The editor keeps what is typed.
    expect(
      readRules([rule({ badge: "dot", badgeColor: "#12" })])[0],
    ).toMatchObject({ badge: "dot", badgeColor: "#12" });
  });

  it("keeps a rule that has only a badge, and drops one with a bad badge", () => {
    expect(activeRules([badgeOnly()])).toHaveLength(1);
    expect(activeRules([badgeOnly({ badge: "dot" })])).toHaveLength(1);
    expect(activeRules([badgeOnly({ badge: "text:" })])).toEqual([]);
    expect(activeRules([badgeOnly({ badge: "" })])).toEqual([]);
  });

  it("gives a badge to a host with an icon and none, without override", () => {
    const shown = shownFor(owned({ icon: "cloud" }), badgeOnly());
    expect(shown.resolved?.icon.id).toBe("cloud");
    expect(shown.resolved?.badge?.id).toBe("text:PR");
    expect(shown.resolved?.badgeColor).toBe("#00ff00");
    expect(shown.rule).not.toBeNull();
  });

  it("does not give a badge-only rule to a host without an icon", () => {
    expect(shownFor(host(), badgeOnly({ override: true }))).toEqual({
      resolved: null,
      rule: null,
    });
  });

  it("keeps the host's badge and color over a rule without override", () => {
    const shown = shownFor(
      owned({ icon: "cloud", badge: "dot", badgeColor: "#ff0000" }),
      badgeOnly(),
    );
    expect(shown.resolved?.badge?.id).toBe("dot");
    expect(shown.resolved?.badgeColor).toBe("#ff0000");
    expect(shown.rule).toBeNull();
  });

  it("lets a rule with a badge and a color fill each only when empty", () => {
    const both = badgeOnly({ color: "#0000ff" });
    // The host has a color but no badge: the rule still applies for the badge.
    const shown = shownFor(owned({ icon: "cloud", color: "#ff0000" }), both);
    expect(shown.resolved?.color).toBe("#ff0000");
    expect(shown.resolved?.badge?.id).toBe("text:PR");
    // The host has a badge but no color: the rule applies for the color.
    const other = shownFor(owned({ icon: "cloud", badge: "dot" }), both);
    expect(other.resolved?.color).toBe("#0000ff");
    expect(other.resolved?.badge?.id).toBe("dot");
  });

  it("replaces the host's badge with an overriding rule's", () => {
    const shown = shownFor(
      owned({ icon: "cloud", badge: "dot", badgeColor: "#ff0000" }),
      badgeOnly({ override: true }),
    );
    expect(shown.resolved?.badge?.id).toBe("text:PR");
    expect(shown.resolved?.badgeColor).toBe("#00ff00");
  });

  it("keeps the host's badge color when an overriding badge has none", () => {
    const shown = shownFor(
      owned({ icon: "cloud", badge: "dot", badgeColor: "#ff0000" }),
      badgeOnly({ override: true, badgeColor: "" }),
    );
    expect(shown.resolved?.badge?.id).toBe("text:PR");
    expect(shown.resolved?.badgeColor).toBe("#ff0000");
  });

  it("keeps the host's badge when an overriding rule has an empty one", () => {
    const shown = shownFor(
      owned({ icon: "cloud", badge: "dot", badgeColor: "#ff0000" }),
      rule({ icon: "router", override: true }),
    );
    expect(shown.resolved?.icon.id).toBe("router");
    expect(shown.resolved?.badge?.id).toBe("dot");
    expect(shown.resolved?.badgeColor).toBe("#ff0000");
  });

  it("brings the badge along with an icon the rule gives", () => {
    const shown = shownFor(
      host(),
      rule({ badge: "dot", badgeColor: "#00ff00" }),
    );
    expect(shown.resolved?.icon.id).toBe("database");
    expect(shown.resolved?.badge?.id).toBe("dot");
    expect(shown.resolved?.badgeColor).toBe("#00ff00");
  });

  it("lets the first applying rule decide all of icon, color and badge", () => {
    const shown = shownFor(
      owned({ icon: "cloud" }),
      badgeOnly({ badge: "text:A", color: "" }),
      badgeOnly({ badge: "text:B", color: "#ff0000" }),
    );
    expect(shown.resolved?.badge?.id).toBe("text:A");
    expect(shown.resolved?.color).toBeNull();
  });

  it("leaves a host's badge alone when no rule applies", () => {
    const shown = shownFor(
      owned({ icon: "cloud", badge: "dot" }),
      rule({ value: "other" }),
    );
    expect(shown.resolved?.badge?.id).toBe("dot");
    expect(shown.rule).toBeNull();
  });
});
