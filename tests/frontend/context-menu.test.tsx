import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import {
  hostMenuItemsFor,
  paletteEntriesFor,
  useHostContextMenuItems,
  usePaletteEntries,
} from "@termix-ssh/plugin-sdk/ui";
import * as plugin from "../../src/frontend/index";
import { canChangeIcon } from "../../src/frontend/change-icon";
import { library, refreshLibrary } from "../../src/frontend/library";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

// Saving goes to core's settings API, which tests don't have.
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

const web = {
  id: "7",
  name: "web-1",
  ip: "10.0.0.7",
  port: 22,
  pluginSettings: { "host-icons": { icon: "cloud", color: "#3b82f6" } },
};

let rendered: RenderedPluginApp | null = null;

beforeEach(() => {
  save.mockReset().mockResolvedValue(undefined);
  notifyHostsChanged.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

let menuItems: ReturnType<typeof hostMenuItemsFor> = [];

function Menu({ host }: { host: Record<string, unknown> }) {
  menuItems = hostMenuItemsFor(useHostContextMenuItems(), host as never);
  return (
    <ul>
      {menuItems.map((item) => (
        <li key={item.id}>{item.titleKey}</li>
      ))}
    </ul>
  );
}

async function openDialog() {
  rendered = await renderWithApp(plugin, { manifest, locales, hosts: [web] });
  rendered.renderSlot("shell.overlay");
  render(<Menu host={web} />);
  const item = menuItems.find((entry) => entry.id === "change-icon")!;
  act(() => item.run(web as never, {} as never));
  return screen.findByRole("dialog");
}

describe("change icon menu item", () => {
  it("is offered on the user's own hosts", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    render(<Menu host={web} />);
    expect(menuItems.map((item) => item.id)).toEqual(["change-icon"]);
  });

  it("is in the command palette under the host", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales, hosts: [web] });
    rendered.renderSlot("shell.overlay");
    let all: ReturnType<typeof usePaletteEntries> = [];
    function Palette() {
      all = usePaletteEntries();
      return null;
    }
    render(<Palette />);
    const entry = paletteEntriesFor(all, "host", web as never).find(
      (item) => item.id === "change-icon",
    )!;
    expect(entry.titleKey).toBe("host-icons:menu.changeIcon");
    act(() => entry.run({} as never, web as never));
    expect(await screen.findByText("Icon for web-1")).toBeTruthy();
    const shared = { ...web, sharedCopy: true };
    expect(paletteEntriesFor(all, "host", shared as never)).toEqual([]);
  });

  it("is offered only where the user may edit the host", () => {
    const base = { id: "1", name: "a", ip: "a", port: 22 };
    expect(canChangeIcon(base)).toBe(true);
    expect(canChangeIcon({ ...base, isShared: true })).toBe(false);
    expect(
      canChangeIcon({ ...base, isShared: true, permissionLevel: "view" }),
    ).toBe(false);
    expect(
      canChangeIcon({ ...base, isShared: true, permissionLevel: "edit" }),
    ).toBe(true);
    expect(canChangeIcon({ ...base, sharedCopy: true })).toBe(false);
    expect(
      canChangeIcon({
        ...base,
        quickConnectLogin: { protocol: "ssh" },
      }),
    ).toBe(false);
  });

  it("opens a picker for the host with its current icon", async () => {
    await openDialog();
    expect(screen.getByText("Icon for web-1")).toBeTruthy();
    // The icon shows in "Used on your hosts" and in its own group.
    const tiles = screen.getAllByRole("button", { name: locales.icons.cloud });
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles)
      expect(tile.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(locales.picker.used)).toBeTruthy();
  });

  it("marks its dialog so the CSS can drop the backdrop blur", async () => {
    const dialog = await openDialog();
    expect(dialog.closest("[data-host-icons-dialog]")).toBeTruthy();
    const css = readFileSync(resolve("src/frontend/host-icons.css"), "utf8");
    expect(css).toContain(
      'body:has([data-host-icons-dialog]) [data-slot="dialog-overlay"]',
    );
  });

  it("saves the picked icon and color and refreshes the host list", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: locales.icons.router }));
    fireEvent.click(
      screen.getByRole("button", { name: locales.picker.themeColor }),
    );
    fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));
    await vi.waitFor(() => expect(notifyHostsChanged).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({ icon: "router", color: "" });
    expect(toast.success).toHaveBeenCalledWith(locales.dialog.saved);
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sends only what changed, so untouched defaults stay inherited", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: locales.icons.router }));
    fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith({ icon: "router" }),
    );
  });

  it("closes without saving when nothing changed", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(save).not.toHaveBeenCalled();
    expect(notifyHostsChanged).not.toHaveBeenCalled();
  });

  it("has no Use default controls and sends no _inherit", async () => {
    await openDialog();
    expect(screen.queryByText("Use default")).toBeNull();
    expect(screen.queryByTestId("follows-default")).toBeNull();
    expect(screen.queryByRole("button", { name: /default/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: locales.icons.router }));
    fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(Object.keys(save.mock.calls[0][0])).not.toContain("_inherit");
  });

  it("keeps the dialog open and says so when saving fails", async () => {
    save.mockRejectedValueOnce(new Error("403"));
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: locales.icons.router }));
    fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(locales.dialog.failed),
    );
    expect(notifyHostsChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes without saving on Escape", async () => {
    await openDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(save).not.toHaveBeenCalled();
  });

  it("closes the dialog when the plugin is disabled", async () => {
    await openDialog();
    await act(async () => {
      await rendered!.deactivate();
    });
    rendered = null;
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("color of an uploaded multicolor icon", () => {
  const ICON_ID = "11111111-1111-4111-8111-111111111111";
  const logoHost = {
    ...web,
    pluginSettings: {
      "host-icons": { icon: `custom:${ICON_ID}`, color: "#3b82f6" },
    },
  };
  const api = {
    get: async () => ({
      data: {
        icons: [
          {
            id: ICON_ID,
            name: "Logo",
            kind: "svg",
            data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>',
            tint: false,
            canEdit: false,
          },
        ],
      },
    }),
  } as unknown as PluginApiClient;

  afterEach(() => library.reset());

  it("clears the color when Own colors is chosen", async () => {
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      hosts: [logoHost],
      api,
    });
    await refreshLibrary(api);
    rendered.renderSlot("shell.overlay");
    render(<Menu host={logoHost} />);
    const item = menuItems.find((entry) => entry.id === "change-icon")!;
    act(() => item.run(logoHost as never, {} as never));
    await screen.findByRole("dialog");

    const own = () =>
      screen.getByRole("button", { name: locales.picker.ownColors });
    expect(own().getAttribute("aria-pressed")).toBe("false");
    const hex = () =>
      screen.getAllByLabelText(locales.picker.hexInput)[0] as HTMLInputElement;
    expect(hex().value).toBe("#3b82f6");

    fireEvent.click(own());
    expect(own().getAttribute("aria-pressed")).toBe("true");
    expect(hex().value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ color: "" }));
  });
});
