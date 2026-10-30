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
  library of uploaded icons and syncs it (see "Uploaded icons" and "Sync"); everything else is frontend.
- Storage: four host settings, `icon` (an id from `HOST_ICONS` in `src/frontend/icons.ts`) and `color`
  (`#rrggbb` or empty for the theme color), plus `badge` and `badgeColor` (see "Corner badge"). All are `custom` fields, so core stores whatever it is sent:
  `resolveHostIcon` treats an unknown id as `FALLBACK_ICON_ID` and an invalid color as the theme color.
  They are defaultable (admin, user, folder). Core writes resolved defaults into each host's rows, so
  `host.pluginSettings["host-icons"]` already holds the effective value.
- Icons: four kinds of id. Text icons are `text:<frame|plate|plain>:<label>` (1 to 4 characters, parsed strictly in
  `icons.ts`, drawn by `HostIcon` as svg text with a measured width; the Text chip lists the ones hosts and rules already use,
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
- Corner badge: host settings `badge` (`text:<1 or 2 characters>`, `dot` or empty for none) and `badgeColor`
  (`#rrggbb`, or empty for a theme colored chip with the label knocked out), `custom` and defaultable (admin,
  user, folder) like `icon`. It is drawn only when the host has a base icon (its own or from a rule); rules can set
  badges (see Rules). `LayeredIcon.tsx` wraps `HostIcon` only when a layer exists, so a plain icon renders as
  before. The badge sits in the bottom right corner and is cut out of the base icon with a CSS mask hole, so it
  reads on any row background. The label uses the inherited UI font and is centered with `dy`, not
  `dominantBaseline`, which renders unevenly between browsers. The editors are in `src/frontend/layers.tsx`:
  the panel behind the "Badge: <summary>" disclosure of the Change icon dialog and the host
  settings components `icon-badge` and `icon-badge-color`. Removed on purpose, don't bring them back: glyph
  badges (Lucide glyphs at about 8px are unreadable), a ring around the icon (shrinking the base made logos
  unrecognizable) and an environment stripe at the row's left edge (it collides with Classic Layout's own
  `.host-status-stripe`).
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
  The picker draws icons at the list's real size: the overlay also sets `--host-icons-base` (the list's size at 100%
  for the position, `BASE_SIZE` in `preferences.tsx`, which must match the CSS), and `host-icons.css` sizes children
  of `data-host-icons-actual` and the tiles (`data-host-icons-tile`) from it. Picker grids are `data-host-icons-grid`,
  8 columns at most and fewer when the tiles don't fit (the rules popover is narrow), not `grid-cols-8`.
- Folder icons: the user setting `folderSize` (`custom`, component `folder-icon-size`, 75-200%, default 100; the same
  `PercentField` as Icon size in `settings.tsx`) is a percent of Classic Layout's own folder icon (`size-4`, 1rem), not
  tied to the host icon size. While it isn't 100 the overlay sets `--host-icons-folder-scale` and `data-host-icons-folders`
  on the root, and `host-icons.css` sizes the folder icon from them; at 100 nothing is set, so folders stay the layout's.
  Folders are core's, no plugin hook, so it is CSS only, matched on the markup of `FolderItem` in Plugin-Classic-Layout:
  `[role="button"][aria-expanded].group/folder > svg:has(+ span)` (the chevron is followed by the icon or a checkbox
  div, never a span; credential folder rows have no role). If it stops matching, folders keep 16px. It replaced a short
  lived "match host icons" checkbox: the user wanted their own number.
- Icon position is a user setting read once by a component in the `shell.overlay` slot
  (`src/frontend/preferences.tsx`), which also works out whether any host has an icon, into a store the
  badges subscribe to. Per-row `useSettings` would be one request per host.
