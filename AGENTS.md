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
- Mostly frontend. Capabilities: `ui:surface`, `db:own`, `network:serve`. The backend only serves the shared
  library of uploaded icons (see "Uploaded icons"); everything else is frontend.
- Storage: two host settings, `icon` (an id from `HOST_ICONS` in `src/frontend/icons.ts`) and `color`
  (`#rrggbb` or empty for the theme color). Both are `custom` fields, so core stores whatever it is sent:
  `resolveHostIcon` treats an unknown id as `FALLBACK_ICON_ID` and an invalid color as the theme color.
  They are defaultable (admin, user, folder). Core writes resolved defaults into each host's rows, so
  `host.pluginSettings["host-icons"]` already holds the effective value.
- Icons: four kinds of id. Text icons are `text:<frame|plate|plain>:<label>` (1 to 4 characters, parsed strictly in
  `icons.ts`, drawn by `HostIcon` as svg text with a measured width; the Text tab lists the ones hosts and rules already use,
  collected by the preferences component into `src/frontend/used-text.ts`), uploaded ones are `custom:<uuid>`. Two packs of
  named icons: Lucide icons (ids like `server`, `HOST_ICONS` in `src/frontend/icons.ts`) are drawn with
  `PluginIcon` from `@termix-ssh/plugin-sdk/ui`, which looks names up in Lucide's `icons` map inside Termix
  (lucide-react 1.49 in Termix 26.10). Nothing is bundled. Use canonical names: aliases like `Building2` or
  `Fingerprint` are missing from that map and draw a puzzle piece. A test catches it. Brand logos (ids
  `brand-<name>`) are path data in `src/frontend/brands.generated.ts`, drawn by `HostIcon` as an inline svg
  (fill or stroke `currentColor`, so color works like for Lucide). The generated file comes from the curated
  list in `scripts/brands.mjs` through `npm run brands` (`scripts/generate-brands.mjs`) and Simple Icons (CC0)
  and Tabler icons (MIT, only for brands Simple Icons lacks), both exact pinned devDependencies. Never edit the
  generated file by hand; a test fails when it is out of date. The stored id is ours and independent of the
  pack slug: if a pack renames a slug, change the slug in `brands.mjs` and keep the id. Never rename or remove
  a shipped icon id, of either pack. Brands in `scripts/brands.mjs` can have `hidden: true`: still generated so hosts that store the id keep
  their logo, but the picker and search skip them (used for wordmark logos that are unreadable small: cisco, vmware,
  macos, ios, netgear, asus, synology, qnap, dotnet, plex, netbsd, jfrog). Brand titles are not translated, group names are. `.tmxplug` packs only
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
- Uploaded icons: one shared library for the whole server, so a shared host looks the same to everyone. Table
  `icons` (`src/backend/tables.ts`): uuid id picked by the server (no `returning()`, MySQL lacks it), name, kind
  `svg`|`png`, data, tint, `uploadedBy` (a plain varchar, not `refUser`, so icons outlive the uploader), createdAt.
  Routes in `src/backend/routes.ts` (each with `@openapi` and tests): GET (any signed-in user), POST, PATCH
  (name, tint), DELETE. Permissions `upload` (add, change own; admin and user) and `manage` (change anyone's;
  admin); `canEdit` in a response says what the caller may change. `uploadedBy` is never sent to clients. Limits:
  name 1 to 64, SVG 100 KB after sanitizing, PNG 256 KB decoded and 512 by 512 (IHDR read, `png.ts`), 500 icons and
  10 MB of data in all (POST answers 409 so GET stays bounded). `sanitize-svg.ts` parses with htmlparser2 (bundled,
  see `NOTICE`) and rebuilds the markup from an allowlist of elements and attributes; it drops script, style,
  foreignObject, image, animation, event attributes, comments and doctype, and keeps only local `#` references.
  Never store the file as it came. The frontend loads the library into a store (`library.ts`) in the same
  `shell.overlay` preferences component; before it loads a `custom:` id draws an empty slot, after it an unknown id
  draws the fallback. `HostIcon` draws them as an `<img>` with a data: URL or, tinted, a span with a CSS mask in
  `currentColor`, marked `data-custom-icon`. A host color always tints; without one only an icon with `tint` (shown as
  "Monochrome icon") is tinted, in the theme color, so a multicolor file keeps its colors; never inline SVG. So CSS in `host-icons.css` targets
  `:is(svg, [data-custom-icon])`. The picker's Uploaded tab (`uploaded.tsx`) uploads, renames and deletes, and
  refreshes the store after each change.
- Sync: `ctx.sync.registerEntity` (type `icons`, in `src/backend/index.ts`; the wire name never changes) and
  `contributes.syncEntities`. Core needs an auto increment `id` and a `syncId` column, so the table has both and the
  public icon id everywhere (API `id`, `custom:<uuid>` in host settings, PATCH and DELETE paths) is the `syncId`; the
  numeric `id` never leaves the server. `uploadedBy` is the sync owner column, and core syncs only the rows whose owner is
  the user, so only your own uploads reach your linked desktop, and icons other people uploaded don't: a host that uses one
  shows the fallback on the desktop while it is offline. Core checks `permissions.create` as given, so it is the full name
  `host-icons.upload`; changes and deletes only touch the pusher's own rows and need no permission. `deserialize` runs on
  every inbound row and runs `checkIcon` from `src/backend/library.ts`, the same check as the upload route (name, kind,
  tint, SVG sanitizing, PNG header, size), stores the sanitized output and throws to reject the row. It also applies the
  500 icon and 10 MB caps (`hasRoom`), leaving out the row's own syncId so a change to a stored icon on a full library still
  works. Version 0.3.0 was never released with the old string key, so the migration was rewritten rather than added.
