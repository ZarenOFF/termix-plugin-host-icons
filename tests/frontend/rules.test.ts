import { describe, expect, it } from "vitest";
import {
  activeRules,
  findRule,
  parseRules,
  readRules,
  resolveAppearance,
  ruleMatches,
  type IconRule,
} from "../../src/frontend/rules";

const rule = (over: Partial<IconRule> = {}): IconRule => ({
  match: "tag",
  value: "prod",
  icon: "database",
  color: "",
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
      { match: "tag", value: "a", icon: "cloud", color: "", override: false },
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
