import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import { hostBadgesFor, useHostBadges } from "@termix-ssh/plugin-sdk/ui";
import * as plugin from "../../src/frontend/index";
import { HostIcon, customIconUrl } from "../../src/frontend/HostIcon";
import { IconPicker } from "../../src/frontend/IconPicker";
import { findIcon, iconLabel, resolveHostIcon } from "../../src/frontend/icons";
import {
  library,
  refreshLibrary,
  type CustomIconDef,
} from "../../src/frontend/library";
import { errorKey } from "../../src/frontend/uploaded";
import { activeRules, type IconRule } from "../../src/frontend/rules";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const userSettings: { values: Record<string, unknown> } = { values: {} };
const toast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};
vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSettings: () => ({ ...userSettings, loaded: true, save: vi.fn() }),
  useToast: () => toast,
}));

const manifest = manifestJson as unknown as PluginManifest;

const SVG_ID = "11111111-1111-4111-8111-111111111111";
const PNG_ID = "22222222-2222-4222-8222-222222222222";
const NEW_ID = "33333333-3333-4333-8333-333333333333";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>`;
const PNG_B64 = "iVBORw0KGgo=";

type Row = {
  id: string;
  name: string;
  kind: "svg" | "png";
  data: string;
  tint: boolean;
  canEdit: boolean;
};

const svgRow: Row = {
  id: SVG_ID,
  name: "Company logo",
  kind: "svg",
  data: SVG,
  tint: true,
  canEdit: true,
};
const pngRow: Row = {
  id: PNG_ID,
  name: "Badge photo",
  kind: "png",
  data: PNG_B64,
  tint: false,
  canEdit: false,
};

/** A fake of the plugin's routes over a mutable list. */
function fakeApi(initial: Row[]) {
  const rows = initial.map((row) => ({ ...row }));
  const get = vi.fn(async () => ({
    data: { icons: rows.map((r) => ({ ...r })) },
  }));
  const post = vi.fn(async (_url: string, body: unknown) => {
    const { name, kind, data, tint } = body as Omit<Row, "id" | "canEdit">;
    rows.push({ id: NEW_ID, name, kind, data, tint, canEdit: true });
    return { data: { icon: { id: NEW_ID } } };
  });
  const patch = vi.fn(async (url: string, body: unknown) => {
    const row = rows.find((r) => url.endsWith(r.id))!;
    Object.assign(row, body);
    return { data: {} };
  });
  const del = vi.fn(async (url: string) => {
    rows.splice(
      rows.findIndex((r) => url.endsWith(r.id)),
      1,
    );
    return { data: {} };
  });
  const api = {
    get,
    post,
    patch,
    delete: del,
    put: vi.fn(),
  } as unknown as PluginApiClient;
  return { api, get, post, patch, del, rows };
}

let rendered: RenderedPluginApp | null = null;

beforeEach(() => {
  userSettings.values = {};
  toast.success.mockReset();
  toast.error.mockReset();
  library.reset();
});

afterEach(async () => {
  cleanup();
  await rendered?.deactivate();
  rendered = null;
  vi.restoreAllMocks();
});

describe("library store", () => {
  it("loads rows once and refreshes after a change", async () => {
    const fake = fakeApi([svgRow]);
    expect(library.get().loaded).toBe(false);
    expect(await refreshLibrary(fake.api)).toBe(true);
    expect(library.get().loaded).toBe(true);
    expect(findIcon(`custom:${SVG_ID}`)).toMatchObject({
      name: "Company logo",
      kind: "svg",
      tint: true,
      canEdit: true,
    });
    const before = findIcon(`custom:${SVG_ID}`);

    fake.rows.push(pngRow);
    await refreshLibrary(fake.api);
    expect(library.get().icons).toHaveLength(2);
    // An icon that did not change keeps its object.
    expect(findIcon(`custom:${SVG_ID}`)).toBe(before);
  });

  it("keeps what it had when a refresh fails", async () => {
    const fake = fakeApi([svgRow]);
    await refreshLibrary(fake.api);
    fake.get.mockRejectedValueOnce(new Error("down"));
    expect(await refreshLibrary(fake.api)).toBe(false);
    expect(library.get().icons).toHaveLength(1);
  });

  it("ignores rows it cannot use", () => {
    library.set([svgRow, { id: "x" }, null, { ...pngRow, data: "" }]);
    expect(library.get().icons).toHaveLength(1);
  });

  it("does not let an older, slower request win", async () => {
    let release: (value: unknown) => void = () => {};
    const slow = {
      get: vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    } as unknown as PluginApiClient;
    const first = refreshLibrary(slow);
    await refreshLibrary(fakeApi([pngRow]).api);
    release({ data: { icons: [svgRow] } });
    await first;
    expect(library.get().icons.map((icon) => icon.id)).toEqual([
      `custom:${PNG_ID}`,
    ]);
  });

  it("is only a custom id when it is a uuid", () => {
    library.set([svgRow]);
    expect(findIcon("custom:nope")).toBeUndefined();
    expect(findIcon(`custom:${NEW_ID}`)).toBeUndefined();
  });
});

describe("HostIcon with an uploaded icon", () => {
  const def = (row: Row) => {
    library.set([row]);
    return findIcon(`custom:${row.id}`) as CustomIconDef;
  };

  it("draws a plain image as an img with a data url", () => {
    const icon = def(pngRow);
    const { container } = render(<HostIcon icon={icon} className="size-4" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(`data:image/png;base64,${PNG_B64}`);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.className).toContain("size-4");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("draws a recolored icon as a mask filled with the color", () => {
    const icon = def(svgRow);
    const { container } = render(
      <HostIcon icon={icon} color="#ff0000" className="size-4" />,
    );
    expect(container.querySelector("img")).toBeNull();
    const mask = container.querySelector<HTMLElement>(
      "[data-custom-icon=mask]",
    )!;
    expect(mask.className).toContain("size-4");
    expect(mask.style.color).toBe("rgb(255, 0, 0)");
    expect(mask.style.backgroundColor).toBe("currentcolor");
    expect(customIconUrl(icon)).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(customIconUrl(icon))).toContain("<path");
  });

  it("paints a multicolor icon once a color is chosen", () => {
    const icon = def(pngRow);
    const { container } = render(
      <HostIcon icon={icon} color="#00ff00" className="size-4" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-custom-icon=mask]")!.style
        .color,
    ).toBe("rgb(0, 255, 0)");
  });

  it("draws a monochrome icon in the theme color without a color", () => {
    const { container } = render(<HostIcon icon={def(svgRow)} />);
    const mask = container.querySelector<HTMLElement>(
      "[data-custom-icon=mask]",
    )!;
    expect(mask.style.color).toBe("");
    expect(mask.style.backgroundColor).toBe("currentcolor");
  });

  it("never puts the markup into the page", () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>`;
    library.set([{ ...svgRow, data: evil, tint: false }]);
    const { container } = render(
      <HostIcon icon={findIcon(`custom:${SVG_ID}`)!} />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("<script");
  });
});

