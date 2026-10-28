import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import { hostBadgesFor, useHostBadges } from "@termix-ssh/plugin-sdk/ui";
import * as plugin from "../../src/frontend/index";
import { HostIcon } from "../../src/frontend/HostIcon";
import { IconPicker } from "../../src/frontend/IconPicker";
import {
  findIcon,
  iconLabel,
  isTextIcon,
  parseTextIcon,
  resolveHostIcon,
  textIconId,
} from "../../src/frontend/icons";
import { activeRules } from "../../src/frontend/rules";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const userSettings: { values: Record<string, unknown> } = { values: {} };
vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSettings: () => ({ ...userSettings, loaded: true, save: vi.fn() }),
}));

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

beforeEach(() => {
  userSettings.values = {};
});

afterEach(async () => {
  cleanup();
  await rendered?.deactivate();
  rendered = null;
});

describe("text icon ids", () => {
  it("parses a valid id", () => {
    expect(parseTextIcon("text:frame:DB")).toEqual({
      id: "text:frame:DB",
      text: "DB",
      style: "frame",
    });
    expect(findIcon("text:plate:K8")).toMatchObject({ text: "K8" });
    expect(isTextIcon(findIcon("text:plain:01")!)).toBe(true);
    expect(isTextIcon(findIcon("server")!)).toBe(false);
  });

  it("trims the label and counts code points", () => {
    expect(parseTextIcon("text:frame:  DB ")?.id).toBe("text:frame:DB");
    const four = "\u{1F600}".repeat(4);
    expect(parseTextIcon(`text:plain:${four}`)?.text).toBe(four);
    expect(parseTextIcon(`text:plain:${four}\u{1F600}`)).toBeUndefined();
    expect(parseTextIcon("text:plain:Ёж")?.text).toBe("Ёж");
  });

  it("keeps a colon in the label", () => {
    expect(parseTextIcon("text:frame:A:B")).toMatchObject({
      text: "A:B",
      style: "frame",
    });
    expect(parseTextIcon("text:frame::")?.text).toBe(":");
  });

  it("rejects what is not strictly valid", () => {
    for (const id of [
      "text:",
      "text:frame",
      "text:frame:",
      "text:frame:   ",
      "text:round:DB",
      "text::DB",
      "text:frame:ABCDE",
      "Text:frame:DB",
    ]) {
      expect(findIcon(id), id).toBeUndefined();
    }
  });

  it("builds an id, or null when there is no valid label", () => {
    expect(textIconId("plate", " 01 ")).toBe("text:plate:01");
    expect(textIconId("plate", "")).toBeNull();
    expect(textIconId("plate", "  ")).toBeNull();
    expect(textIconId("plate", "12345")).toBeNull();
    expect(textIconId("nope" as never, "A")).toBeNull();
  });

  it("falls back for an invalid id, as for any unknown one", () => {
    expect(resolveHostIcon({ icon: "text:round:DB" })).toMatchObject({
      known: false,
    });
    expect(
      resolveHostIcon({ icon: "text:frame:DB", color: "#ff0000" }),
    ).toEqual({
      icon: parseTextIcon("text:frame:DB"),
      color: "#ff0000",
      known: true,
    });
  });

  it("is labelled with its text", () => {
    expect(iconLabel(findIcon("text:frame:DB")!, (key) => key)).toBe("DB");
  });
});

