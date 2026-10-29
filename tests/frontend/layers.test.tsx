import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import { hostBadgesFor, useHostBadges } from "@termix-ssh/plugin-sdk/ui";
import * as plugin from "../../src/frontend/index";
import {
  badgeTextId,
  parseBadge,
  readLayers,
  resolveHostIcon,
} from "../../src/frontend/icons";
import { contrastOn } from "../../src/frontend/LayeredIcon";
import { resolveAppearance } from "../../src/frontend/rules";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;
const css = readFileSync(resolve("src/frontend/host-icons.css"), "utf8");

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

function makeHost(settings: Record<string, unknown>) {
  return {
    id: "1",
    name: "web-1",
    ip: "10.0.0.1",
    port: 22,
    pluginSettings: { "host-icons": settings },
  };
}

function HostRowBadges({ host }: { host: ReturnType<typeof makeHost> }) {
  const badges = hostBadgesFor(useHostBadges(), host as never);
  return (
    <div data-testid="row">
      {badges.map((badge) => {
        const Badge = badge.component;
        return <Badge key={badge.id} host={host as never} />;
      })}
    </div>
  );
}

async function renderRow(settings: Record<string, unknown>) {
  rendered = await renderWithApp(plugin, { manifest, locales });
  render(<HostRowBadges host={makeHost(settings)} />);
  return screen.getByTestId("host-icon-badge");
}

describe("parseBadge", () => {
  it("reads a label of one or two code points", () => {
    expect(parseBadge("text:A")).toEqual({
      id: "text:A",
      kind: "text",
      text: "A",
    });
    expect(parseBadge("  text:  P2 ")).toMatchObject({ text: "P2" });
    expect(parseBadge("text:🔥")).toMatchObject({ text: "🔥" });
    expect(parseBadge("text:🔥🔒")).toMatchObject({ text: "🔥🔒" });
  });

  it("rejects an empty or too long label", () => {
    expect(parseBadge("text:")).toBeNull();
    expect(parseBadge("text:   ")).toBeNull();
    expect(parseBadge("text:ABC")).toBeNull();
    expect(parseBadge("text:🔥🔒🔑")).toBeNull();
    expect(badgeTextId("")).toBeNull();
    expect(badgeTextId(" DB ")).toBe("text:DB");
    expect(badgeTextId("DBA")).toBeNull();
  });

  it("reads a dot, which has no label", () => {
    expect(parseBadge("dot")).toEqual({ id: "dot", kind: "dot" });
    expect(parseBadge(" dot ")).toEqual({ id: "dot", kind: "dot" });
  });

  it("has no symbol badges: an old glyph id is not a badge", () => {
    for (const id of ["lock", "shield", "star", "zap", "key-round", "eye"])
      expect(parseBadge(id)).toBeNull();
  });

  it("ignores an unknown id, a bare label and other values", () => {
    expect(parseBadge("no-such-badge")).toBeNull();
    expect(parseBadge("AB")).toBeNull();
    expect(parseBadge("Lock")).toBeNull();
    expect(parseBadge("")).toBeNull();
    expect(parseBadge(7)).toBeNull();
    expect(parseBadge(null)).toBeNull();
    expect(parseBadge({ id: "lock" })).toBeNull();
  });
});

describe("layers of a resolved host icon", () => {
  it("carries the badge and its color", () => {
    expect(
      resolveHostIcon({
        icon: "database",
        badge: "text:DB",
        badgeColor: "#F00",
      }),
    ).toMatchObject({
      badge: { kind: "text", text: "DB" },
      badgeColor: "#ff0000",
    });
  });

  it("has no layer keys when the host has none", () => {
    const resolved = resolveHostIcon({ icon: "database" })!;
    expect(Object.keys(resolved).sort()).toEqual(["color", "icon", "known"]);
  });

  it("drops a badge color without a badge", () => {
    const resolved = resolveHostIcon({
      icon: "database",
      badgeColor: "#00ff00",
      badge: "text:TOOLONG",
    })!;
    expect(resolved.badge).toBeUndefined();
    expect(resolved.badgeColor).toBeUndefined();
  });

  it("is lenient with values of the wrong type", () => {
    expect(
      resolveHostIcon({
        icon: "database",
        badge: 3,
        badgeColor: {},
      }),
    ).toEqual(resolveHostIcon({ icon: "database" }));
  });

  it("draws nothing without a base icon", () => {
    expect(resolveHostIcon({ badge: "dot" })).toBeNull();
    expect(resolveHostIcon({ icon: "", badge: "dot" })).toBeNull();
    expect(readLayers(undefined)).toEqual({});
  });

  it("keeps the host's layers over an icon from a rule", () => {
    const host = {
      name: "db-1",
      tags: ["prod"],
      pluginSettings: { "host-icons": { badge: "dot" } },
    };
    const { resolved, rule } = resolveAppearance(host, [
      [
        {
          match: "tag",
          value: "prod",
          icon: "database",
          color: "",
          badge: "",
          badgeColor: "",
          override: false,
        },
      ],
    ]);
    expect(rule).not.toBeNull();
    expect(resolved).toMatchObject({
      badge: { id: "dot" },
    });
  });
});

