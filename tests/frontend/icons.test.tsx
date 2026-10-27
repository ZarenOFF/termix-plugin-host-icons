import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HostIcon } from "../../src/frontend/HostIcon";
import {
  BRAND_ICONS,
  FALLBACK_ICON_ID,
  HOST_ICONS,
  ICON_GROUPS,
  findIcon,
  iconLabel,
  isBrandIcon,
  normalizeColor,
  resolveHostIcon,
  resolveIconForHost,
  searchBrands,
  searchIcons,
} from "../../src/frontend/icons";

afterEach(cleanup);

describe("icon catalog", () => {
  it("has unique ids and known groups", () => {
    const ids = HOST_ICONS.map((icon) => icon.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const icon of HOST_ICONS) {
      expect(ICON_GROUPS).toContain(icon.group);
      expect(icon.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("covers the icons people ask for first", () => {
    for (const id of [
      "server",
      "database",
      "router",
      "cloud",
      "container",
      "monitor",
      "shield",
    ]) {
      expect(findIcon(id), id).toBeDefined();
    }
    expect(findIcon(FALLBACK_ICON_ID)).toBeDefined();
  });

  // PluginIcon draws a puzzle piece for a name Lucide does not have, so this
  // catches a typo or an icon that the Lucide copy in Termix lacks.
  it.each(HOST_ICONS.map((icon) => [icon.id, icon] as const))(
    "%s is a real Lucide icon",
    (_id, icon) => {
      const { container } = render(<HostIcon icon={icon} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("class")).not.toContain("lucide-puzzle");
    },
  );

  it("draws the icon in the chosen color", () => {
    const { container } = render(
      <HostIcon icon={findIcon("database")!} color="#ef4444" />,
    );
    expect(container.querySelector("svg")!.getAttribute("style")).toContain(
      "color",
    );
  });
});

describe("brand icons", () => {
  it("resolve by their stored id, apart from the Lucide set", () => {
    const ids = new Set(HOST_ICONS.map((icon) => icon.id));
    for (const brand of BRAND_ICONS) {
      expect(ids.has(brand.id), brand.id).toBe(false);
      expect(findIcon(brand.id), brand.id).toBe(brand);
      expect(isBrandIcon(brand)).toBe(true);
    }
    expect(isBrandIcon(findIcon("server")!)).toBe(false);
  });

  it.each(BRAND_ICONS.map((icon) => [icon.id, icon] as const))(
    "%s draws an svg tinted by the color",
    (_id, icon) => {
      const { container } = render(<HostIcon icon={icon} color="#ef4444" />);
      const svg = container.querySelector("svg")!;
      expect(svg).not.toBeNull();
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("style")).toContain("color");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      const shape = svg.querySelector("path")!;
      expect(shape.getAttribute("d")).toBe(icon.d);
      // Both modes follow currentColor, so the color setting tints them.
      expect(svg.getAttribute(icon.stroke ? "stroke" : "fill")).toBe(
        "currentColor",
      );
    },
  );

  it("take their size from the class name, like Lucide icons", () => {
    const { container } = render(
      <HostIcon icon={findIcon("brand-ubuntu")!} className="size-4" />,
    );
    expect(container.querySelector("svg")!.getAttribute("class")).toBe(
      "size-4",
    );
    expect(container.querySelector("svg")!.getAttribute("style")).toBeNull();
  });

  it("draw Tabler outlines as strokes and Simple Icons as fills", () => {
    const aws = render(<HostIcon icon={findIcon("brand-aws")!} />).container;
    expect(aws.querySelector("svg")!.getAttribute("fill")).toBe("none");
    expect(aws.querySelector("svg")!.getAttribute("stroke-width")).toBe("2");
    const ubuntu = render(
      <HostIcon icon={findIcon("brand-ubuntu")!} />,
    ).container;
    expect(ubuntu.querySelector("svg")!.getAttribute("fill")).toBe(
      "currentColor",
    );
    expect(ubuntu.querySelector("svg")!.hasAttribute("stroke")).toBe(false);
  });

  it("resolve from host settings with their color", () => {
    expect(resolveHostIcon({ icon: "brand-debian", color: "#A81D33" })).toEqual(
      {
        icon: findIcon("brand-debian"),
        color: "#a81d33",
        known: true,
      },
    );
  });

  it("are labeled with the brand name, not a translation", () => {
    const t = () => "translated";
    expect(iconLabel(findIcon("brand-windows")!, t)).toBe("Windows");
    expect(iconLabel(findIcon("server")!, t)).toBe("translated");
  });

  it("fall back like any id this version does not know", () => {
    expect(findIcon("brand-no-such-logo")).toBeUndefined();
    expect(resolveHostIcon({ icon: "brand-no-such-logo" })).toMatchObject({
      icon: findIcon(FALLBACK_ICON_ID),
      known: false,
    });
  });
});

describe("normalizeColor", () => {
  it("accepts six and three digit hex colors", () => {
    expect(normalizeColor("#3B82F6")).toBe("#3b82f6");
    expect(normalizeColor(" #abc ")).toBe("#aabbcc");
  });

  it("treats anything else as the theme color", () => {
    for (const value of [
      undefined,
      null,
      "",
      "red",
      "#12",
      "#1234567",
      "url(x)",
      42,
    ]) {
      expect(normalizeColor(value)).toBeNull();
    }
  });
});

describe("resolveHostIcon", () => {
  it("has no icon when nothing is set", () => {
    expect(resolveHostIcon(undefined)).toBeNull();
    expect(resolveHostIcon({})).toBeNull();
    expect(resolveHostIcon({ icon: "" })).toBeNull();
    expect(resolveHostIcon({ icon: "   " })).toBeNull();
    expect(resolveHostIcon({ icon: 7 })).toBeNull();
    expect(resolveHostIcon("server")).toBeNull();
  });

  it("reads a known icon and its color", () => {
    expect(resolveHostIcon({ icon: "router", color: "#22C55E" })).toEqual({
      icon: findIcon("router"),
      color: "#22c55e",
      known: true,
    });
  });

  it("uses the theme color when the color is missing or invalid", () => {
    expect(resolveHostIcon({ icon: "cloud" })?.color).toBeNull();
    expect(resolveHostIcon({ icon: "cloud", color: "blue" })?.color).toBeNull();
  });

  it("falls back for an unknown icon and keeps its color", () => {
    expect(resolveHostIcon({ icon: "no-such-icon", color: "#000000" })).toEqual(
      { icon: findIcon(FALLBACK_ICON_ID), color: "#000000", known: false },
    );
  });

  it("reads only this plugin's settings from a host", () => {
    expect(
      resolveIconForHost({
        pluginSettings: { "host-icons": { icon: "shield" } },
      })?.icon.id,
    ).toBe("shield");
    expect(
      resolveIconForHost({ pluginSettings: { other: { icon: "shield" } } }),
    ).toBeNull();
    expect(resolveIconForHost({})).toBeNull();
  });
});

describe("searchIcons", () => {
  const label = (icon: { id: string }) => `label ${icon.id}`;

  it("returns every icon for an empty query", () => {
    expect(searchIcons("  ", label)).toHaveLength(HOST_ICONS.length);
  });

  it("matches ids, labels and keywords, ignoring case", () => {
    expect(searchIcons("DOCKER", label).map((icon) => icon.id)).toEqual([
      "container",
    ]);
    expect(searchIcons("label rou", label).map((icon) => icon.id)).toEqual([
      "router",
    ]);
    expect(searchIcons("zzz", label)).toEqual([]);
  });
});

describe("searchBrands", () => {
  const ids = (query: string) => searchBrands(query).map((icon) => icon.id);

  it("returns every brand for an empty query", () => {
    expect(searchBrands(" ")).toHaveLength(BRAND_ICONS.length);
  });

  it("matches the name, the id and keywords, ignoring case", () => {
    expect(ids("UBUNTU")).toContain("brand-ubuntu");
    expect(ids("k8s")).toContain("brand-kubernetes");
    expect(ids("rhel")).toContain("brand-redhat");
    expect(ids("microsoft")).toContain("brand-windows");
    expect(ids("node")).toContain("brand-nodejs");
    expect(ids("zzzz")).toEqual([]);
  });

  it("does not match every brand on the id prefix", () => {
    expect(ids("brand")).toEqual([]);
  });
});
