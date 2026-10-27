import { describe, expect, it } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import { activate, deactivate } from "../../src/backend/index.js";

const manifest = manifestJson as unknown as PluginManifest;

describe("backend", () => {
  it("activates without any server capability", async () => {
    const mock = createMockCtx({
      pluginId: manifest.id,
      manifest,
      capabilities: [],
    });
    await expect(activate(mock.ctx)).resolves.toBeUndefined();
    await expect(deactivate()).resolves.toBeUndefined();
  });
});
