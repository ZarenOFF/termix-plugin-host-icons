import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { pathsOf } from "../../scripts/generate-brands.mjs";
import { BRAND_GROUPS, BRAND_ICONS } from "../../src/frontend/brands.generated";

describe("generated brand icons", () => {
  // The module is written by `npm run brands` from scripts/brands.mjs and the
  // simple-icons and @tabler/icons packages. Fails after editing the list or
  // bumping a pack without regenerating.
  it("are up to date with the list and the icon packs", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["scripts/generate-brands.mjs", "--check"],
        { stdio: "pipe" },
      ),
    ).not.toThrow();
  });

  it("have unique brand ids, titles, known groups and path data", () => {
    const ids = BRAND_ICONS.map((icon) => icon.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const icon of BRAND_ICONS) {
      expect(icon.id).toMatch(/^brand(-[a-z0-9]+)+$/);
      expect(icon.title.trim()).not.toBe("");
      expect(BRAND_GROUPS).toContain(icon.group);
      expect(icon.d).toMatch(/^[Mm]/);
    }
    for (const group of BRAND_GROUPS) {
      expect(
        BRAND_ICONS.some((icon) => icon.group === group),
        group,
      ).toBe(true);
    }
  });

  // Ids are stored in host settings. This pins a few so a rename in the list
  // shows up as a failing test.
  it("keep the ids that have shipped", () => {
    const ids = new Set(BRAND_ICONS.map((icon) => icon.id));
    for (const id of [
      "brand-ubuntu",
      "brand-windows",
      "brand-kubernetes",
      "brand-nodejs",
      "brand-aws",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});

describe("brand generator guard", () => {
  const svg = (...tags: string[]) =>
    `<svg xmlns="http://www.w3.org/2000/svg" fill="none">${tags.join("")}</svg>`;
  const box = '<path stroke="none" d="M0 0h24v24H0z" fill="none" />';

  it("reads the paths of a plain icon and drops Tabler's box", () => {
    expect(
      pathsOf(svg(box, '<path d="M1 1h2" />', '<path d="M3 3h2" />'), "x"),
    ).toEqual(["M1 1h2", "M3 3h2"]);
  });

  it.each(["fill", "stroke", "fill-rule", "clip-rule", "style", "opacity"])(
    "refuses a path with its own %s",
    (attribute) => {
      const tag = `<path d="M1 1h2" ${attribute}="x" />`;
      expect(() =>
        pathsOf(svg('<path d="M0 0h1" />', tag), "icon.svg"),
      ).toThrow(new RegExp(`own ${attribute}`));
    },
  );

  it("refuses shapes other than a path", () => {
    expect(() => pathsOf(svg('<circle cx="1" />'), "x")).toThrow();
  });
});
