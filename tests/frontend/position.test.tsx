import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import { hostBadgesFor, useHostBadges } from "@termix-ssh/plugin-sdk/ui";
import * as plugin from "../../src/frontend/index";
import {
  DEFAULT_POSITION,
  BASE_PROPERTY,
  FOLDER_ATTRIBUTE,
  FOLDER_SCALE_PROPERTY,
  SCALE_PROPERTY,
  createPreferences,
  normalizePosition,
  normalizeFolderSize,
  normalizeSize,
} from "../../src/frontend/preferences";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const userSettings: { values: Record<string, unknown> } = { values: {} };
vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSettings: () => ({ ...userSettings, loaded: true, save: vi.fn() }),
}));

const manifest = manifestJson as unknown as PluginManifest;
// Vitest runs from the project root.
const css = readFileSync(resolve("src/frontend/host-icons.css"), "utf8");
// jsdom keeps calc() as written: the large icon's room, at the user's scale.
const ROOM = "calc(2.25rem * var(--host-icons-scale, 1))";
const scale = () =>
  document.documentElement.style.getPropertyValue(SCALE_PROPERTY);

type TestHost = Record<string, unknown> & { id: string; name: string };

const withIcon: TestHost = {
  id: "1",
  name: "db-1",
  ip: "10.0.0.1",
  port: 22,
  pluginSettings: { "host-icons": { icon: "database" } },
};
const plain: TestHost = {
  id: "2",
  name: "web-1",
  ip: "10.0.0.2",
  port: 22,
  pluginSettings: {},
};

let rendered: RenderedPluginApp | null = null;

beforeEach(() => {
  userSettings.values = {};
});

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
  document.head.querySelectorAll("style").forEach((style) => style.remove());
});

// The Classic Layout host row, trimmed to the parts the CSS relies on.
function ClassicRow({ host }: { host: TestHost }) {
  const badges = hostBadgesFor(useHostBadges(), host as never);
  return (
    <div className="group relative flex items-stretch">
      <div className="host-status-stripe" />
      <div
        className="flex flex-col flex-1 min-w-0"
        data-testid={`column-${host.id}`}
      >
        <div data-drag-label className="flex items-center gap-1.5">
          <span>{host.name}</span>
          {badges.map((badge) => {
            const Badge = badge.component;
            return <Badge key={badge.id} host={host as never} />;
          })}
        </div>
        <div>{String(host.ip)}</div>
      </div>
    </div>
  );
}

async function renderRows(
  position?: string,
  hosts = [withIcon, plain],
  extra: Record<string, unknown> = {},
) {
  userSettings.values = { ...(position ? { position } : {}), ...extra };
  rendered = await renderWithApp(plugin, { manifest, locales, hosts });
  rendered.renderSlot("shell.overlay");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  render(
    <>
      {hosts.map((host) => (
        <ClassicRow key={host.id} host={host} />
      ))}
    </>,
  );
  await act(async () => {});
  return {
    badge: screen.queryByTestId("host-icon-badge"),
    slot: screen.queryByTestId("host-icon-slot"),
    column: (host: TestHost) => screen.getByTestId(`column-${host.id}`),
  };
}

describe("icon position setting", () => {
  it("is a user select with large as the default", () => {
    const field = manifest.contributes?.settings?.user?.find(
      (entry) => entry.key === "position",
    );
    expect(field?.type).toBe("select");
    expect(field?.default).toBe(DEFAULT_POSITION);
    expect(field?.options?.map((option) => option.value)).toEqual([
      "large",
      "small",
      "after",
    ]);
  });

  it("treats an unknown value as the default", () => {
    expect(normalizePosition("small")).toBe("small");
    expect(normalizePosition("middle")).toBe("large");
    expect(normalizePosition(undefined)).toBe("large");
  });

  it("tells subscribers only about real changes", () => {
    const preferences = createPreferences();
    const listener = vi.fn();
    preferences.subscribe(listener);
    const rules: never[] = [];
    preferences.set({
      position: "large",
      anyIcon: false,
      skipEmptySlot: true,
      rules,
    });
    expect(listener).not.toHaveBeenCalled();
    preferences.set({
      position: "after",
      anyIcon: false,
      skipEmptySlot: true,
      rules,
    });
    preferences.set({
      position: "after",
      anyIcon: true,
      skipEmptySlot: true,
      rules,
    });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(preferences.get()).toEqual({
      position: "after",
      anyIcon: true,
      skipEmptySlot: true,
      rules,
    });
  });
});

describe("icon size setting", () => {
  it("is a user field drawn by our own component, 100 by default", () => {
    const field = manifest.contributes?.settings?.user?.find(
      (entry) => entry.key === "size",
    );
    expect(field).toMatchObject({
      type: "custom",
      component: "icon-size",
      default: 100,
    });
  });

  it("keeps a stored value inside the bounds", () => {
    expect(normalizeSize(125)).toBe(125);
    expect(normalizeSize("80")).toBe(80);
    expect(normalizeSize(10)).toBe(50);
    expect(normalizeSize(400)).toBe(150);
    expect(normalizeSize(undefined)).toBe(100);
    expect(normalizeSize("big")).toBe(100);
    expect(normalizeSize("")).toBe(100);
  });

  it("scales every icon size through one root variable", async () => {
    await renderRows(undefined, undefined, { size: 125 });
    expect(scale()).toBe("1.25");
    expect(css).toContain(
      "height: calc(1.375rem * var(--host-icons-scale, 1))",
    );
    expect(css).toContain("width: calc(0.875rem * var(--host-icons-scale, 1))");
  });

  it("tells the picker the list's icon size for the position", async () => {
    const base = () =>
      document.documentElement.style.getPropertyValue(BASE_PROPERTY);
    await renderRows("small");
    expect(base()).toBe("0.875rem");
    await act(async () => {
      await rendered!.deactivate();
    });
    rendered = null;
    expect(base()).toBe("");
    expect(css).toContain(
      "var(--host-icons-base, 1.375rem) * var(--host-icons-scale, 1)",
    );
  });

  it("drops the variable when the plugin is disabled", async () => {
    await renderRows(undefined, undefined, { size: 80 });
    expect(scale()).toBe("0.8");
    await act(async () => {
      await rendered!.deactivate();
    });
    rendered = null;
    expect(scale()).toBe("");
  });
});

