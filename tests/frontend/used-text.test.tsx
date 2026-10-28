import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import { IconPicker } from "../../src/frontend/IconPicker";
import { collectTextIcons, usedTextIcons } from "../../src/frontend/used-text";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;
const host = (icon: unknown) => ({
  pluginSettings: { "host-icons": { icon } },
});

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
  usedTextIcons.reset();
  cleanup();
});

describe("collectTextIcons", () => {
  it("takes text ids from hosts and rules, once each, sorted", () => {
    const ids = collectTextIcons(
      [
        host("text:frame:DB"),
        host("server"),
        host("text:plate:01"),
        host("text:frame: DB "),
        host(42),
        {},
      ],
      [
        { match: "tag", value: "web", icon: "text:plain:WEB" },
        { match: "tag", value: "x", icon: "text:frame:DB" },
        { match: "tag", value: "y", icon: "brand-ubuntu" },
      ],
    );
    expect(ids).toEqual(["text:frame:DB", "text:plain:WEB", "text:plate:01"]);
  });

  it("skips invalid text ids and reads no rules when unset", () => {
    expect(
      collectTextIcons([host("text:bold:DB"), host("text:frame:")], undefined),
    ).toEqual([]);
  });
});

describe("text tab of the picker", () => {
  async function mount(onChange = vi.fn()) {
    rendered = await renderWithApp(
      {
        activate: (app) => {
          app.registerSettingsComponent("harness", () => (
            <IconPicker value="text:frame:DB" color="" onChange={onChange} />
          ));
        },
      },
      { manifest, locales },
    );
    rendered.renderSettingsComponent("harness", {});
    return onChange;
  }

  it("offers the text icons already in use", async () => {
    const onChange = await mount();
    expect(screen.queryByText(locales.picker.textUsed)).toBeNull();
    act(() => usedTextIcons.set(["text:frame:DB", "text:plain:WEB"]));
    expect(screen.getByText(locales.picker.textUsed)).toBeTruthy();
    const web = screen.getByRole("button", { name: "WEB" });
    fireEvent.click(web);
    expect(onChange).toHaveBeenLastCalledWith("text:plain:WEB");
    expect(
      screen.getByRole("button", { name: "DB" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
