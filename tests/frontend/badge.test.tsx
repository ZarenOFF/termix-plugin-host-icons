import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import { hostBadgesFor, useHostBadges } from "@termix-ssh/plugin-sdk/ui";
import * as plugin from "../../src/frontend/index";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

type TestHost = ReturnType<typeof makeHost>;

function makeHost(settings?: Record<string, unknown>) {
  return {
    id: "1",
    name: "web-1",
    ip: "10.0.0.1",
    port: 22,
    pluginSettings: settings ? { "host-icons": settings } : {},
  };
}

// Draws a host's badges the way the Classic Layout host row does.
function HostRowBadges({ host }: { host: TestHost }) {
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

async function renderRow(settings?: Record<string, unknown>) {
  rendered = await renderWithApp(plugin, { manifest, locales });
  render(<HostRowBadges host={makeHost(settings)} />);
}

describe("host icon badge", () => {
  it("shows the chosen icon in its color", async () => {
    await renderRow({ icon: "database", color: "#22c55e" });
    const badge = screen.getByTestId("host-icon-badge");
    expect(badge.getAttribute("title")).toBe(locales.icons.database);
    const svg = badge.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("lucide-database");
    expect(svg.getAttribute("style")).toContain("color");
  });

  it("is not shown for a host without an icon", async () => {
    await renderRow();
    expect(screen.queryByTestId("host-icon-badge")).toBeNull();
  });

  it("is not shown when the icon was cleared", async () => {
    await renderRow({ icon: "", color: "#22c55e" });
    expect(screen.queryByTestId("host-icon-badge")).toBeNull();
  });

  it("shows the fallback for an unknown icon", async () => {
    await renderRow({ icon: "gone-in-a-later-version" });
    const badge = screen.getByTestId("host-icon-badge");
    expect(badge.getAttribute("title")).toBe(locales.icons.server);
    expect(badge.querySelector("svg")!.getAttribute("class")).toContain(
      "lucide-server",
    );
  });

  it("follows the theme color when none is set", async () => {
    await renderRow({ icon: "router" });
    const svg = screen.getByTestId("host-icon-badge").querySelector("svg")!;
    expect(svg.getAttribute("style")).toBeNull();
  });

  it("is removed when the plugin is disabled", async () => {
    await renderRow({ icon: "router" });
    await rendered!.deactivate();
    rendered = null;
    expect(screen.queryByTestId("host-icon-badge")).toBeNull();
  });
});
