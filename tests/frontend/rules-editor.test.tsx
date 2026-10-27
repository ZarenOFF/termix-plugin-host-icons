import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import { useState } from "react";
import * as plugin from "../../src/frontend/index";
import {
  RULES_FIELD_COMPONENT,
  RulesField,
  collectTags,
  filterTags,
  reorder,
} from "../../src/frontend/rules-editor";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

// jsdom lacks what Radix's Select reaches for when it opens.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

const prod = {
  match: "tag",
  value: "prod",
  icon: "database",
  color: "",
  override: false,
};
const web = {
  match: "name",
  value: "web",
  icon: "cloud",
  color: "#ff0000",
  override: false,
};
const db = { ...prod, value: "db" };

const hosts = [
  { id: 1, name: "a", tags: ["prod", "Web", "db"] },
  { id: 2, name: "b", tags: ["PROD", "staging", " "] },
  { id: 3, name: "c" },
];

async function renderEditor(
  rules: unknown,
  running = true,
  withHosts: Array<Record<string, unknown>> = [],
) {
  rendered = await renderWithApp(plugin, {
    manifest,
    locales,
    hosts: withHosts,
  });
  const setValue = vi.fn();
  rendered.renderSettingsComponent(RULES_FIELD_COMPONENT, {
    pluginId: manifest.id,
    values: { rules },
    setValue,
    running,
  });
  return setValue;
}

const label = (key: string, n: number) =>
  locales.rules[key as keyof typeof locales.rules]
    .toString()
    .replace("{{n}}", String(n));

const rowOf = (n: number) =>
  screen
    .getAllByRole("listitem")
    .filter((item) => item.hasAttribute("data-rule-row"))[n - 1]!;
// jsdom has no DragEvent, so a plain event gets its clientY by hand. The row
// has no size there, so a clientY of 1 is its lower half and -1 its upper.
function dragOver(row: HTMLElement, clientY: number) {
  const event = createEvent.dragOver(row);
  Object.defineProperty(event, "clientY", { value: clientY });
  fireEvent(row, event);
}
const handle = (n: number) => screen.getByLabelText(label("handleLabel", n));

describe("manifest rules setting", () => {
  it("is a custom user setting that holds a list", () => {
    const field = manifest.contributes?.settings?.user?.find(
      (item) => item.key === "rules",
    );
    expect(field?.type).toBe("custom");
    expect(field?.component).toBe(RULES_FIELD_COMPONENT);
    expect(field?.default).toEqual([]);
  });
});

