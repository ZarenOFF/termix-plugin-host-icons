import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { icons } from "lucide-react";
import { HOST_ICONS } from "../../src/frontend/icons";
import { OWN_ICON_PLACEHOLDER } from "../../src/frontend/rule-look";
import manifest from "../../manifest.json";

/**
 * Termix draws a Lucide icon by looking its name up in the `icons` map of
 * lucide-react. That map lists canonical names only: an alias like Trash2
 * (now Trash) is missing and PluginIcon draws a puzzle piece. The SDK's test
 * host resolves aliases, so rendering can't catch it. This checks the names
 * against the `icons` map of the lucide-react that Termix ships; the version
 * in devDependencies is pinned to it. Move both together.
 */
const canonical = new Set(Object.keys(icons));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Every `<PluginIcon name="X">` literal in src/, with the file it is in. */
function pluginIconNames(): [string, string][] {
  const found: [string, string][] = [];
  for (const file of sourceFiles("src")) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(
      /<PluginIcon\b[^>]*?\bname=\{?["'`]([A-Za-z0-9]+)["'`]/gs,
    )) {
      found.push([match[1]!, file.replaceAll("\\", "/")]);
    }
  }
  return found;
}

describe("Lucide names are canonical, not aliases", () => {
  it("finds the icons the source draws", () => {
    expect(pluginIconNames().length).toBeGreaterThan(0);
  });

  it.each(pluginIconNames())("PluginIcon name %s (%s)", (name) => {
    expect(canonical.has(name), `${name} is an alias or does not exist`).toBe(
      true,
    );
  });

  it.each(HOST_ICONS.map((icon) => [icon.id, icon.lucide] as const))(
    "catalog icon %s uses %s",
    (_id, name) => {
      expect(canonical.has(name), `${name} is an alias or does not exist`).toBe(
        true,
      );
    },
  );

  it("knows an alias from a canonical name", () => {
    expect(canonical.has("Trash")).toBe(true);
    expect(canonical.has("Trash2")).toBe(false);
  });

  it("draws the host's own icon placeholder with a canonical name", () => {
    expect(canonical.has(OWN_ICON_PLACEHOLDER.lucide)).toBe(true);
  });

  it("uses a canonical name for the plugin's own icon", () => {
    const icon = (manifest as { icon?: string }).icon;
    if (icon) expect(canonical.has(icon)).toBe(true);
  });
});