type TestHost = Record<string, unknown> & { id: string; name: string };

const customHost = (id: string): TestHost => ({
  id: "1",
  name: "db-1",
  ip: "10.0.0.1",
  port: 22,
  tags: ["prod"],
  pluginSettings: { "host-icons": { icon: `custom:${id}` } },
});

function Row({ host }: { host: TestHost }) {
  const badges = hostBadgesFor(useHostBadges(), host as never);
  return (
    <div data-testid={`row-${host.id}`}>
      {badges.map((badge) => {
        const Badge = badge.component;
        return <Badge key={badge.id} host={host as never} />;
      })}
    </div>
  );
}

async function renderRow(host: TestHost, api: PluginApiClient) {
  rendered = await renderWithApp(plugin, {
    manifest,
    locales,
    hosts: [host],
    api,
  });
  rendered.renderSlot("shell.overlay");
  render(<Row host={host} />);
}

describe("badge with an uploaded icon", () => {
  it("draws an empty slot until the library has loaded, then the icon", async () => {
    let release: () => void = () => {};
    const fake = fakeApi([pngRow]);
    fake.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ data: { icons: [{ ...pngRow }] } } as never);
        }),
    );
    await renderRow(customHost(PNG_ID), fake.api);
    const badge = screen.getByTestId("host-icon-badge");
    expect(badge.querySelector("[data-custom-icon=pending]")).not.toBeNull();
    expect(badge.querySelector("svg")).toBeNull();
    expect(badge.querySelector("img")).toBeNull();

    await act(async () => release());
    const loaded = screen.getByTestId("host-icon-badge");
    expect(loaded.querySelector("img")!.getAttribute("src")).toContain(PNG_B64);
    expect(loaded.getAttribute("aria-label")).toBe("Badge photo");
    // The badge itself never asks for the library: only the overlay did.
    expect(fake.get).toHaveBeenCalledTimes(1);
  });

  it("draws a recolored icon as a mask", async () => {
    const fake = fakeApi([svgRow]);
    await renderRow(customHost(SVG_ID), fake.api);
    await waitFor(() =>
      expect(
        screen
          .getByTestId("host-icon-badge")
          .querySelector("[data-custom-icon=mask]"),
      ).not.toBeNull(),
    );
  });

  it("falls back once the library has loaded without the icon", async () => {
    const fake = fakeApi([svgRow]);
    await renderRow(customHost(NEW_ID), fake.api);
    await waitFor(() =>
      expect(
        screen.getByTestId("host-icon-badge").querySelector("svg"),
      ).not.toBeNull(),
    );
    expect(
      screen.getByTestId("host-icon-badge").querySelector("[data-custom-icon]"),
    ).toBeNull();
  });

  it("follows a delete without a reload", async () => {
    const fake = fakeApi([svgRow]);
    await renderRow(customHost(SVG_ID), fake.api);
    await waitFor(() =>
      expect(
        screen
          .getByTestId("host-icon-badge")
          .querySelector("[data-custom-icon=mask]"),
      ).not.toBeNull(),
    );
    fake.rows.length = 0;
    await act(async () => {
      await refreshLibrary(fake.api);
    });
    expect(
      screen.getByTestId("host-icon-badge").querySelector("svg"),
    ).not.toBeNull();
  });

  it("counts an uploaded icon as an icon for the empty slot", async () => {
    userSettings.values = { skipEmptySlot: false };
    const other: TestHost = {
      id: "2",
      name: "web-1",
      ip: "10.0.0.2",
      port: 22,
      tags: [],
      pluginSettings: {},
    };
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      hosts: [customHost(PNG_ID), other],
      api: fakeApi([pngRow]).api,
    });
    rendered.renderSlot("shell.overlay");
    render(<Row host={other} />);
    await act(async () => {});
    expect(screen.getByTestId("host-icon-slot")).toBeTruthy();
  });
});