describe("rule list helpers", () => {
  it("collects tags once, ignoring case and blanks, sorted", () => {
    expect(collectTags(hosts)).toEqual(["db", "prod", "staging", "Web"]);
    expect(collectTags([{ tags: null }, {}])).toEqual([]);
  });

  it("filters tags by what is typed", () => {
    const tags = ["db", "prod", "staging"];
    expect(filterTags(tags, "")).toEqual(tags);
    expect(filterTags(tags, " ST ")).toEqual(["staging"]);
    expect(filterTags(tags, "zzz")).toEqual([]);
    expect(filterTags(tags, "PROD")).toEqual([]);
    expect(filterTags(["prod", "prod-eu"], "prod")).toEqual([
      "prod",
      "prod-eu",
    ]);
  });

  it("reorders into a gap", () => {
    expect(reorder([1, 2, 3], 0, 2)).toEqual([2, 1, 3]);
    expect(reorder([1, 2, 3], 0, 3)).toEqual([2, 3, 1]);
    expect(reorder([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    const same = [1, 2, 3];
    expect(reorder(same, 1, 1)).toBe(same);
    expect(reorder(same, 1, 2)).toBe(same);
  });
});

describe("rules editor", () => {
  it("shows an empty state and adds a blank rule", async () => {
    const setValue = await renderEditor([]);
    expect(screen.getByText(locales.rules.empty)).toBeTruthy();
    expect(screen.queryByText(locales.rules.colMatch)).toBeNull();
    fireEvent.click(screen.getByText(locales.rules.add));
    expect(setValue).toHaveBeenCalledWith("rules", [
      { match: "tag", value: "", icon: "", color: "", override: false },
    ]);
  });

  it("treats stored junk as no rules", async () => {
    await renderEditor("oops");
    expect(screen.getByText(locales.rules.empty)).toBeTruthy();
  });

  it("draws a header row, and no hint about unfinished rules", async () => {
    await renderEditor([prod, { ...web, value: "" }]);
    for (const key of [
      "colMatch",
      "colText",
      "colIcon",
      "colColor",
      "colPriority",
    ] as const) {
      expect(screen.getByText(locales.rules[key])).toBeTruthy();
    }
    expect(Object.keys(locales.rules)).not.toContain("incomplete");
  });

  it("explains priority in a tooltip on the header", async () => {
    await renderEditor([prod]);
    fireEvent.focus(screen.getByText(locales.rules.colPriority));
    expect(
      (await screen.findAllByText(locales.rules.priorityTip)).length,
    ).toBeGreaterThan(0);
  });

  it("edits the value of a rule", async () => {
    const setValue = await renderEditor([prod, web]);
    fireEvent.change(screen.getByLabelText(label("valueLabel", 2)), {
      target: { value: "db" },
    });
    expect(setValue).toHaveBeenCalledWith("rules", [
      prod,
      { ...web, value: "db" },
    ]);
  });

  it("switches what a rule matches with a select", async () => {
    const setValue = await renderEditor([prod]);
    const trigger = screen.getByLabelText(label("matchLabel", 1));
    expect(trigger.textContent).toContain(locales.rules.matchTag);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(
      await screen.findByRole("option", { name: locales.rules.matchName }),
    );
    expect(setValue).toHaveBeenCalledWith("rules", [
      { ...prod, match: "name" },
    ]);
  });

  it("picks an icon for a rule", async () => {
    const setValue = await renderEditor([{ ...prod, icon: "" }]);
    fireEvent.click(screen.getByLabelText(label("iconLabel", 1)));
    fireEvent.click(await screen.findByLabelText(locales.icons.cloud));
    expect(setValue).toHaveBeenCalledWith("rules", [
      { ...prod, icon: "cloud" },
    ]);
  });

  it("calls the first tile of a rule's picker the host's own icon", async () => {
    const setValue = await renderEditor([prod]);
    fireEvent.click(screen.getByLabelText(label("iconLabel", 1)));
    const tile = await screen.findByText(locales.rules.hostOwnIcon);
    expect(screen.queryByText(locales.picker.none)).toBeNull();
    fireEvent.click(tile);
    expect(setValue).toHaveBeenCalledWith("rules", [{ ...prod, icon: "" }]);
  });

  it("shows a color-only rule as a dashed empty tile with a tooltip", async () => {
    await renderEditor([prod, { ...prod, icon: "", color: "#00ff00" }]);
    const full = screen.getByLabelText(label("iconLabel", 1));
    const empty = screen.getByLabelText(label("iconLabel", 2));
    expect(full.className).not.toContain("border-dashed");
    expect(empty.className).toContain("border-dashed");
    expect(empty.textContent).toBe("");
    fireEvent.focus(empty);
    expect(
      (await screen.findAllByText(locales.rules.noIconTip)).length,
    ).toBeGreaterThan(0);
  });

  it("turns priority over the host's icon on and off", async () => {
    const setValue = await renderEditor([prod, { ...web, override: true }]);
    fireEvent.click(screen.getByLabelText(label("overrideLabel", 1)));
    expect(setValue).toHaveBeenLastCalledWith("rules", [
      { ...prod, override: true },
      { ...web, override: true },
    ]);
    fireEvent.click(screen.getByLabelText(label("overrideLabel", 2)));
    expect(setValue).toHaveBeenLastCalledWith("rules", [
      prod,
      { ...web, override: false },
    ]);
  });

  it("deletes a rule with a button that draws an icon", async () => {
    const setValue = await renderEditor([prod, web]);
    const button = screen.getByLabelText(label("delete", 1));
    expect(button.querySelector("svg")).not.toBeNull();
    fireEvent.click(button);
    expect(setValue).toHaveBeenCalledWith("rules", [web]);
  });

  it("has no up and down buttons", async () => {
    await renderEditor([prod, web]);
    expect(screen.queryByLabelText(/Move rule/)).toBeNull();
  });

  describe("reordering", () => {
    const three = [prod, web, db];

    it("drags a rule below another", async () => {
      const setValue = await renderEditor(three);
      fireEvent.dragStart(handle(1));
      dragOver(rowOf(2), 1);
      fireEvent.drop(rowOf(2));
      expect(setValue).toHaveBeenCalledWith("rules", [web, prod, db]);
    });

    it("drags a rule above another", async () => {
      const setValue = await renderEditor(three);
      fireEvent.dragStart(handle(3));
      dragOver(rowOf(1), -1);
      fireEvent.drop(rowOf(1));
      expect(setValue).toHaveBeenCalledWith("rules", [db, prod, web]);
    });

    it("drags a rule to the end", async () => {
      const setValue = await renderEditor(three);
      fireEvent.dragStart(handle(1));
      dragOver(rowOf(3), 1);
      fireEvent.drop(rowOf(3));
      expect(setValue).toHaveBeenCalledWith("rules", [web, db, prod]);
    });

    it("shows a drop line where the rule would land, until the drag ends", async () => {
      await renderEditor(three);
      expect(document.querySelector("[data-drop-indicator]")).toBeNull();
      fireEvent.dragStart(handle(1));
      dragOver(rowOf(3), -1);
      expect(rowOf(3).querySelector("[data-drop-indicator]")).not.toBeNull();
      expect(document.querySelectorAll("[data-drop-indicator]")).toHaveLength(
        1,
      );
      fireEvent.dragEnd(handle(1));
      expect(document.querySelector("[data-drop-indicator]")).toBeNull();
    });

    it("draws no line and writes nothing for a drop where the rule already is", async () => {
      const setValue = await renderEditor(three);
      fireEvent.dragStart(handle(2));
      dragOver(rowOf(2), 1);
      expect(document.querySelector("[data-drop-indicator]")).toBeNull();
      fireEvent.drop(rowOf(2));
      expect(setValue).not.toHaveBeenCalled();
    });

    it("ignores a drop when no handle was dragged", async () => {
      const setValue = await renderEditor(three);
      dragOver(rowOf(2), 1);
      fireEvent.drop(rowOf(2));
      expect(setValue).not.toHaveBeenCalled();
    });

    it("moves a rule with Alt and the arrow keys on its handle", async () => {
      const setValue = await renderEditor(three);
      fireEvent.keyDown(handle(2), { key: "ArrowUp", altKey: true });
      expect(setValue).toHaveBeenLastCalledWith("rules", [web, prod, db]);
      fireEvent.keyDown(handle(2), { key: "ArrowDown", altKey: true });
      expect(setValue).toHaveBeenLastCalledWith("rules", [prod, db, web]);
    });

    it("does not move on a bare arrow key or past either end", async () => {
      const setValue = await renderEditor(three);
      fireEvent.keyDown(handle(2), { key: "ArrowUp" });
      fireEvent.keyDown(handle(1), { key: "ArrowUp", altKey: true });
      fireEvent.keyDown(handle(3), { key: "ArrowDown", altKey: true });
      expect(setValue).not.toHaveBeenCalled();
    });

    it("explains the keys in the handle's label", async () => {
      await renderEditor(three);
      expect(handle(1).getAttribute("aria-label")).toContain("Alt");
    });
  });

  describe("tag suggestions", () => {
    const empty = { ...prod, value: "" };
    const input = (n = 1) => screen.getByLabelText(label("valueLabel", n));
    const options = () =>
      screen.queryAllByRole("option").map((option) => option.textContent);

    it("lists the tags of the hosts once, sorted, ignoring case", async () => {
      await renderEditor([empty], true, hosts);
      fireEvent.focus(input());
      await screen.findByRole("listbox");
      expect(options()).toEqual(["db", "prod", "staging", "Web"]);
    });

    it("narrows the list by what is typed", async () => {
      await renderEditor([{ ...empty, value: "st" }], true, hosts);
      fireEvent.focus(input());
      await screen.findByRole("listbox");
      expect(options()).toEqual(["staging"]);
    });

    it("picks a tag by click", async () => {
      const setValue = await renderEditor([empty], true, hosts);
      fireEvent.focus(input());
      fireEvent.click(await screen.findByRole("option", { name: "staging" }));
      expect(setValue).toHaveBeenCalledWith("rules", [
        { ...empty, value: "staging" },
      ]);
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("picks a tag with the arrow keys and Enter", async () => {
      const setValue = await renderEditor([empty], true, hosts);
      fireEvent.focus(input());
      await screen.findByRole("listbox");
      const selected = () =>
        screen.getByRole("option", { selected: true }).textContent;
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      expect(selected()).toBe("prod");
      fireEvent.keyDown(input(), { key: "ArrowUp" });
      expect(selected()).toBe("db");
      fireEvent.keyDown(input(), { key: "ArrowUp" });
      expect(selected()).toBe("Web");
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(setValue).toHaveBeenCalledWith("rules", [
        { ...empty, value: "prod" },
      ]);
    });

    it("closes the list on Escape", async () => {
      await renderEditor([empty], true, hosts);
      fireEvent.focus(input());
      await screen.findByRole("listbox");
      fireEvent.keyDown(input(), { key: "Escape" });
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("does not pick anything on Enter when no tag is highlighted", async () => {
      const setValue = await renderEditor([empty], true, hosts);
      fireEvent.focus(input());
      await screen.findByRole("listbox");
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(setValue).not.toHaveBeenCalled();
    });

    it("keeps tags that other rules already use", async () => {
      await renderEditor([prod, empty], true, hosts);
      fireEvent.focus(input(2));
      await screen.findByRole("listbox");
      expect(options()).toContain("prod");
    });

    it("suggests nothing for a rule that matches names", async () => {
      await renderEditor([{ ...empty, match: "name" }], true, hosts);
      fireEvent.focus(input());
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(input().getAttribute("role")).toBeNull();
    });

    it("suggests nothing when no host has a tag", async () => {
      await renderEditor([empty], true, [hosts[2]!]);
      fireEvent.focus(input());
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("suggests nothing once the whole tag is typed", async () => {
      await renderEditor([{ ...empty, value: "staging" }], true, hosts);
      fireEvent.focus(input());
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("suggests nothing while the plugin is not running", async () => {
      await renderEditor([empty], false, hosts);
      fireEvent.focus(input());
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("is read only while the plugin is not running", async () => {
    await renderEditor([prod], false);
    for (const control of [
      screen.getByText(locales.rules.add),
      screen.getByLabelText(label("delete", 1)),
      screen.getByLabelText(label("handleLabel", 1)),
      screen.getByLabelText(label("overrideLabel", 1)),
      screen.getByLabelText(label("matchLabel", 1)),
      screen.getByLabelText(label("valueLabel", 1)),
    ]) {
      expect(
        (control as HTMLButtonElement).disabled ||
          control.getAttribute("data-disabled") !== null,
      ).toBe(true);
    }
  });

  it("keeps a half-typed color when another field changes", async () => {
    const setValue = await renderEditor([{ ...prod, color: "#12" }]);
    fireEvent.click(screen.getByLabelText(label("overrideLabel", 1)));
    expect(setValue).toHaveBeenCalledWith("rules", [
      { ...prod, color: "#12", override: true },
    ]);
  });
});

describe("rows keep their own state", () => {
  const typed = (value: string) => ({ ...prod, value });
  const pr = typed("pr");
  const input = (n: number) => screen.getByLabelText(label("valueLabel", n));
  const open = (n: number) => input(n).getAttribute("aria-expanded");

  // The editor with a real list behind it, so rows really move and go.
  async function mount(initial: unknown[]) {
    let replace: (next: unknown[]) => void = () => {};
    function Harness() {
      const [rules, set] = useState(initial);
      replace = set;
      return (
        <RulesField
          pluginId={manifest.id}
          values={{ rules }}
          setValue={(_, next) => set(next as unknown[])}
          running
        />
      );
    }
    rendered = await renderWithApp(
      {
        activate: (app) => {
          app.registerSettingsComponent("harness", Harness);
        },
      },
      { manifest, locales, hosts: [{ id: 1, name: "a", tags: ["prod"] }] },
    );
    rendered.renderSettingsComponent("harness", {});
    return (next: unknown[]) => act(() => replace(next));
  }

  it("keeps an open suggestion list with its rule when another is deleted", async () => {
    await mount([typed("a"), typed("b"), pr]);
    fireEvent.focus(input(3));
    await screen.findByRole("listbox");
    fireEvent.click(screen.getByLabelText(label("delete", 1)));
    expect((input(2) as HTMLInputElement).value).toBe("pr");
    expect(open(2)).toBe("true");
    expect(open(1)).not.toBe("true");
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
  });

  it("moves a row's element with its rule on a keyboard move", async () => {
    // Moving takes the focus to the handle, which closes a popover, so what
    // shows the row followed its rule is that it is the same element.
    await mount([pr, typed("b"), typed("c")]);
    const first = rowOf(1);
    fireEvent.keyDown(handle(1), { key: "ArrowDown", altKey: true });
    expect(rowOf(2)).toBe(first);
    expect((input(2) as HTMLInputElement).value).toBe("pr");
  });

  it("keeps an open color popover with its rule after a drop", async () => {
    await mount([typed("a"), typed("b"), typed("c")]);
    fireEvent.click(screen.getByLabelText(label("colorLabel", 1)));
    await screen.findByText(locales.picker.themeColor);
    const data = { effectAllowed: "", setData: () => {} };
    fireEvent.dragStart(handle(1), { dataTransfer: data });
    dragOver(rowOf(3), 1);
    fireEvent.drop(rowOf(3));
    expect((input(3) as HTMLInputElement).value).toBe("a");
    expect(
      screen
        .getByLabelText(label("colorLabel", 3))
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getAllByText(locales.picker.themeColor)).toHaveLength(1);
  });

  it("keeps an open rule when the stored list changes from outside", async () => {
    const replace = await mount([pr, typed("b")]);
    fireEvent.focus(input(1));
    await screen.findByRole("listbox");
    replace([pr, typed("b"), typed("c")]);
    expect(open(1)).toBe("true");
    replace([pr]);
    expect(open(1)).toBe("true");
  });
});
