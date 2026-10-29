import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import { useState } from "react";
import { IconPicker } from "../../src/frontend/IconPicker";
import {
  BRAND_GROUPS,
  BRAND_ICONS,
  HOST_ICONS,
  ICON_GROUPS,
} from "../../src/frontend/icons";
import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import { library, refreshLibrary } from "../../src/frontend/library";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

async function renderField(
  componentId: string,
  values: Record<string, unknown> = {},
  running = true,
) {
  rendered = await renderWithApp(plugin, { manifest, locales });
  const setValue = vi.fn();
  const element = rendered.renderSettingsComponent(componentId, {
    pluginId: manifest.id,
    values,
    setValue,
    running,
  });
  return { element, setValue };
}

describe("manifest host settings", () => {
  const fields = manifest.contributes?.settings?.host?.fields ?? [];

  it("declares the icon, color and layers as custom, defaultable fields", () => {
    expect(fields.map((field) => field.key)).toEqual([
      "icon",
      "color",
      "badge",
      "badgeColor",
    ]);
    for (const field of fields) {
      expect(field.type).toBe("custom");
      expect(field.default).toBe("");
      expect(field.defaultable).toBe(true);
      expect(field.defaultLevels).toContain("folder");
    }
  });

  it("names components the frontend registers", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const userFields = manifest.contributes?.settings?.user ?? [];
    expect(rendered.registered.settingsComponents().sort()).toEqual(
      [...fields, ...userFields]
        .filter((field) => field.type === "custom")
        .map((field) => field.component)
        .sort(),
    );
  });

  it("asks for UI, its own database and routes, and nothing else", () => {
    expect([...manifest.capabilities].sort()).toEqual([
      "db:own",
      "network:serve",
      "ui:surface",
    ]);
  });
});

describe("locales", () => {
  it("label every icon and group", () => {
    for (const icon of HOST_ICONS) {
      expect(
        (locales.icons as Record<string, string>)[icon.id],
        icon.id,
      ).toBeTruthy();
    }
    for (const group of ICON_GROUPS) {
      expect((locales.groups as Record<string, string>)[group]).toBeTruthy();
    }
  });

  it("name every brand group and filter, but no single brand", () => {
    for (const group of BRAND_GROUPS) {
      expect(
        (locales.brandGroups as Record<string, string>)[group],
        group,
      ).toBeTruthy();
    }
    expect(Object.keys(locales.brandGroups).sort()).toEqual(
      [...BRAND_GROUPS].sort(),
    );
    for (const chip of Object.values(locales.picker.chips)) {
      expect(chip).toBeTruthy();
    }
    // Brand names are shown as they are, so there is nothing to translate.
    for (const brand of BRAND_ICONS) {
      expect(locales.icons).not.toHaveProperty(brand.id);
    }
  });

  it("match the manifest name and description", () => {
    expect(locales.plugin.name).toBe(manifest.name);
    expect(locales.plugin.description).toBe(manifest.description);
  });
});

describe("icon field", () => {
  it("stores the id of the icon picked", async () => {
    const { setValue } = await renderField("icon-picker");
    fireEvent.click(screen.getByRole("button", { name: locales.icons.router }));
    expect(setValue).toHaveBeenCalledWith("icon", "router");
  });

  it("clears the icon with No icon", async () => {
    const { setValue } = await renderField("icon-picker", { icon: "cloud" });
    fireEvent.click(screen.getByRole("button", { name: locales.picker.none }));
    expect(setValue).toHaveBeenCalledWith("icon", "");
  });

  it("marks the stored icon and previews it", async () => {
    await renderField("icon-picker", { icon: "database", color: "#22c55e" });
    expect(
      screen
        .getByRole("button", { name: locales.icons.database })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getAllByText(locales.icons.database).length).toBeGreaterThan(
      0,
    );
  });

  it("filters icons by keyword", async () => {
    await renderField("icon-picker");
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "docker" },
    });
    expect(
      screen.getByRole("button", { name: locales.icons.container }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: locales.icons.router }),
    ).toBeNull();
  });

  it("says when nothing matches", async () => {
    await renderField("icon-picker");
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "zzzzzz" },
    });
    expect(screen.getByText(`Nothing matches "zzzzzz"`)).toBeTruthy();
    // A short query still offers the text icons it spells.
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "zzzz" },
    });
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });

  it("warns about an icon this version does not know", async () => {
    await renderField("icon-picker", { icon: "from-the-future" });
    expect(screen.getByText(/does not know/)).toBeTruthy();
  });

  it("is read only while the plugin is not running", async () => {
    const { setValue } = await renderField("icon-picker", {}, false);
    const button = screen.getByRole("button", { name: locales.icons.server });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(setValue).not.toHaveBeenCalled();
  });
});