describe("drawing text icons", () => {
  const draw = (id: string, color?: string) =>
    render(
      <HostIcon icon={findIcon(id)!} color={color} className="size-4" />,
    ).container.querySelector("svg")!;

  it("draws a frame as an outline with the text", () => {
    const svg = draw("text:frame:DB", "#ef4444");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("class")).toBe("size-4");
    expect(svg.style.color).toBe("rgb(239, 68, 68)");
    expect(svg.dataset.textIcon).toBe("frame");
    const box = svg.querySelector("rect")!;
    expect(box.getAttribute("fill")).toBe("none");
    expect(box.getAttribute("stroke")).toBe("currentColor");
    expect(svg.querySelector("text")!.textContent).toBe("DB");
    expect(svg.querySelector("mask")).toBeNull();
  });

  it("draws a plate with the text knocked out by a mask", () => {
    const svg = draw("text:plate:K8");
    const mask = svg.querySelector("mask")!;
    expect(mask.querySelector("text")!.textContent).toBe("K8");
    expect(mask.querySelector("text")!.getAttribute("fill")).toBe("#000");
    const plate = svg.querySelector(":scope > rect")!;
    expect(plate.getAttribute("fill")).toBe("currentColor");
    expect(plate.getAttribute("mask")).toBe(`url(#${mask.id})`);
    // Only the masked copy of the text exists.
    expect(svg.querySelectorAll("text")).toHaveLength(1);
  });

  it("gives each plate its own mask id", () => {
    const { container } = render(
      <>
        <HostIcon icon={findIcon("text:plate:A")!} />
        <HostIcon icon={findIcon("text:plate:B")!} />
      </>,
    );
    const ids = [...container.querySelectorAll("mask")].map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("keeps mask ids distinct across separate roots", () => {
    const a = render(<HostIcon icon={findIcon("text:plate:A")!} />);
    const b = render(<HostIcon icon={findIcon("text:plate:B")!} />);
    const same = render(<HostIcon icon={findIcon("text:plate:A")!} />);
    const id = (r: typeof a) => r.container.querySelector("mask")!.id;
    expect(id(a)).not.toBe(id(b));
    expect(id(a)).toBe(id(same));
  });

  it("squeezes wide labels into the box and leaves short ones alone", () => {
    const text = (id: string) => draw(id).querySelector("text")!;
    for (const id of ["text:frame:WWW", "text:plate:MMMM", "text:plain:ЖЖЖЖ"]) {
      expect(text(id).getAttribute("lengthAdjust"), id).toBe(
        "spacingAndGlyphs",
      );
      expect(Number(text(id).getAttribute("textLength"))).toBeLessThanOrEqual(
        22,
      );
    }
    expect(text("text:frame:DB").getAttribute("textLength")).toBeNull();
    expect(text("text:frame:i").getAttribute("textLength")).toBeNull();
  });

  it("draws plain text without a box", () => {
    const svg = draw("text:plain:01");
    expect(svg.querySelector("rect")).toBeNull();
    expect(svg.querySelector("text")!.getAttribute("fill")).toBe(
      "currentColor",
    );
  });

  it("uses a smaller font for longer labels", () => {
    const size = (id: string) =>
      Number(draw(id).querySelector("text")!.getAttribute("font-size"));
    expect(size("text:frame:A")).toBeGreaterThan(size("text:frame:AB"));
    expect(size("text:frame:AB")).toBeGreaterThan(size("text:frame:ABC"));
    expect(size("text:frame:ABC")).toBeGreaterThan(size("text:frame:ABCD"));
  });
});

describe("text tab of the picker", () => {
  const radio = (name: string) => screen.getByRole("radio", { name });

  async function mount(value: string, onChange = vi.fn()) {
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

  const input = () => screen.getByLabelText(locales.picker.textLabel);

  it("opens on a text value, prefilled, without the search box", async () => {
    await mount("text:plate:K8");
    expect(radio(locales.picker.packText).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect((input() as HTMLInputElement).value).toBe("K8");
    expect(
      radio(locales.picker.textStyle.plate).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.queryByLabelText(locales.picker.search)).toBeNull();
  });

  it("emits an id as the label and style change", async () => {
    const onChange = await mount("");
    fireEvent.click(radio(locales.picker.packText));
    expect(screen.queryByLabelText(locales.picker.search)).toBeNull();
    fireEvent.change(input(), { target: { value: "DB" } });
    expect(onChange).toHaveBeenLastCalledWith("text:frame:DB");
    fireEvent.click(radio(locales.picker.textStyle.plain));
    expect(onChange).toHaveBeenLastCalledWith("text:plain:DB");
    fireEvent.click(radio(locales.picker.textStyle.plate));
    expect(onChange).toHaveBeenLastCalledWith("text:plate:DB");
    expect(
      screen.getByTestId("text-icon-preview").querySelector("svg")!.dataset
        .textIcon,
    ).toBe("plate");
  });

  it("limits the label to four code points", async () => {
    const onChange = await mount("");
    fireEvent.click(radio(locales.picker.packText));
    fireEvent.change(input(), { target: { value: "ABCDEF" } });
    expect((input() as HTMLInputElement).value).toBe("ABCD");
    expect(onChange).toHaveBeenLastCalledWith("text:frame:ABCD");
  });

  it("emits nothing for an empty label", async () => {
    const onChange = await mount("text:frame:DB");
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.change(input(), { target: { value: "  " } });
    fireEvent.click(radio(locales.picker.textStyle.plain));
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("text-icon-preview").querySelector("svg"),
    ).toBeNull();
  });
});

describe("rule with a text icon", () => {
  it("is active, and draws on a badge", async () => {
    const rule = {
      match: "tag" as const,
      value: "prod",
      icon: "text:plate:DB",
      color: "#00ff00",
      override: false,
    };
    expect(activeRules([rule])).toHaveLength(1);
    expect(activeRules([{ ...rule, icon: "text:plate:" }])).toHaveLength(0);

    const host = {
      id: "1",
      name: "db-1",
      ip: "10.0.0.1",
      port: 22,
      tags: ["prod"],
      pluginSettings: {},
    };
    userSettings.values = { rules: [rule] };
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      hosts: [host],
    });
    rendered.renderSlot("shell.overlay");
    function Row() {
      const badges = hostBadgesFor(useHostBadges(), host as never);
      return (
        <div data-testid="row">
          {badges.map((badge) => {
            const Badge = badge.component;
            return <Badge key={badge.id} host={host as never} />;
          })}
        </div>
      );
    }
    render(<Row />);
    await act(async () => {});
    const badge = screen
      .getByTestId("row")
      .querySelector<HTMLElement>("[data-testid=host-icon-badge]")!;
    expect(badge.dataset.hostIconSource).toBe("rule");
    expect(badge.getAttribute("aria-label")).toBe("DB");
    expect(badge.querySelector("svg")!.dataset.textIcon).toBe("plate");
    expect(badge.querySelector("svg")!.style.color).toBe("rgb(0, 255, 0)");
  });
});
