import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
import ru from "../../locales/translated/ru_RU.json";

const save = vi.fn();
const notifyHostsChanged = vi.fn();
const toast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};
vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSettings: () => ({ values: {}, loaded: true, save }),
  useToast: () => toast,
  notifyHostsChanged: () => notifyHostsChanged(),
}));

const manifest = manifestJson as unknown as PluginManifest;

const plain = {
  id: "7",
  name: "web-1",
  ip: "10.0.0.7",
  port: 22,
  pluginSettings: { "host-icons": { icon: "cloud", color: "#3b82f6" } },
};
const bare = { id: "8", name: "bare", ip: "10.0.0.8", port: 22 };

let rendered: RenderedPluginApp | null = null;
let menuItems: ReturnType<typeof hostMenuItemsFor> = [];

beforeEach(() => {
  save.mockReset().mockResolvedValue(undefined);
  notifyHostsChanged.mockReset();
});

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

function Menu({ host }: { host: Record<string, unknown> }) {
  menuItems = hostMenuItemsFor(useHostContextMenuItems(), host as never);
  return null;
}

async function openDialog(host: Record<string, unknown> = plain) {
  rendered = await renderWithApp(plugin, {
    manifest,
    locales,
    hosts: [host as never],
  });
  rendered.renderSlot("shell.overlay");
  render(<Menu host={host} />);
  const item = menuItems.find((entry) => entry.id === "change-icon")!;
  act(() => item.run(host as never, {} as never));
  return screen.findByRole("dialog");
}

const clickSave = () =>
  fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));

describe("layers in the change icon dialog", () => {
  it("saves a text badge and shows it in the preview", async () => {
    const dialog = await openDialog();
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: locales.layers.badgeText }),
      { target: { value: "DBX" } },
    );
    expect(dialog.querySelector("[data-has-badge]")).toBeTruthy();
    clickSave();
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith({ badge: "text:DB" }),
    );
    expect(notifyHostsChanged).toHaveBeenCalled();
  });

  it("saves a dot badge, leaving the unchanged badge color out", async () => {
    const dialog = await openDialog();
    const dot = within(dialog).getByRole("button", {
      name: locales.layers.badgeDot,
    });
    fireEvent.click(dot);
    expect(dot.getAttribute("aria-pressed")).toBe("true");
    expect(dialog.querySelector("[data-badge-kind='dot']")).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: locales.layers.badgeThemeColor,
      }),
    );
    clickSave();
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ badge: "dot" }));
  });

  it("offers no symbol badges", async () => {
    const dialog = await openDialog();
    expect(within(dialog).queryByRole("group", { name: /symbol/i })).toBeNull();
    expect(Object.keys(locales)).not.toContain("badgeGlyphs");
  });

  it("hands layers back to the default", async () => {
    const dialog = await openDialog();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: locales.dialog.useDefaultBadge,
      }),
    );
    clickSave();
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith({ _inherit: ["badge"] }),
    );
  });

  it("disables the badge when the host has no icon", async () => {
    const dialog = await openDialog(bare);
    expect(within(dialog).getByText(locales.layers.needIcon)).toBeTruthy();
    const text = within(dialog).getByRole("textbox", {
      name: locales.layers.badgeText,
    }) as HTMLInputElement;
    expect(text.disabled).toBe(true);
    const dot = within(dialog).getByRole("button", {
      name: locales.layers.badgeDot,
    }) as HTMLButtonElement;
    expect(dot.disabled).toBe(true);
  });
});

describe("layer settings components", () => {
  async function field(id: string, values: Record<string, unknown> = {}) {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const setValue = vi.fn();
    const element = rendered.renderSettingsComponent(id, {
      pluginId: manifest.id,
      values,
      setValue,
      running: true,
    });
    return { element, setValue };
  }

  it("badge editor works from an empty value", async () => {
    const { element, setValue } = await field("icon-badge");
    expect(
      within(element)
        .getByRole("button", { name: locales.layers.badgeNone })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(
      within(element).getByRole("button", { name: locales.layers.badgeDot }),
    );
    expect(setValue).toHaveBeenLastCalledWith("badge", "dot");
    fireEvent.click(
      within(element).getByRole("button", { name: locales.layers.badgeNone }),
    );
    expect(setValue).toHaveBeenLastCalledWith("badge", "");
  });

  it("badge editor shows a stored dot as pressed", async () => {
    const { element } = await field("icon-badge", { badge: "dot" });
    expect(
      within(element)
        .getByRole("button", { name: locales.layers.badgeDot })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("badge color field emits an empty value for the theme color", async () => {
    const { element, setValue } = await field("icon-badge-color", {
      badgeColor: "#ff0000",
    });
    fireEvent.click(
      within(element).getByRole("button", { name: locales.picker.themeColor }),
    );
    expect(setValue).toHaveBeenLastCalledWith("badgeColor", "");
  });
});

describe("layer texts", () => {
  it("the Russian locale has every key of the English one", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v ? keys(v, `${p}${k}.`) : [`${p}${k}`],
      );
    expect(keys(ru).sort()).toEqual(keys(locales).sort());
  });
});