describe("icon filters", () => {
  const chip = (name: keyof typeof locales.picker.chips) =>
    screen.getByRole("button", { name: locales.picker.chips[name] });
  const tile = (name: string) => screen.queryByRole("button", { name });

  it("opens on All and shows the Lucide groups, then the brand groups", async () => {
    await renderField("icon-picker");
    expect(chip("all").getAttribute("aria-pressed")).toBe("true");
    expect(chip("brands").getAttribute("aria-pressed")).toBe("false");
    expect(tile(locales.icons.router)).not.toBeNull();
    expect(tile("Ubuntu")).not.toBeNull();
    expect(screen.getByText(locales.groups.servers)).toBeTruthy();
    // Brand groups say so in All.
    expect(screen.getByText(`Brands: ${locales.brandGroups.os}`)).toBeTruthy();
  });

  it("has no tabs, only one search box", async () => {
    await renderField("icon-picker");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("filters to the brand logos, grouped, and back", async () => {
    await renderField("icon-picker");
    fireEvent.click(chip("brands"));
    expect(chip("brands").getAttribute("aria-pressed")).toBe("true");
    expect(tile("Ubuntu")).not.toBeNull();
    expect(tile(locales.icons.router)).toBeNull();
    for (const group of BRAND_GROUPS) {
      expect(screen.getByText(locales.brandGroups[group])).toBeTruthy();
    }
    // The No icon tile stays in every list.
    expect(tile(locales.picker.none)).not.toBeNull();
    fireEvent.click(chip("icons"));
    expect(tile(locales.icons.router)).not.toBeNull();
    expect(tile("Ubuntu")).toBeNull();
    expect(tile(locales.picker.none)).not.toBeNull();
  });

  it("keeps a fixed list height when the chip changes", async () => {
    await renderField("icon-picker");
    const list = screen.getByTestId("picker-list");
    expect(list.style.height).toBe("340px");
    fireEvent.click(chip("text"));
    fireEvent.click(chip("custom"));
    expect(screen.getByTestId("picker-list").style.height).toBe("340px");
  });

  it("puts the No icon tile first in the list", async () => {
    await renderField("icon-picker");
    const first = screen
      .getByTestId("picker-list")
      .querySelector("button") as HTMLButtonElement;
    expect(first.getAttribute("aria-label")).toBe(locales.picker.none);
  });

  it("leaves hidden logos out of the lists", async () => {
    await renderField("icon-picker");
    expect(tile("Cisco")).toBeNull();
    fireEvent.click(chip("brands"));
    expect(tile("Cisco")).toBeNull();
    expect(tile("macOS")).toBeNull();
  });

  it("stores the id of the brand picked", async () => {
    const { setValue } = await renderField("icon-picker");
    fireEvent.click(chip("brands"));
    fireEvent.click(screen.getByRole("button", { name: "Ubuntu" }));
    expect(setValue).toHaveBeenCalledWith("icon", "brand-ubuntu");
  });

  it("marks a brand value", async () => {
    await renderField("icon-picker", {
      icon: "brand-debian",
      color: "#22c55e",
    });
    expect(chip("all").getAttribute("aria-pressed")).toBe("true");
    expect(tile("Debian")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not offer hidden logos but still marks one a host has", async () => {
    await renderField("icon-picker", { icon: "brand-cisco" });
    expect(tile("Cisco")!.getAttribute("aria-pressed")).toBe("true");
    expect(tile("VMware")).toBeNull();
    expect(screen.queryByText(/does not know/)).toBeNull();
  });

  it("warns about a brand id it does not know", async () => {
    await renderField("icon-picker", { icon: "brand-from-the-future" });
    expect(chip("all").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/does not know/)).toBeTruthy();
  });

  it("searches every pack from All", async () => {
    await renderField("icon-picker");
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "k8s" },
    });
    expect(tile("Kubernetes")).not.toBeNull();
    expect(tile("K3s")).not.toBeNull();
    expect(tile(locales.icons.router)).toBeNull();
    // Group headings and the No icon tile give way to the results.
    expect(tile(locales.picker.none)).toBeNull();
    expect(screen.queryByText(locales.groups.servers)).toBeNull();
  });

  it("shows Lucide and brand matches together", async () => {
    await renderField("icon-picker");
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "kubernetes" },
    });
    expect(tile(locales.icons.container)).not.toBeNull();
    expect(tile("Kubernetes")).not.toBeNull();
  });

  it("searches only the pack of the chip", async () => {
    await renderField("icon-picker");
    fireEvent.click(chip("brands"));
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "docker" },
    });
    expect(tile("Docker")).not.toBeNull();
    expect(tile(locales.icons.container)).toBeNull();
    fireEvent.click(chip("icons"));
    expect(tile("Docker")).toBeNull();
    expect(tile(locales.icons.container)).not.toBeNull();
  });

  it("keeps the query when the chip changes", async () => {
    await renderField("icon-picker");
    const search = screen.getByLabelText(
      locales.picker.search,
    ) as HTMLInputElement;
    fireEvent.change(search, { target: { value: "docker" } });
    fireEvent.click(chip("brands"));
    expect(search.value).toBe("docker");
    fireEvent.click(chip("icons"));
    expect(search.value).toBe("docker");
    fireEvent.click(chip("all"));
    expect(search.value).toBe("docker");
  });

  it("keeps the chip chosen after a search is cleared", async () => {
    await renderField("icon-picker");
    fireEvent.click(chip("brands"));
    const search = screen.getByLabelText(locales.picker.search);
    fireEvent.change(search, { target: { value: "ubuntu" } });
    fireEvent.change(search, { target: { value: "" } });
    expect(tile("Ubuntu")).not.toBeNull();
    expect(tile(locales.icons.router)).toBeNull();
  });
});