describe("rules with an uploaded icon", () => {
  const rule: IconRule = {
    match: "tag",
    value: "prod",
    icon: `custom:${PNG_ID}`,
    color: "",
    override: false,
  };

  it("keeps the rule while the library loads and after, when the icon exists", () => {
    expect(activeRules([rule])).toHaveLength(1);
    library.set([pngRow]);
    expect(activeRules([rule])).toHaveLength(1);
  });

  it("drops the rule when the loaded library lacks the icon", () => {
    library.set([svgRow]);
    expect(activeRules([rule])).toHaveLength(0);
  });

  it("draws the rule's uploaded icon on a host without one", async () => {
    userSettings.values = { rules: [rule] };
    const host: TestHost = {
      id: "5",
      name: "db-5",
      ip: "10.0.0.5",
      port: 22,
      tags: ["prod"],
      pluginSettings: {},
    };
    await renderRow(host, fakeApi([pngRow]).api);
    await waitFor(() =>
      expect(
        screen.getByTestId("host-icon-badge").querySelector("img"),
      ).not.toBeNull(),
    );
    expect(screen.getByTestId("host-icon-badge").dataset.hostIconSource).toBe(
      "rule",
    );
  });
});

describe("icons helpers", () => {
  it("names a custom icon by its name", () => {
    library.set([svgRow]);
    const icon = findIcon(`custom:${SVG_ID}`)!;
    expect(iconLabel(icon, (key) => key)).toBe("Company logo");
    expect(resolveHostIcon({ icon: `custom:${SVG_ID}` })?.icon.id).toBe(
      `custom:${SVG_ID}`,
    );
  });
});

