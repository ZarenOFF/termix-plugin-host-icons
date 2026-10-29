import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import { IconPicker } from "../../src/frontend/IconPicker";
import {
  collectTextIcons,
  collectUsedIcons,
  usedIcons,
  usedTextIcons,
} from "../../src/frontend/used-text";
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
  usedIcons.reset();
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

describe("collectUsedIcons", () => {
  it("lists every icon in use once, most used first", () => {
    expect(
      collectUsedIcons(
        [
          host("server"),
          host("text:frame:DB"),
          host("server"),
          host("brand-ubuntu"),
          host(42),
          host(""),
          {},
        ],
        [
          { match: "tag", value: "a", icon: "cloud" },
          { match: "tag", value: "b", icon: "server" },
          { match: "tag", value: "c", icon: "" },
        ],
      ),
    ).toEqual(["server", "brand-ubuntu", "cloud", "text:frame:DB"]);
  });

  it("reads no rules when unset or not a list", () => {
    expect(collectUsedIcons([host("server")], undefined)).toEqual(["server"]);
    expect(collectUsedIcons([host("server")], "nope")).toEqual(["server"]);
    expect(collectUsedIcons([], [])).toEqual([]);
  });
});

describe("used icons in the picker", () => {
  async function mount(value = "", onChange = vi.fn()) {
    rendered = await renderWithApp(
      {
        activate: (app) => {
          app.registerSettingsComponent("harness", () => (
            <IconPicker value={value} color="" onChange={onChange} />
          ));
        },
      },
      { manifest, locales },
    );
    rendered.renderSettingsComponent("harness", {});
    return onChange;
  }

  it("shows a Used on your hosts section first in All, and only there", async () => {
    await mount();
    expect(screen.queryByText(locales.picker.used)).toBeNull();
    act(() => usedIcons.set(["cloud", "brand-ubuntu", "text:plate:DB"]));
    const heading = screen.getByText(locales.picker.used);
    expect(
      screen.getByTestId("picker-list").firstElementChild!.contains(heading),
    ).toBe(true);
    const section = heading.parentElement!;
    // "No icon" opens the first section, then the used icons.
    expect(
      within(section).getByRole("button", { name: locales.picker.none }),
    ).toBeTruthy();
    expect(
      within(section).getByRole("button", { name: locales.icons.cloud }),
    ).toBeTruthy();
    expect(within(section).getByRole("button", { name: "DB" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "cloud" },
    });
    expect(screen.queryByText(locales.picker.used)).toBeNull();
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: locales.picker.chips.icons }),
    );
    expect(screen.queryByText(locales.picker.used)).toBeNull();
  });

  it("selects an icon from the section", async () => {
    const onChange = await mount();
    act(() => usedIcons.set(["cloud"]));
    const section = screen.getByText(locales.picker.used).parentElement!;
    fireEvent.click(
      within(section).getByRole("button", { name: locales.icons.cloud }),
    );
    expect(onChange).toHaveBeenLastCalledWith("cloud");
  });
});

describe("Text chip of the picker", () => {
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
    expect(
      screen.getByRole("button", { name: "DB" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // The search field filters them; the label field does not.
    const field = screen.getByLabelText(locales.picker.textLabel);
    expect(screen.getByRole("button", { name: "WEB" })).toBeTruthy();
    const search = screen.getByLabelText(locales.picker.search);
    fireEvent.change(search, { target: { value: "we" } });
    expect(screen.queryByRole("button", { name: "DB" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "WEB" }));
    expect(onChange).toHaveBeenLastCalledWith("text:plain:WEB");
    expect((field as HTMLInputElement).value).toBe("WEB");
    expect(
      screen.getByTestId("text-style-plain").getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
