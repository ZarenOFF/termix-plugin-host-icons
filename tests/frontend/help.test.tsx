import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import { HELP_LINES } from "../../src/frontend/help";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";
import ru from "../../locales/translated/ru_RU.json";

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  cleanup();
  await rendered?.deactivate();
  rendered = null;
});

async function renderHelp() {
  rendered = await renderWithApp(plugin, { manifest, locales });
  rendered.renderSettingsComponent("icon-help", {
    pluginId: manifest.id,
    values: {},
    setValue: vi.fn(),
    running: true,
  });
  return screen.getByRole("button", { name: locales.settings.user.help.label });
}

const memo = () => screen.queryByTestId("help-memo");

describe("Priority order help", () => {
  it("is the first user setting, a custom one", () => {
    const user = manifest.contributes?.settings?.user ?? [];
    expect(user[0]).toMatchObject({
      key: "help",
      type: "custom",
      component: "icon-help",
    });
  });

  it("shows the line closed, with an info icon", async () => {
    const button = await renderHelp();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.querySelector("svg")).toBeTruthy();
    expect(memo()).toBeNull();
  });

  it("opens on hover and closes when the pointer leaves", async () => {
    const button = await renderHelp();
    fireEvent.mouseEnter(button);
    expect(memo()).toBeTruthy();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.mouseLeave(button);
    await waitFor(() => expect(memo()).toBeNull());
  });

  it("opens on keyboard focus and closes on blur", async () => {
    const button = await renderHelp();
    fireEvent.focus(button);
    expect(memo()).toBeTruthy();
    fireEvent.blur(button);
    await waitFor(() => expect(memo()).toBeNull());
  });

  it("stays open after a click or tap, and a second click closes it", async () => {
    const button = await renderHelp();
    // A tap sends the emulated mouse enter first, then the click.
    fireEvent.mouseEnter(button);
    fireEvent.click(button);
    fireEvent.mouseLeave(button);
    await new Promise((done) => setTimeout(done, 250));
    expect(memo()).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(memo()).toBeNull());
  });

  it("closes on Escape", async () => {
    const button = await renderHelp();
    fireEvent.click(button);
    expect(memo()).toBeTruthy();
    fireEvent.keyDown(button, { key: "Escape" });
    await waitFor(() => expect(memo()).toBeNull());
  });

  it("lists the three lines of the memo", async () => {
    const button = await renderHelp();
    fireEvent.click(button);
    const items = Array.from(memo()?.querySelectorAll("li") ?? []);
    expect(items.map((item) => item.textContent)).toEqual(
      HELP_LINES.map((line) => locales.settings.user.help[line]),
    );
    expect(items).toHaveLength(3);
  });

  it("has the same keys in Russian", () => {
    expect(Object.keys(ru.settings.user.help).sort()).toEqual(
      ["label", ...HELP_LINES].sort(),
    );
  });
});
