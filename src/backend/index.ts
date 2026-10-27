import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

// Host Icons has no server side work: the icon and color are host settings,
// which core stores, validates and hands to the frontend with each host.
export async function activate(_ctx: PluginContext) {}

export async function deactivate() {}
