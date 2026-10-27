import { describe, expect, it } from "vitest";
import { renderWithApp } from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;

// Disable then enable runs activate again on the same module, with no reload.
describe("disable then enable", () => {
  it("registers everything again on the same module", async () => {
    const first = await renderWithApp(plugin, { manifest, locales });
    const registered = {
      components: first.registered.settingsComponents().sort(),
      overlay: first.registered.slot("shell.overlay").sort(),
    };
    await first.deactivate();

    const second = await renderWithApp(plugin, { manifest, locales });
    expect(second.registered.settingsComponents().sort()).toEqual(
      registered.components,
    );
    expect(second.registered.slot("shell.overlay").sort()).toEqual(
      registered.overlay,
    );
    expect(registered.components.length).toBeGreaterThan(0);
    await second.deactivate();
  });
});
