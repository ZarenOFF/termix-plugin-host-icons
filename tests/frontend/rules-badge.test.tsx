import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import { hostBadgesFor, useHostBadges } from "@termix-ssh/plugin-sdk/ui";
import * as plugin from "../../src/frontend/index";
import {
  createPreferences,
  type IconLayout,
} from "../../src/frontend/preferences";
import { activeRules, type IconRule } from "../../src/frontend/rules";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const userSettings: { values: Record<string, unknown> } = { values: {} };
vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSettings: () => ({ ...userSettings, loaded: true, save: vi.fn() }),
}));

const manifest = manifestJson as unknown as PluginManifest;

type TestHost = Record<string, unknown> & { id: string; name: string };

const tagged: TestHost = {
  id: "1",
  name: "db-1",
  ip: "10.0.0.1",
  port: 22,
  tags: ["prod"],
  pluginSettings: {},
};
const plain: TestHost = {
  id: "2",
  name: "web-1",
  ip: "10.0.0.2",
  port: 22,
  tags: [],
  pluginSettings: {},
};
const own: TestHost = {
  id: "3",
  name: "prod-3",
  ip: "10.0.0.3",
  port: 22,
  tags: ["prod"],
  pluginSettings: { "host-icons": { icon: "cloud" } },
};

const prodRule: IconRule = {
  match: "tag",
  value: "prod",
  icon: "database",
  color: "#ff0000",
  override: false,
};

let rendered: RenderedPluginApp | null = null;

beforeEach(() => {
  userSettings.values = {};
});

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

function Row({ host }: { host: TestHost }) {
  const badges = hostBadgesFor(useHostBadges(), host as never);
  return (
    <div data-testid={`row-${host.id}`}>
      {badges.map((badge) => {
        const Badge = badge.component;
        return <Badge key={badge.id} host={host as never} />;
      })}
    </div>
  );
}

async function renderRows(
  hosts: TestHost[],
  values: Record<string, unknown>,
): Promise<(host: TestHost) => HTMLElement> {
  userSettings.values = values;
  rendered = await renderWithApp(plugin, { manifest, locales, hosts });
  rendered.renderSlot("shell.overlay");
  render(
    <>
      {hosts.map((host) => (
        <Row key={host.id} host={host} />
      ))}
    </>,
  );
  await act(async () => {});
  return (host) => screen.getByTestId(`row-${host.id}`);
}

describe("badge for a host matched by a rule", () => {
  it("draws the rule's icon and color for a host without an icon", async () => {
    const row = await renderRows([tagged], { rules: [prodRule] });
    const badge = row(tagged).querySelector<HTMLElement>(
      "[data-testid=host-icon-badge]",
    )!;
    expect(badge.dataset.hostIconSource).toBe("rule");
    expect(badge.getAttribute("aria-label")).toBe(locales.icons.database);
    expect(badge.querySelector("svg")!.style.color).toBe("rgb(255, 0, 0)");
  });

  it("draws nothing for a host no rule matches", async () => {
    const row = await renderRows([plain], { rules: [prodRule] });
    expect(
      row(plain).querySelector("[data-testid=host-icon-badge]"),
    ).toBeNull();
  });

  it("keeps a host's own icon over a matching rule", async () => {
    const row = await renderRows([own], { rules: [prodRule] });
    const badge = row(own).querySelector<HTMLElement>(
      "[data-testid=host-icon-badge]",
    )!;
    expect(badge.dataset.hostIconSource).toBeUndefined();
    expect(badge.getAttribute("aria-label")).toBe(locales.icons.cloud);
  });

  it("draws an overriding rule over a host's own icon", async () => {
    const row = await renderRows([own], {
      rules: [{ ...prodRule, override: true }],
    });
    const badge = row(own).querySelector<HTMLElement>(
      "[data-testid=host-icon-badge]",
    )!;
    expect(badge.dataset.hostIconSource).toBe("rule");
    expect(badge.getAttribute("aria-label")).toBe(locales.icons.database);
  });

  it("recolors a host's own icon with a color-only rule", async () => {
    const row = await renderRows([own], {
      rules: [{ ...prodRule, icon: "", override: true }],
    });
    const badge = row(own).querySelector<HTMLElement>(
      "[data-testid=host-icon-badge]",
    )!;
    expect(badge.getAttribute("aria-label")).toBe(locales.icons.cloud);
    expect(badge.querySelector("svg")!.style.color).toBe("rgb(255, 0, 0)");
  });

  it("skips a rule whose icon this version does not know", async () => {
    const row = await renderRows([tagged], {
      rules: [{ ...prodRule, icon: "gone" }],
    });
    expect(
      row(tagged).querySelector("[data-testid=host-icon-badge]"),
    ).toBeNull();
  });

  it("ignores stored rules that are not a list", async () => {
    const row = await renderRows([tagged], { rules: "oops" });
    expect(
      row(tagged).querySelector("[data-testid=host-icon-badge]"),
    ).toBeNull();
  });
});

describe("empty slot", () => {
  it("counts an icon a rule gives as an icon", async () => {
    const row = await renderRows([tagged, plain], {
      rules: [prodRule],
      skipEmptySlot: false,
    });
    expect(
      row(tagged).querySelector("[data-testid=host-icon-badge]"),
    ).not.toBeNull();
    expect(
      row(plain).querySelector("[data-testid=host-icon-slot]"),
    ).not.toBeNull();
  });

  it("leaves rows alone when no rule matches and no host has an icon", async () => {
    const row = await renderRows([plain], {
      rules: [prodRule],
      skipEmptySlot: false,
    });
    expect(row(plain).querySelector("[data-testid=host-icon-slot]")).toBeNull();
  });
});

describe("preferences store", () => {
  const layout = (rules: IconLayout["rules"]): IconLayout => ({
    position: "large",
    anyIcon: false,
    skipEmptySlot: true,
    rules,
  });

  it("tells subscribers when the rules change, not when they stay equal", () => {
    const preferences = createPreferences();
    const listener = vi.fn();
    preferences.subscribe(listener);
    preferences.set(layout([activeRules([prodRule])]));
    preferences.set(layout([activeRules([prodRule])]));
    expect(listener).toHaveBeenCalledTimes(1);
    preferences.set(layout([activeRules([{ ...prodRule, color: "" }])]));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
