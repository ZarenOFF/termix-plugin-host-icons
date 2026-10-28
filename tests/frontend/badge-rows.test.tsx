import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import { hostBadgesFor, useHostBadges } from "@termix-ssh/plugin-sdk/ui";
import * as plugin from "../../src/frontend/index";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const userSettings: { values: Record<string, unknown> } = { values: {} };
vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSettings: () => ({ ...userSettings, loaded: true, save: vi.fn() }),
}));

const manifest = manifestJson as unknown as PluginManifest;

type TestHost = Record<string, unknown> & { id: string; name: string };

function host(
  id: string,
  settings: Record<string, unknown>,
  tags: string[] = [],
): TestHost {
  return {
    id,
    name: `host-${id}`,
    ip: `10.0.0.${id}`,
    port: 22,
    tags,
    pluginSettings: { "host-icons": settings },
  };
}

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

async function renderRows(hosts: TestHost[], values = {}) {
  userSettings.values = values;
  rendered = await renderWithApp(plugin, { manifest, locales, hosts });
  rendered.renderSlot("shell.overlay");
  render(
    <>
      {hosts.map((item) => (
        <Row key={item.id} host={item} />
      ))}
    </>,
  );
  await act(async () => {});
  return (item: TestHost) => screen.getByTestId(`row-${item.id}`);
}

const BADGE = "[data-testid=host-icon-badge]";

describe("every kind of host in one list", () => {
  const lucide = host("1", { icon: "database" });
  const helm = host("2", { icon: "brand-helm" });
  const kube = host("3", { icon: "brand-kubernetes", color: "#326ce5" });
  const withBadge = host("4", { icon: "brand-helm", badge: "text:R1" });
  const dotOnly = host("5", { icon: "server", badge: "dot" });
  const badgeNoIcon = host("6", { badge: "text:R1" });
  const nothing = host("7", {});
  const ruled = host("8", {}, ["k8s"]);
  const ruledWithBadge = host("9", { badge: "dot" }, ["k8s"]);
  const hosts = [
    lucide,
    helm,
    kube,
    withBadge,
    dotOnly,
    badgeNoIcon,
    nothing,
    ruled,
    ruledWithBadge,
  ];
  const rules = [
    {
      match: "tag",
      value: "k8s",
      icon: "brand-kubernetes",
      color: "",
      override: false,
    },
  ];

  it("draws the icon of a host without layers as a plain icon", async () => {
    const row = await renderRows(hosts, { rules });
    for (const item of [lucide, helm, kube]) {
      const badge = row(item).querySelector<HTMLElement>(BADGE);
      expect(badge, item.name).not.toBeNull();
      expect(badge!.querySelector("[data-host-icon-layers]")).toBeNull();
      expect(badge!.querySelector("svg")).not.toBeNull();
    }
    expect(
      row(helm).querySelector(BADGE)!.querySelector("[data-brand]"),
    ).not.toBeNull();
    expect(
      row(kube).querySelector<SVGElement>(`${BADGE} svg`)!.style.color,
    ).toBe("rgb(50, 108, 229)");
  });

  it("draws an icon with a badge, layered", async () => {
    const row = await renderRows(hosts, { rules });
    for (const item of [withBadge, dotOnly]) {
      const badge = row(item).querySelector<HTMLElement>(BADGE)!;
      expect(badge.querySelector("[data-host-icon-layers]")).not.toBeNull();
      expect(badge.querySelector("[data-layer='art'] svg")).not.toBeNull();
      expect(badge.querySelector("[data-layer='badge']")).not.toBeNull();
    }
  });

  it("draws the icon a rule gives to a host without one", async () => {
    const row = await renderRows(hosts, { rules });
    const badge = row(ruled).querySelector<HTMLElement>(BADGE)!;
    expect(badge.dataset.hostIconSource).toBe("rule");
    expect(badge.querySelector("[data-brand]")).not.toBeNull();
    expect(badge.querySelector("[data-host-icon-layers]")).toBeNull();
  });

  it("keeps the host's badge on a rule's icon", async () => {
    const row = await renderRows(hosts, { rules });
    const badge = row(ruledWithBadge).querySelector<HTMLElement>(BADGE)!;
    expect(badge.dataset.hostIconSource).toBe("rule");
    expect(badge.querySelector("[data-badge-kind='dot']")).not.toBeNull();
  });

  it("draws nothing for a badge without an icon, or no setting at all", async () => {
    const row = await renderRows(hosts, { rules, skipEmptySlot: true });
    expect(row(badgeNoIcon).querySelector(BADGE)).toBeNull();
    expect(row(nothing).querySelector(BADGE)).toBeNull();
    expect(row(badgeNoIcon).querySelector("[data-layer='badge']")).toBeNull();
  });

  it("gives a host without an icon an empty slot once others have one", async () => {
    const row = await renderRows(hosts, { rules, skipEmptySlot: false });
    expect(
      row(nothing).querySelector("[data-testid=host-icon-slot]"),
    ).not.toBeNull();
    expect(
      row(lucide).querySelector("[data-testid=host-icon-slot]"),
    ).toBeNull();
  });
});
