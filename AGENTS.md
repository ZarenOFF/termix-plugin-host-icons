# AGENTS.md

This repo is a [Termix](https://github.com/Termix-SSH/Termix) plugin. These notes are for AI coding tools.

## Read first

Before changing anything, read `node_modules/@termix-ssh/plugin-sdk/PLUGIN-GUIDE.md`. It covers the
manifest, backend, database, frontend, UI, testing, releasing and submitting to the community registry,
and it matches the SDK version installed here. If it is missing, run `npm install`. If it is still missing,
the SDK is older than 1.0.6: run `npm install -D @termix-ssh/plugin-sdk@latest` or read
https://docs.termix.site/develop instead.

If the guide and the SDK's TypeScript types disagree, the types are right.

## First time setup

If `manifest.json` still has the id `hello-world`, this plugin was just made from the template. Ask the
user for the plugin's id, name and description, then:

1. In `manifest.json`, set `id`, `name`, `description`, `author`, `repository`, `docs`, `category`,
   `icon` and `features`. The id is lowercase with dashes and can't change after the first release.
2. Rename every `hello-world`, `hello_world` and `Hello World` to match: `package.json`,
   `locales/en.json`, the index name in `src/backend/tables.ts`, the API paths in `src/backend/routes.ts`,
   the tab id in `src/frontend/index.tsx`, the tests, `docs/index.md`, `CONTRIBUTING.md` and `README.md`.
3. Delete `migrations/` and run `npm run migrations` so the tables use the new id.
4. Replace the example notes feature with the real one, and fill in "About this plugin" below.

## Commands

```bash
npm run build        # bundle into dist/
npm test             # run the tests
npm run typecheck    # type check
npm run validate     # check manifest.json, migrations, changelog and docs
npm run migrations   # write migrations after changing src/backend/tables.ts
npm run pack         # write <id>-<version>.tmxplug
npm run format       # format with Prettier
```

`npx termix-plugin dev --server <url> --key <tmx_...>` installs the plugin on a Termix server with
developer mode on and reinstalls it on every save. Don't start it unless the user asks.

## Layouts and themes

A plugin can also be a layout (`contributes.layouts`, capability `ui:layout`, `app.registerLayout` in the
frontend, shell state from `useShell()`) or add themes (`contributes.themes`, capability `ui:theme`, one CSS
file per theme scoped under `.<id>`). A theme only plugin has no `src/`: just `manifest.json`, `themes/*.css`,
`locales/` and a test that runs `validateThemeCss()`. The guide's "Layouts and themes" section has the rules.

## Done means

- `npm test`, `npm run typecheck`, `npm run validate`, `npm run build` and `npm run format:check` pass
- `npx termix-plugin migrations --check` passes
- New UI text is in `locales/en.json`, new routes have an `@openapi` block and a test
- `docs/` and the section below still match what the plugin does
- User facing changes are in `CHANGELOG.md` under the version they ship in

## About this plugin

Keep this section current when the plugin changes: what it does, how it is put together, decisions that
aren't obvious from the code, and anything that has bitten you before.

- What it does: lets each host have an icon and a color, shown next to its name in the Hosts list.
- Frontend only. The backend is an empty `activate` because `termix-plugin build` requires an entry. There
  are no tables, routes or permissions, and the only capability is `ui:surface`.
- Storage: two host settings, `icon` (an id from `HOST_ICONS` in `src/frontend/icons.ts`) and `color`
  (`#rrggbb` or empty for the theme color). Both are `custom` fields, so core stores whatever it is sent:
  `resolveHostIcon` treats an unknown id as `FALLBACK_ICON_ID` and an invalid color as the theme color.
  They are defaultable (admin, user, folder). Core writes resolved defaults into each host's rows, so
  `host.pluginSettings["host-icons"]` already holds the effective value.
- Icons: two packs. Lucide icons (ids like `server`, `HOST_ICONS` in `src/frontend/icons.ts`) are drawn with
  `PluginIcon` from `@termix-ssh/plugin-sdk/ui`, which looks names up in Lucide's `icons` map inside Termix
  (lucide-react 1.49 in Termix 26.10). Nothing is bundled. Use canonical names: aliases like `Building2` or
  `Fingerprint` are missing from that map and draw a puzzle piece. A test catches it. Brand logos (ids
  `brand-<name>`) are path data in `src/frontend/brands.generated.ts`, drawn by `HostIcon` as an inline svg
  (fill or stroke `currentColor`, so color works like for Lucide). The generated file comes from the curated
  list in `scripts/brands.mjs` through `npm run brands` (`scripts/generate-brands.mjs`) and Simple Icons (CC0)
  and Tabler icons (MIT, only for brands Simple Icons lacks), both exact pinned devDependencies. Never edit the
  generated file by hand; a test fails when it is out of date. The stored id is ours and independent of the
  pack slug: if a pack renames a slug, change the slug in `brands.mjs` and keep the id. Never rename or remove
  a shipped icon id, of either pack. Brand titles are not translated, group names are. `.tmxplug` packs only
  manifest, dist, locales, README, CHANGELOG, LICENSE and `NOTICE`, so the third party notices live in
  `NOTICE`; update it when a pack or version changes.
- Host list: `registerHostBadge`. Classic Layout draws badges after the name, pin and lock, and hides them
  when "Plugin badges" is off. `src/frontend/host-icons.css` moves our badge by its
  `data-host-icon-position`: `order: -1` for small, and for large the text column
  (`div:has(> [data-drag-label] > [data-host-icon-position=large])`) gets a left padding and the icon sits
  absolutely in it, positioned against the name row (plus the address span after it when shown: 3.5px gap,
  11px line), never the whole column. Comfortable rows open the hover action tray in that column, and a
  column-high box pulled the icon to its middle. The address can be off, so don't depend on it. That
  depends on Classic Layout's HostItem markup; if it stops matching, large falls back to small. Core loads frontend.css as a plain global stylesheet. The badge applies to every host so a
  host without an icon can render an empty slot that lines names up, but only once any host has an icon,
  and only when the user setting `skipEmptySlot` (on by default; unset counts as on) is off.
- Icon size is a `custom` user setting (50-150%, `SizeField`: core's number field is full width with no unit). The large icon's room is padding on the row's text column,
  which can't read a variable from the badge inside it, so the overlay sets `--host-icons-scale` on
  `document.documentElement` and removes it on disable; every size in `host-icons.css` multiplies by it.
- Icon position is a user setting read once by a component in the `shell.overlay` slot
  (`src/frontend/preferences.tsx`), which also works out whether any host has an icon, into a store the
  badges subscribe to. Per-row `useSettings` would be one request per host.
- Rules: the user setting `rules` (`custom`, default `[]`, so core stores the array as sent, no JSON string)
  holds `{match: "tag"|"name", value, icon, color, override}`, edited by `src/frontend/rules-editor.tsx`
  (`registerSettingsComponent("icon-rules")`), a table with one row per rule. Rows reorder with native HTML5
  drag and drop on the handle, or Alt+Arrow on it. The text of a tag rule is a combobox on the SDK's Popover (the
  SDK has no Command or combobox), fed by the tags in `useHosts()`. Draw icons only with canonical Lucide names:
  `tests/frontend/lucide-names.test.ts` checks them against the pinned `lucide-react` devDependency, which must match
  the version in Termix. `src/frontend/rules.ts` is pure and takes a list of rule lists, so
  an admin level can be added as one more list. `parseRules` is lenient (the editor keeps unfinished rules, a
  missing `override` reads as false); `activeRules` is strict (a value, and a known icon or, with an empty icon,
  a valid color). `ruleApplies`: a rule must match; an icon rule without `override` needs a host with no icon; a
  color-only rule (icon "") needs a host with an icon, plus no color unless `override`; `override` icon rules apply
  to any match. First applying rule wins. Color: override uses the rule's color (empty keeps the host's), otherwise
  the host's color wins. Core does not say whether a host icon is its own or inherited, so override replaces both
  and a host can't be excepted; with no override an empty icon means "no icon", so the only opt-out is picking one.
  Rules are read in the same `shell.overlay` preferences component as the position (into the store), so the badges
  and the Change icon dialog (note under the preview) don't request anything, and a saved change shows without a
  reload. The "any host has an icon" check counts rule icons. Admin rules are not done: core's admin settings GET
  needs the manage-plugins permission, so non-admins can't read them.
- Change icon: a host context menu item can only run a callback, so it sets `PickerState` and a dialog
  mounted once through the `shell.overlay` slot shows the picker. It saves with `useSettings("host", id)`,
  then calls `notifyHostsChanged()` so the list reloads. It sends only changed keys, since the host record holds resolved defaults; `{ _inherit: [keys] }` (each field has its own Use default) sends keys back to their
  defaults.
- Server (admin) host defaults are written to hosts by a background job in core (`PUT /host/defaults/admin`
  returns a `jobId`), and the shell reloads the host list before the job ends, so icons from a server
  default can take until core's next host list poll to show. User and folder defaults are applied right
  away. Core's behavior, nothing for the plugin to fix.
- Tests render through the real SDK test host. `useSettings` there calls the real API, so the context menu
  test mocks it with `vi.mock`.
- Termix's Dialog overlay blurs the whole app (`backdrop-blur-xs`), and hovering the icon grid over it
  lagged badly. Our dialog carries `data-host-icons-dialog` and `host-icons.css` drops the blur for it.
- Not done yet: uploading your own SVG/PNG icons (needs a table, a route and SVG sanitizing). Wait for the
  maintainer before starting it.
