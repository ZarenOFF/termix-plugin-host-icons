import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import {
  hostMenuItemsFor,
  paletteEntriesFor,
  useHostContextMenuItems,
  usePaletteEntries,
} from "@termix-ssh/plugin-sdk/ui";
import * as plugin from "../../src/frontend/index";
import { canChangeIcon } from "../../src/frontend/change-icon";
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
    expect(
      screen
        .getByRole("button", { name: locales.icons.cloud })
        .getAttribute("aria-pressed"),
    ).toBe("true");
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

  it("hands only the color back to the default", async () => {
    await openDialog();
    fireEvent.click(
      screen.getByRole("button", { name: locales.dialog.useDefaultColor }),
    );
    expect(screen.getByText(locales.dialog.followsDefault)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: locales.icons.router }));
    fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        _inherit: ["color"],
        icon: "router",
      }),
    );
  });

  it("hands both back to the default", async () => {
    await openDialog();
    fireEvent.click(
      screen.getByRole("button", { name: locales.dialog.useDefaultIcon }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: locales.dialog.useDefaultColor }),
    );
    fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith({ _inherit: ["icon", "color"] }),
    );
  });

  it("owns the icon again once a new one is picked", async () => {
    await openDialog();
    fireEvent.click(
      screen.getByRole("button", { name: locales.dialog.useDefaultIcon }),
    );
    fireEvent.click(screen.getByRole("button", { name: locales.icons.router }));
    fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith({ icon: "router" }),
    );
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

  it("closes without saving on Cancel", async () => {
    await openDialog();
    fireEvent.click(
      screen.getByRole("button", { name: locales.dialog.cancel }),
    );
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