describe("error mapping", () => {
  const http = (status: number, error = "") => ({
    response: { status, data: { error } },
  });

  it("maps statuses and server messages to keys", () => {
    expect(errorKey(http(403, "You may not upload icons"))).toBe("forbidden");
    expect(errorKey(http(409, "The library is full (200 icons)"))).toBe("full");
    expect(errorKey(http(400, "The SVG is too big"))).toBe("tooBig");
    expect(errorKey(http(413))).toBe("tooBig");
    expect(errorKey(http(400, "name must be 1 to 64 characters"))).toBe("name");
    expect(
      errorKey(http(400, "The PNG is bigger than 512 by 512 pixels")),
    ).toBe("pixels");
    expect(errorKey(http(400, "The file is not an SVG image"))).toBe("invalid");
    expect(errorKey(http(404, "Icon not found"))).toBe("notFound");
    expect(errorKey(new Error("network"))).toBe("failed");
  });

  it("has a string for every key", () => {
    for (const key of [
      "type",
      "tooBig",
      "unreadable",
      "forbidden",
      "notFound",
      "full",
      "name",
      "pixels",
      "invalid",
      "failed",
    ]) {
      expect(
        (locales.custom.errors as Record<string, string>)[key],
      ).toBeTruthy();
    }
  });
});

