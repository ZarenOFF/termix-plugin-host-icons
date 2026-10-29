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

  it("keeps mask ids distinct across separate roots, even for equal icons", () => {
    const a = render(<HostIcon icon={findIcon("text:plate:A")!} />);
    const b = render(<HostIcon icon={findIcon("text:plate:B")!} />);
    const same = render(<HostIcon icon={findIcon("text:plate:A")!} />);
    const id = (r: typeof a) => r.container.querySelector("mask")!.id;
    expect(id(a)).not.toBe(id(b));
    expect(id(a)).not.toBe(id(same));
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

describe("text icons in the picker", () => {
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

  const chip = (name: string) => screen.getByRole("button", { name });
  const textChip = () => chip(locales.picker.chips.text);
  const style = (name: "frame" | "plate" | "plain") =>
    screen.getByTestId(`text-style-${name}`);
  const search = () => screen.getByLabelText(locales.picker.search);
  const label = () => screen.getByLabelText(locales.picker.textLabel);

  it("opens on Text for a text value, with its label in the field", async () => {
    await mount("text:plate:K8");
    expect(textChip().getAttribute("aria-pressed")).toBe("true");
    expect((label() as HTMLInputElement).value).toBe("K8");
    // The search stays a search in Text; the label is its own field.
    expect((search() as HTMLInputElement).value).toBe("");
    expect(style("plate").getAttribute("aria-pressed")).toBe("true");
    expect(style("frame").getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the same search field in every chip", async () => {
    await mount("");
    for (const name of ["all", "icons", "brands", "text", "custom"] as const) {
      fireEvent.click(chip(locales.picker.chips[name]));
      const field = search() as HTMLInputElement;
      expect(field.placeholder).toBe(locales.picker.search);
      expect(
        field.closest("[data-host-icons-search]")!.querySelector("svg"),
      ).toBeTruthy();
    }
  });

  it("prefills an empty label from a search that fits when Text is chosen", async () => {
    const onChange = await mount("");
    fireEvent.change(search(), { target: { value: "db" } });
    fireEvent.click(textChip());
    expect((label() as HTMLInputElement).value).toBe("db");
    expect((search() as HTMLInputElement).value).toBe("db");
    // A prefill is not a choice.
    expect(onChange).not.toHaveBeenCalled();
    // A label already there is kept.
    fireEvent.change(label(), { target: { value: "K8" } });
    fireEvent.click(chip(locales.picker.chips.all));
    fireEvent.change(search(), { target: { value: "ab" } });
    fireEvent.click(textChip());
    expect((label() as HTMLInputElement).value).toBe("K8");
  });

  it("does not prefill from a search too long for a label", async () => {
    await mount("");
    fireEvent.change(search(), { target: { value: "servers" } });
    fireEvent.click(textChip());
    expect((label() as HTMLInputElement).value).toBe("");
  });

  it("has the same fixed list height in every chip", async () => {
    await mount("");
    const heights = (["all", "text", "custom", "brands"] as const).map(
      (name) => {
        fireEvent.click(chip(locales.picker.chips[name]));
        return screen.getByTestId("picker-list").style.height;
      },
    );
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBe("224px");
    expect(screen.getByTestId("picker-list").style.maxHeight).toBe("");
  });

  it("puts the label field inside the list, above the styles", async () => {
    await mount("");
    fireEvent.click(textChip());
    expect(screen.getByTestId("picker-list").contains(label())).toBe(true);
    expect(
      label().compareDocumentPosition(style("frame")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("takes the label from its own field once Text is chosen", async () => {
    const onChange = await mount("");
    fireEvent.click(textChip());
    expect((label() as HTMLInputElement).placeholder).toBe(
      locales.picker.textPlaceholder,
    );
    // Nothing to emit before there is a label.
    fireEvent.click(style("plain"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(label(), { target: { value: "DB" } });
    expect(onChange).toHaveBeenLastCalledWith("text:plain:DB");
    fireEvent.click(style("plate"));
    expect(onChange).toHaveBeenLastCalledWith("text:plate:DB");
    expect(style("plate").querySelector("svg")!.dataset.textIcon).toBe("plate");
    fireEvent.click(style("frame"));
    expect(onChange).toHaveBeenLastCalledWith("text:frame:DB");
  });

  it("shows the three styles with captions", async () => {
    await mount("");
    fireEvent.click(textChip());
    for (const name of ["frame", "plate", "plain"] as const)
      expect(style(name).textContent).toContain(locales.picker.textStyle[name]);
  });

  it("limits the label to four code points", async () => {
    const onChange = await mount("");
    fireEvent.click(textChip());
    fireEvent.change(label(), { target: { value: "ABCDEF" } });
    expect((label() as HTMLInputElement).value).toBe("ABCD");
    expect(onChange).toHaveBeenLastCalledWith("text:frame:ABCD");
  });

  it("emits nothing for an empty label", async () => {
    const onChange = await mount("text:frame:DB");
    fireEvent.change(label(), { target: { value: "" } });
    fireEvent.change(label(), { target: { value: "  " } });
    fireEvent.click(style("plain"));
    expect(onChange).not.toHaveBeenCalled();
    expect(style("plain").querySelector("svg")).toBeTruthy();
  });

  it("offers text tiles first in All for a query of 1 to 4 characters", async () => {
    const onChange = await mount("");
    fireEvent.change(search(), { target: { value: "ser" } });
    const heading = screen.getByText(
      locales.picker.textFor.replace("{{label}}", "ser"),
    );
    const list = screen.getByTestId("picker-list");
    // The text section comes before every icon section.
    expect(list.firstElementChild!.contains(heading)).toBe(true);
    const plate = screen.getByRole("button", {
      name: locales.picker.textTile
        .replace("{{style}}", locales.picker.textStyle.plate)
        .replace("{{label}}", "ser"),
    });
    fireEvent.click(plate);
    expect(onChange).toHaveBeenLastCalledWith("text:plate:ser");
    // The "No icon" tile is hidden while searching.
    expect(
      screen.queryByRole("button", { name: locales.picker.none }),
    ).toBeNull();

    fireEvent.change(search(), { target: { value: "servers" } });
    expect(screen.queryByText(/Text icon "/)).toBeNull();
  });

  it("offers text tiles in All but not in Icons or Brands", async () => {
    await mount("");
    fireEvent.change(search(), { target: { value: "db" } });
    fireEvent.click(chip(locales.picker.chips.icons));
    expect(screen.queryByText(/Text icon "/)).toBeNull();
    fireEvent.click(chip(locales.picker.chips.brands));
    expect(screen.queryByText(/Text icon "/)).toBeNull();
    fireEvent.click(chip(locales.picker.chips.all));
    expect(screen.getByText(/Text icon "db"/)).toBeTruthy();
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