describe("badge placement", () => {
  it("is large by default and makes room in the row's text column", async () => {
    const { badge, column } = await renderRows();
    expect(badge!.dataset.hostIconPosition).toBe("large");
    expect(getComputedStyle(badge!).position).toBe("absolute");
    expect(getComputedStyle(column(withIcon)).paddingLeft).toBe(ROOM);
  });

  it("lines up hosts without an icon once the user asks for it", async () => {
    const { slot, column } = await renderRows(undefined, undefined, {
      skipEmptySlot: false,
    });
    expect(slot).not.toBeNull();
    expect(getComputedStyle(column(plain)).paddingLeft).toBe(ROOM);
  });

  it("indents only hosts with an icon by default", async () => {
    const { badge, slot, column } = await renderRows();
    expect(badge!.dataset.hostIconPosition).toBe("large");
    expect(slot).toBeNull();
    expect(getComputedStyle(column(withIcon)).paddingLeft).toBe(ROOM);
    expect(getComputedStyle(column(plain)).paddingLeft).not.toBe("36px");
  });

  it("leaves rows alone while no host has an icon", async () => {
    const { badge, slot, column } = await renderRows(undefined, [plain]);
    expect(badge).toBeNull();
    expect(slot).toBeNull();
    expect(getComputedStyle(column(plain)).paddingLeft).not.toBe("36px");
  });

  it("puts a small icon before the name without touching the row", async () => {
    const { badge, slot, column } = await renderRows("small");
    expect(badge!.dataset.hostIconPosition).toBe("small");
    expect(getComputedStyle(badge!).order).toBe("-1");
    expect(getComputedStyle(badge!).position).not.toBe("absolute");
    expect(slot).toBeNull();
    expect(getComputedStyle(column(withIcon)).paddingLeft).not.toBe("36px");
  });

  it("leaves the icon after the name", async () => {
    const { badge, slot, column } = await renderRows("after");
    expect(badge!.dataset.hostIconPosition).toBe("after");
    expect(getComputedStyle(badge!).order).not.toBe("-1");
    expect(slot).toBeNull();
    expect(getComputedStyle(column(withIcon)).paddingLeft).not.toBe("36px");
  });

  it("only restyles rows that hold the icon or its slot", async () => {
    await renderRows();
    const other = document.createElement("div");
    other.innerHTML = `<div data-drag-label><span>no icon</span></div>`;
    document.body.appendChild(other);
    expect(getComputedStyle(other).paddingLeft).not.toBe("36px");
    other.remove();
  });
});

// The Classic Layout folder row, trimmed to the parts the CSS relies on.
function ClassicFolder() {
  return (
    <div
      role="button"
      aria-expanded={false}
      className="group/folder flex items-center gap-2"
    >
      <svg data-testid="chevron" />
      <svg data-testid="folder-icon" />
      <span>Home</span>
    </div>
  );
}

describe("folder icons", () => {
  const marked = () => document.documentElement.hasAttribute(FOLDER_ATTRIBUTE);
  const folderScale = () =>
    document.documentElement.style.getPropertyValue(FOLDER_SCALE_PROPERTY);

  async function renderFolder(extra: Record<string, unknown> = {}) {
    await renderRows("small", [withIcon], extra);
    render(<ClassicFolder />);
    return {
      icon: getComputedStyle(screen.getByTestId("folder-icon")),
      chevron: getComputedStyle(screen.getByTestId("chevron")),
    };
  }

  it("is a user size field at 100% by default", () => {
    const field = manifest.contributes?.settings?.user?.find(
      (entry) => entry.key === "folderSize",
    );
    expect(field).toMatchObject({
      type: "custom",
      component: "folder-icon-size",
      default: 100,
    });
  });

  it("keeps a stored value inside 75-200", () => {
    expect(normalizeFolderSize(200)).toBe(200);
    expect(normalizeFolderSize(10)).toBe(75);
    expect(normalizeFolderSize(400)).toBe(200);
    expect(normalizeFolderSize(undefined)).toBe(100);
  });

  it("leaves folder icons alone at 100%", async () => {
    const { icon } = await renderFolder({ folderSize: 100 });
    expect(marked()).toBe(false);
    expect(folderScale()).toBe("");
    expect(icon.width).toBe("auto");
  });

  it("scales only the folder icon otherwise", async () => {
    const { icon, chevron } = await renderFolder({ folderSize: 200 });
    expect(marked()).toBe(true);
    expect(folderScale()).toBe("2");
    const size = "calc(1rem * var(--host-icons-folder-scale, 1))";
    expect(icon.width).toBe(size);
    expect(icon.height).toBe(size);
    expect(chevron.width).toBe("auto");
  });

  it("drops the attribute when the plugin is disabled", async () => {
    await renderFolder({ folderSize: 150 });
    expect(marked()).toBe(true);
    await act(async () => {
      await rendered!.deactivate();
    });
    rendered = null;
    expect(marked()).toBe(false);
    expect(folderScale()).toBe("");
  });
});
