import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
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

  it("declares the icon and color as custom, defaultable fields", () => {
    expect(fields.map((field) => field.key)).toEqual(["icon", "color"]);
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

  it("asks for no capability beyond adding UI", () => {
    expect(manifest.capabilities).toEqual(["ui:surface"]);
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

  it("name every brand group and both packs, but no single brand", () => {
    for (const group of BRAND_GROUPS) {
      expect(
        (locales.brandGroups as Record<string, string>)[group],
        group,
      ).toBeTruthy();
    }
    expect(Object.keys(locales.brandGroups).sort()).toEqual(
      [...BRAND_GROUPS].sort(),
    );
    expect(locales.picker.packIcons).toBeTruthy();
    expect(locales.picker.packBrands).toBeTruthy();
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
      target: { value: "zzzz" },
    });
    expect(screen.getByText(locales.picker.empty)).toBeTruthy();
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

describe("icon packs", () => {
  const brandsTab = () =>
    screen.getByRole("radio", { name: locales.picker.packBrands });
  const iconsTab = () =>
    screen.getByRole("radio", { name: locales.picker.packIcons });
  const tile = (name: string) => screen.queryByRole("button", { name });

  it("opens on Icons and shows the Lucide groups", async () => {
    await renderField("icon-picker");
    expect(iconsTab().getAttribute("aria-checked")).toBe("true");
    expect(brandsTab().getAttribute("aria-checked")).toBe("false");
    expect(tile(locales.icons.router)).not.toBeNull();
    expect(tile("Ubuntu")).toBeNull();
    expect(screen.getByText(locales.groups.servers)).toBeTruthy();
    expect(screen.queryByText(locales.brandGroups.os)).toBeNull();
  });

  it("switches to the brand logos, grouped, and back", async () => {
    await renderField("icon-picker");
    fireEvent.click(brandsTab());
    expect(brandsTab().getAttribute("aria-checked")).toBe("true");
    expect(tile("Ubuntu")).not.toBeNull();
    expect(tile(locales.icons.router)).toBeNull();
    for (const group of BRAND_GROUPS) {
      expect(screen.getByText(locales.brandGroups[group])).toBeTruthy();
    }
    // The No icon tile stays in both packs.
    expect(tile(locales.picker.none)).not.toBeNull();
    fireEvent.click(iconsTab());
    expect(tile(locales.icons.router)).not.toBeNull();
    expect(tile("Ubuntu")).toBeNull();
  });

  it("stores the id of the brand picked", async () => {
    const { setValue } = await renderField("icon-picker");
    fireEvent.click(brandsTab());
    fireEvent.click(screen.getByRole("button", { name: "Ubuntu" }));
    expect(setValue).toHaveBeenCalledWith("icon", "brand-ubuntu");
  });

  it("opens on Brands when the value is a brand, and marks it", async () => {
    await renderField("icon-picker", {
      icon: "brand-debian",
      color: "#22c55e",
    });
    expect(brandsTab().getAttribute("aria-checked")).toBe("true");
    expect(tile("Debian")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("opens on Icons for an empty value or an id it does not know", async () => {
    await renderField("icon-picker", { icon: "brand-from-the-future" });
    expect(iconsTab().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/does not know/)).toBeTruthy();
  });

  it("searches both packs from the Icons tab", async () => {
    await renderField("icon-picker");
    expect(iconsTab().getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "k8s" },
    });
    expect(tile("Kubernetes")).not.toBeNull();
    expect(tile("K3s")).not.toBeNull();
    expect(tile(locales.icons.router)).toBeNull();
    // Group headings and the No icon tile give way to the results.
    expect(tile(locales.picker.none)).toBeNull();
  });

  it("shows Lucide and brand matches together", async () => {
    await renderField("icon-picker");
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "kubernetes" },
    });
    expect(tile(locales.icons.container)).not.toBeNull();
    expect(tile("Kubernetes")).not.toBeNull();
  });

  it("searches both packs from the Brands tab too", async () => {
    await renderField("icon-picker");
    fireEvent.click(brandsTab());
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "docker" },
    });
    expect(tile("Docker")).not.toBeNull();
    expect(tile(locales.icons.container)).not.toBeNull();
  });

  it("keeps the pack chosen after a search is cleared", async () => {
    await renderField("icon-picker");
    fireEvent.click(brandsTab());
    const search = screen.getByLabelText(locales.picker.search);
    fireEvent.change(search, { target: { value: "brand-ubuntu" } });
    fireEvent.change(search, { target: { value: "" } });
    expect(tile("Ubuntu")).not.toBeNull();
    expect(tile(locales.icons.router)).toBeNull();
  });
});

describe("color field", () => {
  it("stores a typed color", async () => {
    const { element, setValue } = await renderField("icon-color");
    const input = within(element).getByPlaceholderText("#6b7280");
    fireEvent.change(input, { target: { value: "#3b82f6" } });
    expect(setValue).toHaveBeenCalledWith("color", "#3b82f6");
  });

  it("goes back to the theme color", async () => {
    const { setValue } = await renderField("icon-color", { color: "#ef4444" });
    const theme = screen.getByRole("button", {
      name: locales.picker.themeColor,
    });
    expect(theme.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(theme);
    expect(setValue).toHaveBeenCalledWith("color", "");
  });

  it("shows the theme color as chosen when none is set", async () => {
    await renderField("icon-color");
    expect(
      screen
        .getByRole("button", { name: locales.picker.themeColor })
        .getAttribute("aria-pressed"),
    ).toBe("true");
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

describe("icon picker pack follows a late value", () => {
  const brandsTab = () =>
    screen.getByRole("radio", { name: locales.picker.packBrands });
  const iconsTab = () =>
    screen.getByRole("radio", { name: locales.picker.packIcons });

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

  it("moves to Brands when a brand icon arrives after opening", async () => {
    const setValue = await mount("");
    expect(iconsTab().getAttribute("aria-checked")).toBe("true");
    setValue("brand-ubuntu");
    expect(brandsTab().getAttribute("aria-checked")).toBe("true");
  });

  it("does not fight a pack the user chose", async () => {
    const setValue = await mount("");
    fireEvent.click(brandsTab());
    setValue("cloud");
    // An Icons value is no move away from the (default) Icons value.
    expect(brandsTab().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(iconsTab());
    setValue("");
    expect(iconsTab().getAttribute("aria-checked")).toBe("true");
  });

  it("stays on the pack when the value is cleared or unknown", async () => {
    const setValue = await mount("brand-ubuntu");
    expect(brandsTab().getAttribute("aria-checked")).toBe("true");
    setValue("");
    expect(brandsTab().getAttribute("aria-checked")).toBe("true");
    setValue("from-the-future");
    expect(brandsTab().getAttribute("aria-checked")).toBe("true");
  });

  it("follows a later change to the other pack", async () => {
    const setValue = await mount("brand-ubuntu");
    setValue("cloud");
    expect(iconsTab().getAttribute("aria-checked")).toBe("true");
  });
});
