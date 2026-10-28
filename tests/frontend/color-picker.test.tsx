import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
import { ColorPicker } from "../../src/frontend/IconPicker";
import { findIcon, type HostIconDef } from "../../src/frontend/icons";
import { library } from "../../src/frontend/library";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSettings: () => ({ values: {}, loaded: true, save: vi.fn() }),
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
  notifyHostsChanged: () => undefined,
}));

const manifest = manifestJson as unknown as PluginManifest;
const PNG_ID = "22222222-2222-4222-8222-222222222222";
const SVG_ID = "11111111-1111-4111-8111-111111111111";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>`;
const rows = [
  {
    id: PNG_ID,
    name: "Photo",
    kind: "png",
    data: "iVBORw0KGgo=",
    tint: false,
    canEdit: false,
  },
  {
    id: SVG_ID,
    name: "Mono",
    kind: "svg",
    data: SVG,
    tint: true,
    canEdit: false,
  },
];

const own = () => findIcon(`custom:${PNG_ID}`) as HostIconDef;

beforeEach(() => library.set(rows));
afterEach(async () => {
  await harness?.deactivate();
  harness = null;
  cleanup();
  library.reset();
});

let harness: RenderedPluginApp | null = null;

/** Renders a ColorPicker inside the SDK test host, so texts are translated. */
async function picker(
  icon: HostIconDef | null | undefined,
  options: { value?: string; themeLabel?: string; onChange?: () => void } = {},
) {
  harness = await renderWithApp(
    {
      activate(app) {
        app.registerSettingsComponent("harness", () => (
          <ColorPicker
            value={options.value ?? ""}
            onChange={options.onChange ?? vi.fn()}
            icon={icon}
            themeLabel={options.themeLabel}
          />
        ));
      },
    },
    { manifest, locales },
  );
  harness.renderSettingsComponent("harness", {});
}

describe("ColorPicker empty choice", () => {
  it("is Own colors for a multicolor upload", async () => {
    await picker(own());
    const button = screen.getByRole("button", {
      name: locales.picker.ownColors,
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(locales.picker.ownColorsHint)).toBeTruthy();
    expect(within(button).getByTestId("no-color-preview")).toBeTruthy();
  });

  it.each([
    ["a Lucide icon", "server"],
    ["a brand", "brand-docker"],
    ["a text icon", "text:frame:DB"],
    ["a monochrome upload", `custom:${SVG_ID}`],
  ])("stays Theme color for %s", async (_name, id) => {
    await picker(findIcon(id));
    const button = screen.getByRole("button", {
      name: locales.picker.themeColor,
    });
    expect(screen.getByText(locales.picker.themeColorHint)).toBeTruthy();
    expect(within(button).getByTestId("no-color-preview")).toBeTruthy();
  });

  it("is No color, without a preview, when the icon is unknown", async () => {
    await picker(null);
    const button = screen.getByRole("button", {
      name: locales.picker.noColor,
    });
    expect(screen.getByText(locales.picker.noColorHint)).toBeTruthy();
    expect(within(button).queryByTestId("no-color-preview")).toBeNull();
  });

  it("is No color for an upload the library has not loaded", async () => {
    library.reset();
    await picker(findIcon(`custom:${PNG_ID}`));
    expect(
      screen.getByRole("button", { name: locales.picker.noColor }),
    ).toBeTruthy();
  });

  it("keeps a given label and shows no preview or hint", async () => {
    await picker(own(), { themeLabel: "Chip" });
    const button = screen.getByRole("button", { name: "Chip" });
    expect(within(button).queryByTestId("no-color-preview")).toBeNull();
    expect(screen.queryByText(locales.picker.ownColorsHint)).toBeNull();
  });
});

describe("ColorPicker hex field", () => {
  it("is empty with a placeholder while no color is set", async () => {
    await picker(null);
    const input = screen.getByLabelText(
      locales.picker.hexInput,
    ) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("#rrggbb");
  });

  it("shows, types and picks colors", async () => {
    const onChange = vi.fn();
    await picker(null, { value: "#ef4444", onChange });
    const input = screen.getByLabelText(
      locales.picker.hexInput,
    ) as HTMLInputElement;
    expect(input.value).toBe("#ef4444");
    fireEvent.change(input, { target: { value: "#3b82f6" } });
    expect(onChange).toHaveBeenLastCalledWith("#3b82f6");
    fireEvent.click(screen.getByRole("button", { name: "#22c55e" }));
    expect(onChange).toHaveBeenLastCalledWith("#22c55e");
    fireEvent.change(screen.getByLabelText(locales.picker.colorInput), {
      target: { value: "#a855f7" },
    });
    expect(onChange).toHaveBeenLastCalledWith("#a855f7");
  });
});

describe("Change icon dialog", () => {
  let rendered: RenderedPluginApp | null = null;
  afterEach(async () => {
    await rendered?.deactivate();
    rendered = null;
  });

  it("follows the icon picked in it", async () => {
    const host = {
      id: "7",
      name: "web-1",
      ip: "10.0.0.7",
      port: 22,
      pluginSettings: { "host-icons": { icon: `custom:${PNG_ID}`, color: "" } },
    };
    let items: ReturnType<typeof hostMenuItemsFor> = [];
    function Menu() {
      items = hostMenuItemsFor(useHostContextMenuItems(), host as never);
      return null;
    }
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      hosts: [host],
    });
    rendered.renderSlot("shell.overlay");
    render(<Menu />);
    library.set(rows);
    act(() =>
      items
        .find((entry) => entry.id === "change-icon")!
        .run(host as never, {} as never),
    );
    await screen.findByRole("dialog");
    expect(
      screen.getByRole("button", { name: locales.picker.ownColors }),
    ).toBeTruthy();
    fireEvent.click(screen.getByText(locales.picker.packIcons));
    fireEvent.click(
      screen.getByRole("button", { name: locales.icons.database }),
    );
    expect(
      screen.getByRole("button", { name: locales.picker.themeColor }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: locales.picker.none }));
    expect(
      screen.getByRole("button", { name: locales.picker.noColor }),
    ).toBeTruthy();
  });
});
