import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import {
  hostMenuItemsFor,
  useHostContextMenuItems,
} from "@termix-ssh/plugin-sdk/ui";
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

const bare: TestHost = {
  id: "1",
  name: "db-1",
  ip: "10.0.0.1",
  port: 22,
  tags: ["prod"],
  pluginSettings: {},
};
const owned: TestHost = {
  ...bare,
  id: "2",
  pluginSettings: { "host-icons": { icon: "cloud" } },
};

const prodRule = {
  match: "tag",
  value: "prod",
  icon: "database",
  color: "#ff0000",
  override: false,
};

let rendered: RenderedPluginApp | null = null;
let menuItems: ReturnType<typeof hostMenuItemsFor> = [];

beforeEach(() => {
  userSettings.values = {};
});

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

function Menu({ host }: { host: TestHost }) {
  menuItems = hostMenuItemsFor(useHostContextMenuItems(), host as never);
  return null;
}

async function openDialog(host: TestHost, rules: unknown[]) {
  userSettings.values = { rules };
  rendered = await renderWithApp(plugin, {
    manifest,
    locales,
    hosts: [host],
  });
  rendered.renderSlot("shell.overlay");
  render(<Menu host={host} />);
  const item = menuItems.find((entry) => entry.id === "change-icon")!;
  await act(async () => item.run(host as never, {} as never));
  await screen.findByRole("dialog");
}

const rule = (text: string) => `Rule "${text}"`;

describe("change icon dialog and rules", () => {
  it("says a rule gives the icon while the host has none", async () => {
    await openDialog(bare, [prodRule]);
    expect(
      screen.getByText(locales.dialog.ruleNote.replace("{{rule}}", "tag prod")),
    ).toBeTruthy();
    expect(screen.getByText(locales.icons.database)).toBeTruthy();
  });

  it("says nothing when a rule would not apply", async () => {
    await openDialog(owned, [prodRule]);
    expect(screen.queryByText(new RegExp(rule("tag prod")))).toBeNull();
  });

  it("says nothing when no rule matches the host", async () => {
    await openDialog(bare, [{ ...prodRule, value: "staging" }]);
    expect(screen.queryByText(new RegExp(rule("")))).toBeNull();
    expect(screen.getAllByText(locales.picker.noIconPreview)).not.toHaveLength(
      0,
    );
  });

  it("says an overriding rule changes a host that has an icon", async () => {
    await openDialog(owned, [{ ...prodRule, override: true }]);
    expect(
      screen.getByText(
        locales.dialog.ruleOverrideNote.replace("{{rule}}", "tag prod"),
      ),
    ).toBeTruthy();
  });
});

// The preview is a span with the icon and its name; its color is on the svg.
function preview(name: string) {
  const span = screen.getByText(name);
  const svg = span.querySelector("svg") as SVGElement | null;
  return { span, color: svg?.style.color ?? "" };
}

describe("change icon dialog preview matches the Hosts list", () => {
  it("shows the icon an overriding rule puts over the host's own", async () => {
    await openDialog(owned, [{ ...prodRule, override: true }]);
    expect(screen.queryByText(locales.icons.cloud)).toBeNull();
    expect(preview(locales.icons.database).color).toBe("rgb(255, 0, 0)");
  });

  it("keeps the host's color when an overriding rule has none", async () => {
    const blue = {
      ...owned,
      pluginSettings: { "host-icons": { icon: "cloud", color: "#0000ff" } },
    };
    await openDialog(blue, [{ ...prodRule, color: "", override: true }]);
    expect(preview(locales.icons.database).color).toBe("rgb(0, 0, 255)");
  });

  it("shows a color-only rule's color on the host's own icon", async () => {
    await openDialog(owned, [{ ...prodRule, icon: "", color: "#00ff00" }]);
    expect(
      screen.getByText(
        locales.dialog.ruleOverrideNote.replace("{{rule}}", "tag prod"),
      ),
    ).toBeTruthy();
    expect(preview(locales.icons.cloud).color).toBe("rgb(0, 255, 0)");
  });

  it("gives a rule without priority no say over the host's own color", async () => {
    const blue = {
      ...owned,
      pluginSettings: { "host-icons": { icon: "", color: "#0000ff" } },
    };
    await openDialog(blue, [prodRule]);
    expect(preview(locales.icons.database).color).toBe("rgb(0, 0, 255)");
  });

  it("shows the rule's icon and color for a host with neither", async () => {
    await openDialog(bare, [prodRule]);
    expect(preview(locales.icons.database).color).toBe("rgb(255, 0, 0)");
  });

  const previewBadge = () =>
    screen
      .getByTestId("dialog-preview")
      .querySelector("[data-host-icon-layers]")
      ?.getAttribute("data-badge") ?? null;

  it("shows the badge a rule gives a host without one", async () => {
    await openDialog(bare, [{ ...prodRule, badge: "dot" }]);
    expect(previewBadge()).toBe("dot");
  });

  it("shows an overriding rule's badge over the host's own", async () => {
    const badged = {
      ...owned,
      pluginSettings: { "host-icons": { icon: "cloud", badge: "text:H" } },
    };
    await openDialog(badged, [
      { ...prodRule, icon: "", badge: "dot", override: true },
    ]);
    expect(previewBadge()).toBe("dot");
  });
});