- Rules: the user setting `rules` (`custom`, default `[]`, so core stores the array as sent, no JSON string)
  holds `{match: "tag"|"name"|"regex", value, icon, color, badge, badgeColor, override}`, edited by `src/frontend/rules-editor.tsx`
  (`registerSettingsComponent("icon-rules")`), a table with one row per rule. A rule's icon, color and badge share
  one Look cell (`rule-look.tsx`): a button drawing them together with `LayeredIcon` (a dashed `OWN_ICON_PLACEHOLDER`
  square, Lucide `SquareDashed`, stands for the host's own icon when the rule has none) that opens a dialog with a
  draft, written into the rule on Save and dropped on Escape or close (a cleared badge also clears `badgeColor`; the
  dialog stops `dragover`/`drop`, which React bubbles from the portal to the row's reorder handlers; the button always
  sits in the same Tooltip, so it is not remounted and keeps focus when the rule gets an icon). The dialog body is `AppearanceEditor`
  (`appearance-editor.tsx`), the same component the Change icon dialog uses: picker, note, preview, color row, Badge
  section, footer with Save. Keep them one component. Rows reorder with native HTML5
  drag and drop on the handle, or Alt+Arrow on it. The text of a tag rule is a combobox on the SDK's Popover (the
  SDK has no Command or combobox), fed by the tags in `useHosts()`. Draw icons only with canonical Lucide names:
  `tests/frontend/lucide-names.test.ts` checks them against the pinned `lucide-react` devDependency, which must match
  the version in Termix. `src/frontend/rules.ts` is pure and takes a list of rule lists, so
  an admin level can be added as one more list. `parseRules` is lenient (the editor keeps unfinished rules, a
  missing `override`, `badge` or `badgeColor` reads as false or empty); `activeRules` is strict (a value, and a known icon or,
  with an empty icon, a valid color or a badge `parseBadge` accepts; for `regex` a pattern that compiles). `regex` tests the host name with flag `i`, unanchored; patterns
  are compiled once and cached in `rulePattern`, and the editor marks one that does not compile. `ruleApplies`: a rule must match; an icon rule without `override` needs a host with no icon; a
  rule with icon "" (color and/or badge) needs a host with an icon, plus, without `override`, something to fill: a color
  while the host has none, or a badge while the host has none; `override` icon rules apply
  to any match. First applying rule wins, and it decides icon, color and badge together (a later rule is not consulted
  for what the first leaves empty). Color: override uses the rule's color (empty keeps the host's), otherwise
  the host's color wins. Badge (`ruleLayers` in `rules.ts`) the same way: without override the host's badge wins and
  the rule's fills a host with none, with its `badgeColor`; with override the rule's badge replaces the host's (an empty
  one keeps it), and an empty `badgeColor` keeps the host's badge color. The rules editor has a Badge tile per row
  (popover with `BadgeEditor` and a badge `ColorPicker`). The badge is drawn only over a base icon, as for hosts. Core does not say whether a host icon is its own or inherited, so override replaces both
  and a host can't be excepted; with no override an empty icon means "no icon", so the only opt-out is picking one.
  Rules are read in the same `shell.overlay` preferences component as the position (into the store), so the badges
  and the Change icon dialog (note under the preview) don't request anything, and a saved change shows without a
  reload. The "any host has an icon" check counts rule icons. Admin rules are not done: core's admin settings GET
  needs the manage-plugins permission, so non-admins can't read them.