describe("layered icon in the host list", () => {
  it("is a plain icon without layers", async () => {
    const badge = await renderRow({ icon: "database" });
    expect(badge.querySelector("[data-host-icon-layers]")).toBeNull();
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it("draws a text badge as a theme chip with the label cut out", async () => {
    const badge = await renderRow({ icon: "database", badge: "text:DB" });
    const wrapper = badge.querySelector("[data-host-icon-layers]")!;
    expect(wrapper.hasAttribute("data-has-badge")).toBe(true);
    expect(wrapper.getAttribute("data-badge")).toBe("text:DB");
    expect(wrapper.getAttribute("data-badge-kind")).toBe("text");
    // The hole is cut from the layer around the base, not painted.
    const art = wrapper.querySelector("[data-layer='art']")!;
    expect(art.querySelector("[data-layer='base'] svg")).not.toBeNull();
    const chip = wrapper.querySelector("[data-layer='badge']")!;
    expect(chip.getAttribute("data-chip")).toBe("theme");
    const circle = chip.querySelector("circle")!;
    expect(circle.getAttribute("fill")).toBe("currentColor");
    const mask = chip.querySelector("mask")!;
    expect(circle.getAttribute("mask")).toBe(`url(#${mask.id})`);
    expect(mask.querySelector("text")!.textContent).toBe("DB");
  });

  it("draws a colored chip with a readable label", async () => {
    const badge = await renderRow({
      icon: "database",
      badge: "text:A",
      badgeColor: "#facc15",
    });
    const chip = badge.querySelector("[data-layer='badge']")!;
    expect(chip.getAttribute("data-chip")).toBe("color");
    expect(chip.querySelector("circle")!.getAttribute("fill")).toBe("#facc15");
    expect(chip.querySelector("mask")).toBeNull();
    expect(chip.querySelector("text")!.getAttribute("fill")).toBe("#000");
  });

  it("draws a dot as a plain circle with no label", async () => {
    const badge = await renderRow({
      icon: "database",
      badge: "dot",
      badgeColor: "#22c55e",
    });
    const wrapper = badge.querySelector("[data-host-icon-layers]")!;
    expect(wrapper.getAttribute("data-badge-kind")).toBe("dot");
    const chip = wrapper.querySelector("[data-layer='badge']")!;
    expect(chip.querySelector("circle")!.getAttribute("fill")).toBe("#22c55e");
    expect(chip.querySelector("text")).toBeNull();
    expect(chip.querySelector("mask")).toBeNull();
  });

  it("centers the label by its baseline, not by dominant-baseline", async () => {
    const badge = await renderRow({ icon: "database", badge: "text:12" });
    const text = badge.querySelector("[data-layer='badge'] text")!;
    expect(text.getAttribute("text-anchor")).toBe("middle");
    expect(text.getAttribute("dy")).toBe("0.36em");
    expect(text.getAttribute("font-weight")).toBe("700");
    // The label takes the font of the surrounding UI.
    expect(text.getAttribute("font-family")).toBe("inherit");
    expect(text.hasAttribute("dominant-baseline")).toBe(false);
    expect(text.hasAttribute("dominantBaseline")).toBe(false);
  });

  it("keeps the base full size and in place when there is only a badge", async () => {
    const badge = await renderRow({ icon: "database", badge: "text:3" });
    const wrapper = badge.querySelector("[data-host-icon-layers]")!;
    for (const layer of ["art", "base"]) {
      const element = wrapper.querySelector<HTMLElement>(
        `[data-layer='${layer}']`,
      )!;
      expect(element.style.width).toBe("100%");
      expect(element.style.height).toBe("100%");
      expect(element.style.transform).toBe("");
      expect(element.style.padding).toBe("");
      expect(element.style.margin).toBe("");
    }
    // The icon fills the base the way a plain icon fills its box.
    const svg = wrapper.querySelector<SVGElement>("[data-layer='base'] svg")!;
    expect(svg.style.width).toBe("100%");
    expect(svg.style.height).toBe("100%");
  });

  it("draws a badge on a brand logo too", async () => {
    const badge = await renderRow({
      icon: "brand-docker",
      badge: "text:P",
    });
    const wrapper = badge.querySelector("[data-host-icon-layers]")!;
    expect(wrapper.querySelector("[data-layer='badge']")).not.toBeNull();
    const art = wrapper.querySelector("[data-layer='art']")!;
    expect(art.querySelector("[data-brand]")).not.toBeNull();
  });

  it("gives every chip its own mask id, even for equal badges", async () => {
    const a = await renderRow({ icon: "database", badge: "text:DB" });
    const idA = a.querySelector("mask")!.id;
    expect(idA).toMatch(/^host-icon-chip-\d+$/);
    await rendered!.deactivate();
    rendered = null;
    document.body.innerHTML = "";
    const b = await renderRow({ icon: "database", badge: "text:DB" });
    expect(b.querySelector("mask")!.id).not.toBe(idA);
  });
});

describe("layers in the stylesheet", () => {
  it("sizes the wrapper like an icon in all three positions", () => {
    const wrapper = String.raw`> :is\(svg, \[data-custom-icon\], \[data-host-icon-layers\]\)`;
    for (const position of ["small", "after", "large"]) {
      expect(css).toMatch(
        new RegExp(
          String.raw`\[data-host-icon-position="${position}"\]\s*${wrapper}`,
        ),
      );
    }
  });

  it("never sizes the svgs inside a wrapper as icons", () => {
    // Only a direct child is sized: no descendant combinator after a position.
    expect(css).not.toMatch(/\[data-host-icon-position[^\]]*\]\s+:is\(svg/);
  });

  it("cuts a round hole in the layer under the badge with a mask", () => {
    expect(css).toMatch(
      /\[data-host-icon-layers\]\[data-has-badge\] > \[data-layer="art"\]/,
    );
    expect(css).toContain("radial-gradient");
    expect(css).toContain("mask-image");
  });
});

describe("contrast", () => {
  it("picks black on light colors and white on dark ones", () => {
    expect(contrastOn("#facc15")).toBe("#000");
    expect(contrastOn("#ffffff")).toBe("#000");
    expect(contrastOn("#1e3a8a")).toBe("#fff");
    expect(contrastOn("#ef4444")).toBe("#fff");
  });
});

describe("preview", () => {
  it("shows the layers of the field values", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const element = rendered.renderSettingsComponent("icon-picker", {
      pluginId: manifest.id,
      values: {
        icon: "database",
        badge: "text:DB",
        badgeColor: "#ef4444",
      },
      setValue: vi.fn(),
      running: true,
    });
    const wrapper = element.querySelector("[data-host-icon-layers]")!;
    expect(wrapper.getAttribute("data-badge")).toBe("text:DB");
  });

  it("shows a plain icon with empty layers", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const element = rendered.renderSettingsComponent("icon-picker", {
      pluginId: manifest.id,
      values: { icon: "database", badge: "", badgeColor: "" },
      setValue: vi.fn(),
      running: true,
    });
    expect(element.querySelector("[data-host-icon-layers]")).toBeNull();
  });
});