describe("host editor layout", () => {
  it("shows the picker, then the preview row with the layers", async () => {
    const { element } = await renderField("icon-picker", {
      icon: "database",
      color: "#22c55e",
      badge: "text:DB",
    });
    const preview = within(element).getByTestId("field-preview");
    expect(preview.className).toContain("border-t");
    expect(preview.querySelector("[data-host-icons-actual]")).not.toBeNull();
    const list = within(element).getByTestId("picker-list");
    expect(
      list.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws the color and the badge color as compact rows", async () => {
    const { element } = await renderField("icon-color", { icon: "cloud" });
    // Compact lays the controls out in one wrapping row, not a column.
    const row = (el: HTMLElement) => el.querySelector("fieldset")!;
    expect(row(element).className).toContain("flex-wrap");
    expect(row(element).className).not.toContain("flex-col");
    cleanup();
    await rendered?.deactivate();
    const badgeColor = await renderField("icon-badge-color");
    expect(row(badgeColor.element).className).toContain("flex-wrap");
  });

  it("opens the badge section when a badge is set and keeps the editor inside it", async () => {
    const { element } = await renderField("icon-badge", { badge: "dot" });
    const toggle = within(element).getByRole("button", {
      name: locales.dialog.badge.replace(
        "{{summary}}",
        locales.layers.badgeDot,
      ),
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = within(element).getByTestId("badge-panel");
    expect(toggle.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("data-open")).toBe("true");
    expect(panel.hasAttribute("data-host-icons-collapse")).toBe(true);
    expect(
      within(panel).getByRole("button", { name: locales.layers.badgeNone }),
    ).toBeTruthy();
  });

  it("starts the badge section closed without a badge and opens on a click", async () => {
    const { element } = await renderField("icon-badge");
    const toggle = within(element).getByRole("button", {
      name: locales.dialog.badge.replace(
        "{{summary}}",
        locales.layers.badgeNone,
      ),
    });
    const panel = within(element).getByTestId("badge-panel");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.getAttribute("data-open")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.getAttribute("data-open")).toBe("true");
  });
});

describe("badge color follows the Badge disclosure", () => {
  // Both fields are drawn by core, one after the other, so render them
  // together in one tree as the host editor does.
  async function renderBoth(values: Record<string, unknown>) {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const setValue = vi.fn();
    const props = {
      pluginId: manifest.id,
      values,
      setValue,
      running: true,
    };
    const badge = rendered.renderSettingsComponent("icon-badge", props);
    const color = rendered.renderSettingsComponent("icon-badge-color", props);
    return { badge, color };
  }
  const wrapper = () => screen.getByTestId("badge-color-field");

  it("starts closed without a badge, and opens and closes with the Badge button", async () => {
    const { badge } = await renderBoth({});
    expect(wrapper().hasAttribute("data-host-icons-collapse")).toBe(true);
    expect(wrapper().getAttribute("data-open")).toBe("false");
    const toggle = within(badge).getByRole("button", {
      name: locales.dialog.badge.replace(
        "{{summary}}",
        locales.layers.badgeNone,
      ),
    });
    fireEvent.click(toggle);
    expect(wrapper().getAttribute("data-open")).toBe("true");
    fireEvent.click(toggle);
    expect(wrapper().getAttribute("data-open")).toBe("false");
  });

  it("starts open when a badge is set", async () => {
    await renderBoth({ badge: "dot" });
    expect(wrapper().getAttribute("data-open")).toBe("true");
  });

  it("goes back to closed when the badge field is gone", async () => {
    const { badge } = await renderBoth({ badge: "dot" });
    expect(wrapper().getAttribute("data-open")).toBe("true");
    cleanup();
    await rendered?.deactivate();
    // A new editor: the color field alone, with nothing publishing "open".
    rendered = await renderWithApp(plugin, { manifest, locales });
    rendered.renderSettingsComponent("icon-badge-color", {
      pluginId: manifest.id,
      values: {},
      setValue: vi.fn(),
      running: true,
    });
    expect(wrapper().getAttribute("data-open")).toBe("false");
    expect(badge).toBeTruthy();
  });
});

describe("color field", () => {
  it("stores a typed color", async () => {
    const { element, setValue } = await renderField("icon-color");
    const input = within(element).getByLabelText(locales.picker.hexInput);
    fireEvent.change(input, { target: { value: "#3b82f6" } });
    expect(setValue).toHaveBeenCalledWith("color", "#3b82f6");
  });

  it("goes back to the theme color", async () => {
    const { setValue } = await renderField("icon-color", {
      icon: "cloud",
      color: "#ef4444",
    });
    const theme = screen.getByRole("button", {
      name: locales.picker.themeColor,
    });
    expect(theme.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(theme);
    expect(setValue).toHaveBeenCalledWith("color", "");
  });

  it("shows the theme color as chosen when none is set", async () => {
    await renderField("icon-color", { icon: "cloud" });
    expect(
      screen
        .getByRole("button", { name: locales.picker.themeColor })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("color field with an uploaded multicolor icon", () => {
  const ID = "22222222-2222-4222-8222-222222222222";
  const api = {
    get: async () => ({
      data: {
        icons: [
          {
            id: ID,
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

  it("marks Own colors only while no color is set", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales, api });
    await refreshLibrary(api);
    const draw = (color: string) =>
      rendered!.renderSettingsComponent("icon-color", {
        pluginId: manifest.id,
        values: { icon: `custom:${ID}`, color },
        setValue: vi.fn(),
        running: true,
      });
    const own = () =>
      screen.getByRole("button", { name: locales.picker.ownColors });
    draw("#ef4444");
    expect(own().getAttribute("aria-pressed")).toBe("false");
    cleanup();
    // What core stores after "Use default" on a field with no default value.
    draw("");
    expect(own().getAttribute("aria-pressed")).toBe("true");
  });
});

describe("color field without a known icon", () => {
  it("says No color and shows an empty hex field", async () => {
    const { element } = await renderField("icon-color");
    expect(
      screen
        .getByRole("button", { name: locales.picker.noColor })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const hex = within(element).getByLabelText(
      locales.picker.hexInput,
    ) as HTMLInputElement;
    expect(hex.value).toBe("");
  });
});

describe("icon size field", () => {
  it("shows the size with a percent sign", async () => {
    await renderField("icon-size", { size: 120 });
    const input = screen.getByRole("spinbutton", {
      name: locales.settings.user.size.label,
    }) as HTMLInputElement;
    expect(input.value).toBe("120");
    expect(screen.getByText("%")).toBeTruthy();
  });

  it("shows 100 when nothing is saved", async () => {
    await renderField("icon-size");
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe(
      "100",
    );
  });

  it("saves whole numbers as they are typed", async () => {
    const { setValue } = await renderField("icon-size", { size: 100 });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "130" } });
    expect(setValue).toHaveBeenCalledWith("size", 130);
    fireEvent.change(input, { target: { value: "" } });
    expect(setValue).toHaveBeenCalledTimes(1);
  });

  it("puts an out of range value back inside the bounds on blur", async () => {
    const { setValue } = await renderField("icon-size", { size: 400 });
    fireEvent.blur(screen.getByRole("spinbutton"));
    expect(setValue).toHaveBeenCalledWith("size", 150);
  });

  it("keeps what is typed while the box has focus", async () => {
    const { setValue } = await renderField("icon-size", { size: 100 });
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.change(input, { target: { value: "80" } });
    expect(input.value).toBe("80");
    expect(setValue).toHaveBeenLastCalledWith("size", 80);
    fireEvent.blur(input);
    expect(input.value).toBe("80");
  });

  it("changes nothing when the box is only passed through", async () => {
    const { setValue } = await renderField("icon-size");
    const input = screen.getByRole("spinbutton");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(setValue).not.toHaveBeenCalled();
  });
});

describe("icon picker follows a late value", () => {
  const chip = (name: keyof typeof locales.picker.chips) =>
    screen.getByRole("button", { name: locales.picker.chips[name] });

  // The picker is only mounted by the host, so a test plugin registers a
  // wrapper that owns the value and hands its setter back to the test.
  async function mount(value: string) {
    let setValue: (next: string) => void = () => {};
    function Harness() {
      const [current, set] = useState(value);
      setValue = set;
      return <IconPicker value={current} color="" onChange={() => {}} />;
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
    return (next: string) => act(() => setValue(next));
  }

  it("marks a brand icon that arrives after opening", async () => {
    const setValue = await mount("");
    expect(chip("all").getAttribute("aria-pressed")).toBe("true");
    setValue("brand-ubuntu");
    expect(
      screen
        .getByRole("button", { name: "Ubuntu" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(chip("all").getAttribute("aria-pressed")).toBe("true");
  });

  it("moves to Text when a text icon arrives after opening", async () => {
    const setValue = await mount("");
    setValue("text:plate:DB");
    expect(chip("text").getAttribute("aria-pressed")).toBe("true");
    expect(
      (screen.getByLabelText(locales.picker.textLabel) as HTMLInputElement)
        .value,
    ).toBe("DB");
  });

  it("does not fight a chip the user chose", async () => {
    const setValue = await mount("");
    fireEvent.click(chip("brands"));
    setValue("text:plate:DB");
    expect(chip("brands").getAttribute("aria-pressed")).toBe("true");
    setValue("cloud");
    expect(chip("brands").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("uploaded icons field", () => {
  const ID = "33333333-3333-4333-8333-333333333333";
  const api = {
    get: async () => ({
      data: {
        icons: [
          {
            id: ID,
            name: "Logo",
            kind: "svg",
            data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>',
            tint: false,
            canEdit: true,
          },
        ],
      },
    }),
  } as unknown as PluginApiClient;

  afterEach(() => library.reset());

  async function renderLibraryField(permissions: string[]) {
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      api,
      permissions,
    });
    await refreshLibrary(api);
    return rendered.renderSettingsComponent("icon-library", {
      pluginId: manifest.id,
      values: {},
      setValue: vi.fn(),
      running: true,
    });
  }

  it("declares a custom user setting for it", () => {
    expect(
      manifest.contributes?.settings?.user?.find(
        (field) => field.key === "library",
      ),
    ).toMatchObject({ type: "custom", component: "icon-library" });
  });

  it("opens the manager in a dialog from a button", async () => {
    await renderLibraryField(["host-icons.upload"]);
    expect(screen.getByText(locales.settings.user.library.label)).toBeTruthy();
    expect(screen.queryByTestId("manage-dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: locales.custom.manageSettings }),
    );
    const dialog = screen.getByTestId("manage-dialog");
    expect(dialog.hasAttribute("data-host-icons-dialog")).toBe(true);
    expect(within(dialog).getByText(locales.custom.manageTitle)).toBeTruthy();
    expect(
      within(dialog).getByLabelText(
        locales.custom.renameLabel.replace("{{name}}", "Logo"),
      ),
    ).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: locales.custom.done }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("manage-dialog")).toBeNull(),
    );
  });

  it("is also shown to a user who only has the manage permission", async () => {
    await renderLibraryField(["host-icons.manage"]);
    expect(
      screen.getByRole("button", { name: locales.custom.manageSettings }),
    ).toBeTruthy();
  });

  it("is hidden from a user with neither permission", async () => {
    const element = await renderLibraryField([]);
    expect(element.textContent).toBe("");
  });
});