- Picker (`IconPicker.tsx`, shared by the Change icon dialog, the `icon-picker` settings field and the rules popover):
  no tabs. One search `Input` with a magnifier on its left (`data-host-icons-search`, same placeholder in every chip), chips (`FILTERS`: All, Icons, Brands, Text, Uploaded; keep the query when switched) and one scroll area
  (`picker-list`, a fixed `height`, never a max, so changing chip does not resize the dialog; `listHeight` prop: 340 in the dialog, 288 in settings, 224 by default; the area has padding so selected rings are not clipped). A section is a title and a
  `data-host-icons-grid`. All with no query lists, in order: "Used on your hosts" (`usedIcons` in `used-text.ts`, most
  used first, filled by the preferences component with `collectUsedIcons` from hosts and rules; uploaded ids only show once
  the library knows them), the Lucide groups, the brand groups titled "Brands: <group>", then Uploaded. "No icon" (or the
  caller's `noneLabel`, "Host's own icon" in the rule dialog; the same Ban tile everywhere) is the first tile of the first section and is hidden while
  searching. A search filters each pack's sections. A query of 1 to 4 characters adds a first section `Text icon "XX"` with
  Frame, Plate and Plain tiles, in All only. In the Text chip the search field still searches: it filters "Text icons in use". The label is its own labeled
  field (`text` state, clamped to 4) inside the list above three style tiles with captions (`text-style-<style>`). Choosing
  Text with an empty label prefills it from the search when that is a valid label (no `onChange`); picking a used text
  icon fills the label and the style. Uploaded shows `UploadedControls` above the grid. The picker opens on
  Text for a text value so its label and style can be edited, also when the value arrives late, until the user touches it.
  Hidden brands stay out of search and the list unless they are the current value.
- Help: the first user setting `help` (`custom`, component `icon-help`, `src/frontend/help.tsx`) is only a place for core to draw "Priority order", a button with an info icon and a memo on the SDK's Popover (not Tooltip, which does not open on touch). Open = hover or focus or pinned; a click or Enter pins it, a second click, Escape or a click elsewhere closes it; focus stays on the button. The memo text (`settings.user.help.*`, three lines: order, rules, badge) states the order: host's own icon, color and badge, then folder, user, server default, then rules; colors follow the same order as icons. The SDK types name the defaults levels but do not document their order; it comes from the plugin docs and core's behavior, so re-check it if core changes.
- Change icon: a host context menu item can only run a callback, so it sets `PickerState` and a dialog
  mounted once through the `shell.overlay` slot shows the picker. It saves with `useSettings("host", id)`,
  then calls `notifyHostsChanged()` so the list reloads. The dialog is the picker, then top to bottom a preview row (icon, name), the Icon color section, a Badge disclosure (`aria-expanded`, button text "Badge: <summary>"; its panel opens below the color, animated by `data-host-icons-collapse` in `host-icons.css`: grid rows 0fr to 1fr, `visibility` hidden while closed, no motion under `prefers-reduced-motion`) and a footer with only Save at the right; it has no Cancel (Escape and the close button) and no long hints. It sends only changed keys, since the host record holds resolved defaults, so an untouched folder or user default isn't pinned to the host. The dialog has no Use default: it was removed on purpose (it had `_inherit`, a follows-default note and a height fix); only core's host editor hands a key back to its default. The Own colors / Theme color choice of the picker writes an empty color.
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
  Never store the file as it came. The room check and the insert are not atomic, so POST re-counts after inserting
  (`insertWithinLimits`) and deletes the new row by its syncId when over (409). Sync cannot: core does the insert, so a
  racing push may pass the caps by a row. The frontend loads the library into a store (`library.ts`) in the same
  `shell.overlay` preferences component; before it loads a `custom:` id draws an empty slot, after it an unknown id
  draws the fallback. An unknown `custom:` id on a host or rule (someone else uploaded it after the load) reads the
  library again, once per id (`askedFor`), so a deleted icon does not loop. `HostIcon` draws them as an `<img>` with a data: URL or, tinted, a span with a CSS mask in
  `currentColor`, marked `data-custom-icon`. A host color always tints; without one only an icon with `tint` is tinted, in the
  theme color, so a multicolor file keeps its colors. Since 0.5.0 the upload form has no Monochrome option and sends no
  `tint` (false), because a host color paints any upload; the column, the API field and sync keep it for icons uploaded
  as monochrome before; never inline SVG. So CSS in `host-icons.css` targets
  `:is(svg, [data-custom-icon])`. `ColorPicker` names its empty-color choice by the icon it is given: "Own colors" for a
  multicolor upload, "Theme color" for other known icons (with a preview), "No color" when the icon is unknown (defaults, rules
  without an icon); the hex field is our own (the SDK's shows a gray placeholder) and stays empty. The picker's Uploaded chip shows `UploadedControls` (`uploaded.tsx`, controls only, the grid is the picker's): Upload icon with the inline draft form (the new icon gets selected) and, when `icons.some(canEdit)`, Manage, which mounts `ManageDialog`. `ManageDialog` is a separate SDK Dialog (`data-host-icons-dialog`) stacked over the Change icon dialog: Upload on top (same `UploadForm`, no selection), search past `SEARCH_THRESHOLD` (8) editable icons, one `ManageRow` per editable icon (inline rename, delete) in a list that scrolls inside `max-h-[45vh]` and Done; the SDK `Input` is full width, so a flex-wrap row stacked the name under the preview in real Termix: rows and the upload draft use the grid `grid-cols-[2rem_minmax(0,1fr)_auto_auto]` (preview, name, two buttons), the invalid alert is `col-span-full`; Escape closes only it, the picker's state stays. Rename drafts live in `ManageDialog` (`drafts`), and Done, Escape and the X all run `finish()`: with an invalid draft (empty or over 64) nothing is sent, the rows are `flagged` (`aria-invalid`, alert text) and the dialog stays; otherwise one PATCH per changed icon, then `refreshLibrary`, a success toast and close, or an error toast and the failed rows kept flagged with their drafts. The delete confirm in `ManageRow` is a nested Dialog, not `useConfirm`: the SDK's pane-scoped confirm is inert and aria-hidden under a Radix modal. The same dialog opens from the user setting `library` (`custom`, component `icon-library`, `LibraryField` in `settings.tsx`), shown only when `useCanManageLibrary()` (upload or manage permission). Both refresh the library store after each change, and
  refreshes the store after each change.
- Host editor (`settings.tsx`: components `icon-picker`, `icon-color`, `icon-badge`, `icon-badge-color`) is styled like the Change icon dialog (picker `listHeight` 340, a `border-t` preview row, compact `ColorPicker`, `BadgeDisclosure` from `layers.tsx`, shared with the dialog) but stays four fields in manifest order. `BadgeField` publishes its open state to a module store (`setBadgeOpen`, set in a layout effect, reset on unmount) and `BadgeColorField` wraps its row in `data-host-icons-collapse`, so the badge color opens and closes with the Badge button. One combined block is not possible without core changes: `SettingsComponentProps` is only `{pluginId, values, setValue, running}`, so a component can read and write other keys of its scope, but it has no way to mark a key inherited or to draw core's Use default. Core draws that control only for fields it renders (assumed for the defaults editors too; core's source was not checked), and the only way to hide one (`hidden: true`) drops it from the form. So a merged block would lose Use default for color, badge and badge color. If the SDK gains an inherit channel, merge them.
- Sync: `ctx.sync.registerEntity` (type `icons`, in `src/backend/index.ts`; the wire name never changes) and
  `contributes.syncEntities`. Core needs an auto increment `id` and a `syncId` column, so the table has both and the
  public icon id everywhere (API `id`, `custom:<uuid>` in host settings, PATCH and DELETE paths) is the `syncId`; the
  numeric `id` never leaves the server. `uploadedBy` is the sync owner column, and core syncs only the rows whose owner is
  the user, so `icons` carries only your own uploads. Other people's come down through a second, read only entity
  `sharedIcons` (`src/backend/shared.ts`, Termix 26.10.6+ / plugin API 1.13, which is why `engine` asks for them):
  `table: null`, `load(userId)` on the server returns every icon not uploaded by that user (no `uploadedBy` on the wire),
  `write`/`erase` on the desktop keep copies in the table `shared_icons` (keyed by `userId` + `syncId`, `refUser`, checked
  with `checkIcon` like an upload, outside the 500 icon / 10 MB caps since the server already bounds them). GET lists the
  caller's copies after the own rows, with `canEdit: false`, skipping a syncId the `icons` table has; PATCH and DELETE
  only look in `icons`, so a copy answers 404. The wire name `sharedIcons` never changes either. Core checks `permissions.create` as given, so it is the full name
  `host-icons.upload`; changes and deletes only touch the pusher's own rows and need no permission. `deserialize` runs on
  every inbound row and runs `checkIcon` from `src/backend/library.ts`, the same check as the upload route (name, kind,
  tint, SVG sanitizing, PNG header, size), stores the sanitized output and throws to reject the row. It also applies the
  500 icon and 10 MB caps (`hasRoom`), leaving out the row's own syncId so a change to a stored icon on a full library still
  works. Version 0.3.0 was never released with the old string key, so the migration was rewritten rather than added.