describe("layer fields", () => {
  it("are declared like icon and color, with registered components", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const fields = manifest.contributes?.settings?.host?.fields ?? [];
    for (const key of ["badge", "badgeColor"]) {
      const field = fields.find((candidate) => candidate.key === key)!;
      expect(field.type).toBe("custom");
      expect(field.default).toBe("");
      expect(field.defaultable).toBe(true);
      expect(field.defaultLevels).toEqual(["admin", "user", "folder"]);
      expect(rendered.registered.settingsComponents()).toContain(
        (field as { component: string }).component,
      );
    }
  });

  it("have labels, and no field is left from the ring or stripe", () => {
    const host = locales.settings.host as Record<string, { label: string }>;
    for (const key of ["badge", "badgeColor"]) {
      expect(host[key]!.label).toBeTruthy();
    }
    expect(host.ring).toBeUndefined();
    expect(host.stripe).toBeUndefined();
    const fields = manifest.contributes?.settings?.host?.fields ?? [];
    expect(fields.some((field) => field.key === "ring")).toBe(false);
    expect(fields.some((field) => field.key === "stripe")).toBe(false);
  });

  it("badge field saves a text label and a dot", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const setValue = vi.fn();
    const element = rendered.renderSettingsComponent("icon-badge", {
      pluginId: manifest.id,
      values: {},
      setValue,
      running: true,
    });
    const input = element.querySelector("input")!;
    fireEvent.change(input, { target: { value: "DBX" } });
    expect(setValue).toHaveBeenLastCalledWith("badge", "text:DB");
    // The field shows what is stored, so clearing needs a stored label.
    const stored = rendered.renderSettingsComponent("icon-badge", {
      pluginId: manifest.id,
      values: { badge: "text:DB" },
      setValue,
      running: true,
    });
    fireEvent.change(stored.querySelector("input")!, { target: { value: "" } });
    expect(setValue).toHaveBeenLastCalledWith("badge", "");
    fireEvent.click(
      within(element).getByRole("button", { name: locales.layers.badgeDot }),
    );
    expect(setValue).toHaveBeenLastCalledWith("badge", "dot");
    // No symbol grid: the editor is two buttons and a text box, inside the
    // disclosure's panel.
    const panel = within(element).getByTestId("badge-panel");
    expect(panel.querySelectorAll("button")).toHaveLength(2);
    expect(panel.querySelector("svg")).toBeNull();
  });
});