describe("uploaded tab of the picker", () => {
  async function renderPicker(
    rows: Row[],
    options: { permissions?: string[]; value?: string } = {},
  ) {
    const fake = fakeApi(rows);
    const onChange = vi.fn();
    rendered = await renderWithApp(
      {
        activate(app) {
          app.registerSettingsComponent("harness", () => (
            <IconPicker
              value={options.value ?? ""}
              color=""
              onChange={onChange}
            />
          ));
        },
      },
      {
        manifest,
        locales,
        api: fake.api,
        permissions: options.permissions ?? ["host-icons.upload"],
      },
    );
    await refreshLibrary(fake.api);
    rendered.renderSettingsComponent("harness", {});
    await act(async () => {});
    return { ...fake, onChange };
  }

  const openTab = () =>
    fireEvent.click(screen.getByRole("radio", { name: "Uploaded" }));
  const pickFile = async (file: File) => {
    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
  };

  it("lists the library and selects an icon", async () => {
    const { onChange } = await renderPicker([svgRow, pngRow]);
    openTab();
    fireEvent.click(screen.getByRole("button", { name: "Badge photo" }));
    expect(onChange).toHaveBeenCalledWith(`custom:${PNG_ID}`);
  });

  it("opens on the tab when the value is an uploaded icon", async () => {
    await renderPicker([svgRow], { value: `custom:${SVG_ID}` });
    expect(screen.getByTestId("uploaded-pack")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Company logo" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("finds uploaded icons from the other tabs by name", async () => {
    await renderPicker([svgRow, pngRow]);
    fireEvent.change(screen.getByLabelText(locales.picker.search), {
      target: { value: "company" },
    });
    expect(screen.getByRole("button", { name: "Company logo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Badge photo" })).toBeNull();
  });

  it("shows an empty state for an empty library", async () => {
    await renderPicker([]);
    openTab();
    expect(screen.getByText(locales.custom.empty)).toBeTruthy();
  });

  it("uploads an SVG with recolor on, then selects it", async () => {
    const { post, onChange, get } = await renderPicker([]);
    openTab();
    await pickFile(new File([SVG], "My Logo.svg", { type: "image/svg+xml" }));
    const name = (await screen.findByLabelText(
      locales.custom.nameLabel,
    )) as HTMLInputElement;
    expect(name.value).toBe("My Logo");
    const recolor = screen.getByRole("checkbox", {
      name: locales.custom.recolor,
    });
    expect(recolor.getAttribute("aria-checked")).toBe("true");

    fireEvent.change(name, { target: { value: "Logo" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: locales.custom.add }));
    });
    expect(post).toHaveBeenCalledWith("icons", {
      name: "Logo",
      kind: "svg",
      data: SVG,
      tint: true,
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith(`custom:${NEW_ID}`);
    expect(toast.success).toHaveBeenCalledWith(locales.custom.uploaded);
    expect(screen.queryByTestId("upload-draft")).toBeNull();
    expect(screen.getByRole("button", { name: "Logo" })).toBeTruthy();
  });

  it("sends a PNG as base64 without a prefix, recolor off", async () => {
    const { post } = await renderPicker([]);
    openTab();
    await pickFile(new File([new Uint8Array([137, 80, 78, 71])], "pic.png"));
    await screen.findByTestId("upload-draft");
    expect(
      screen
        .getByRole("checkbox", { name: locales.custom.recolor })
        .getAttribute("aria-checked"),
    ).toBe("false");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: locales.custom.add }));
    });
    expect(post).toHaveBeenCalledWith("icons", {
      name: "pic",
      kind: "png",
      data: "iVBORw==",
      tint: false,
    });
  });

  it("refuses a file that is too big or the wrong type before sending", async () => {
    const { post } = await renderPicker([]);
    openTab();
    const big = new File(["x"], "big.png");
    Object.defineProperty(big, "size", { value: 300 * 1024 });
    await pickFile(big);
    expect(toast.error).toHaveBeenLastCalledWith(locales.custom.errors.tooBig);
    await pickFile(new File(["x"], "notes.txt"));
    expect(toast.error).toHaveBeenLastCalledWith(locales.custom.errors.type);
    expect(screen.queryByTestId("upload-draft")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's refusal as a translated toast and keeps the form", async () => {
    const { post } = await renderPicker([]);
    post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: "The library is full (200 icons)" },
      },
    });
    openTab();
    await pickFile(new File([SVG], "a.svg"));
    await screen.findByTestId("upload-draft");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: locales.custom.add }));
    });
    expect(toast.error).toHaveBeenCalledWith(locales.custom.errors.full);
    expect(screen.getByTestId("upload-draft")).toBeTruthy();
  });

  it("hides the upload controls without the upload permission", async () => {
    await renderPicker([pngRow], { permissions: [] });
    openTab();
    expect(screen.queryByTestId("upload-input")).toBeNull();
    expect(screen.queryByText(locales.custom.upload)).toBeNull();
    expect(screen.getByRole("button", { name: "Badge photo" })).toBeTruthy();
  });

  it("offers manage only for icons the user may change", async () => {
    await renderPicker([pngRow], { permissions: [] });
    openTab();
    expect(screen.queryByText(locales.custom.manage)).toBeNull();
  });

  it("renames an icon", async () => {
    const { patch } = await renderPicker([svgRow]);
    openTab();
    fireEvent.click(screen.getByText(locales.custom.manage));
    const input = screen.getByLabelText(
      locales.custom.renameLabel.replace("{{name}}", "Company logo"),
    );
    fireEvent.change(input, { target: { value: "ACME" } });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: locales.custom.rename.replace("{{name}}", "Company logo"),
        }),
      );
    });
    expect(patch).toHaveBeenCalledWith(`icons/${SVG_ID}`, { name: "ACME" });
    expect(toast.success).toHaveBeenCalledWith(locales.custom.renamed);
    expect(library.get().icons[0].name).toBe("ACME");
  });

  it("deletes an icon only after the user confirms", async () => {
    const { del } = await renderPicker([svgRow]);
    openTab();
    fireEvent.click(screen.getByText(locales.custom.manage));
    const ask = async () => {
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", {
            name: locales.custom.delete.replace("{{name}}", "Company logo"),
          }),
        );
      });
    };

    await ask();
    expect(
      screen.getByText(
        locales.custom.deleteTitle.replace("{{name}}", "Company logo"),
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(del).not.toHaveBeenCalled();
    expect(library.get().icons).toHaveLength(1);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull(),
    );

    await ask();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: locales.custom.deleteConfirm }),
      );
    });
    expect(del).toHaveBeenCalledWith(`icons/${SVG_ID}`);
    expect(library.get().icons).toHaveLength(0);
    expect(toast.success).toHaveBeenCalledWith(locales.custom.deleted);
  });
});
