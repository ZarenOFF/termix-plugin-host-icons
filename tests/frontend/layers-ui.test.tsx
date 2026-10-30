import { useState } from "react";
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
import {
  AppearanceEditor,
  type Appearance,
} from "../../src/frontend/appearance-editor";
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

const badgeToggle = (scope: HTMLElement = document.body) =>
  within(scope).getByRole("button", {
    name: new RegExp("^" + locales.dialog.badge.split(":")[0] + ":"),
  });

const openBadge = (dialog: HTMLElement) => {
  const toggle = badgeToggle(dialog);
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
};

const clickSave = () =>
  fireEvent.click(screen.getByRole("button", { name: locales.dialog.save }));

describe("layers in the change icon dialog", () => {
  it("keeps the badge editor behind a Badge button below the color", async () => {
    await openDialog();
    const section = within(screen.getByTestId("badge-section"));
    const toggle = section.getByRole("button", {
      name: locales.dialog.badge.replace(
        "{{summary}}",
        locales.layers.badgeNone,
      ),
    });
    const panel = screen.getByTestId("badge-panel");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("data-open")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.getAttribute("data-open")).toBe("true");
    expect(
      within(panel).getByRole("textbox", { name: locales.layers.badgeText }),
    ).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.getAttribute("data-open")).toBe("false");
  });

  it("names the badge on the button and opens for a host that has one", async () => {
    await openDialog({
      ...plain,
      pluginSettings: { "host-icons": { icon: "server", badge: "dot" } },
    });
    const toggle = badgeToggle();
    expect(toggle.textContent).toBe(
      locales.dialog.badge.replace("{{summary}}", locales.layers.badgeDot),
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens for a badge that arrives late, until the user toggles it", async () => {
    // The editor is only mounted by the host, so a test plugin registers a
    // wrapper that owns the value and hands its setter back to the test.
    const empty: Appearance = {
      icon: "",
      color: "",
      badge: "",
      badgeColor: "",
    };
    let setValue: (next: Appearance) => void = () => {};
    function Harness() {
      const [value, set] = useState(empty);
      setValue = set;
      return (
        <AppearanceEditor
          value={value}
          colorIcon={null}
          preview={null}
          onChange={() => {}}
          onSave={() => {}}
        />
      );
    }
    rendered = await renderWithApp(
      {
        activate: (app) => {
          app.registerSettingsComponent("harness", Harness);
        },
      },
      { manifest, locales },
    );
    rendered.renderSettingsComponent("harness", {});
    const expanded = () => badgeToggle().getAttribute("aria-expanded");
    expect(expanded()).toBe("false");
    act(() => setValue({ ...empty, icon: "server", badge: "dot" }));
    expect(expanded()).toBe("true");
    fireEvent.click(badgeToggle());
    act(() => setValue({ ...empty, icon: "server", badge: "text:P" }));
    expect(expanded()).toBe("false");
  });

  it("stacks preview, color, badge and a footer with only Save", async () => {
    await openDialog();
    const order = [
      "dialog-preview",
      "color-section",
      "badge-section",
      "dialog-footer",
    ].map((id) => screen.getByTestId(id));
    for (let at = 1; at < order.length; at++)
      expect(
        order[at - 1].compareDocumentPosition(order[at]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    const buttons = within(screen.getByTestId("dialog-footer")).getAllByRole(
      "button",
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe(locales.dialog.save);
    // The badge editor comes after the color picker, never before it.
    const hex = screen.getAllByLabelText(locales.picker.hexInput);
    expect(hex).toHaveLength(2);
    expect(screen.getByTestId("color-section").contains(hex[0])).toBe(true);
    expect(screen.getByTestId("badge-panel").contains(hex[1])).toBe(true);
  });

  it("saves a text badge and shows it in the preview", async () => {
    const dialog = await openDialog();
    openBadge(dialog);
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
    openBadge(dialog);
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

  it("disables the badge when the host has no icon", async () => {
    const dialog = await openDialog(bare);
    openBadge(dialog);
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
