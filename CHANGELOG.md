# Changelog

## 0.6.0

### Added

- Folder icon size setting: folder icons in the Hosts list from 75% to 200% (Classic Layout)
- Icons uploaded by other people sync to the Termix desktop app, so shared hosts show the same icons there

### Changed

- Needs Termix 26.10.6 or newer

### Fixed

- An icon another user uploaded and gave to a shared host shows without a page reload, instead of the fallback icon
- The Change icon dialog stays open while it is saving
- The Badge section opens for a host's badge that loads late
- Focus rings in the Badge section are no longer cut off

## 0.5.0

### Added

- A Priority order line with an info icon at the top of the plugin's settings. Hover it, focus it with the keyboard, or click or tap it to read a short memo of the order: the host's own icon, color and badge, then the folder, user and server defaults, then rules
- Rules can give a corner badge (None, Dot or one or two characters, with a badge color). Without Priority a badge rule fills in only a host that has no badge, and needs a host with an icon; with Priority it replaces the host's badge. Rules saved before keep working with no badge
- Rules can match host names by a regular expression, such as `^(db|pg)-` for every name that starts with db- or pg-. A pattern that is not valid is marked red and the rule stays off until it is fixed
- Manage uploaded icons opens in its own dialog, from the Manage button of the Uploaded chip and from a new Manage uploaded icons button in the plugin's settings (shown to users who may upload or manage icons). It has Upload on top, a search by name when there are more than 8 icons, and a list that scrolls inside the dialog, with one compact row per icon you may change (preview, name, rename and delete) in Termix's own layout

### Changed

- The rules table has one Look column instead of Icon, Color and Badge. Its button shows the rule's icon, color and badge together as the Hosts list draws them (a dashed square stands for the host's own icon when the rule gives none) and opens a dialog like Change icon to edit them. Save writes the look into the rule; Escape or the close button discards it
- The Change icon dialog has no Use default buttons any more, so it looks like the host editor. It saves only the fields you changed; to send a field back to its folder, user or server default, use Use default in the host editor
- Manage uploaded icons saves every name you changed when you press Done, press Escape or close the dialog (one request per icon). An empty or too long name is marked and keeps the dialog open; a refused rename shows a message and keeps the failed rows
- The host editor's Host Icons section follows the Change icon dialog: a picker of the same fixed height, the preview row below it, a compact color row, and the badge as an animated Badge button; the badge color field opens and closes with it. Each setting is still its own field, so each keeps its own Use default
- The icon picker is now one list instead of tabs: a search box, the chips All, Icons, Brands, Text and Uploaded, and one scrolling area. All starts with the icons used on your hosts and in your rules, and a search of 1 to 4 characters offers that text as a Frame, Plate or Plain icon. In the Text chip the search box still searches (it filters the text icons in use), and the label is its own field above the three styles; a search that fits as a label fills an empty one. The list has a fixed height, so changing chip no longer resizes the picker. The Upload and Manage controls sit at the top of the Uploaded chip
- The Change icon dialog is more compact: the picker, then the live preview, the icon color, a Badge button that shows the badge (Badge: None, Dot, P) and opens its settings below the color with a short animation, and Save in the bottom right corner. The long hints and the Cancel button are gone (Escape or the close button still close it)
- No icon is now the first tile of the picker, and the hint under the color picker is gone
- The picker shows icons at the size the Hosts list draws them, for your icon position and size, so at 150% the picker shows them at 150% too
- Uploading an icon no longer asks whether it is monochrome: an uploaded icon keeps the colors of its file, and a color chosen for the host paints it. Icons uploaded as monochrome before keep the theme color

## 0.4.0

### Added

- A corner badge on the icon with one or two characters or a dot, in its own color, such as R1 on a database replica or a dot on a host that needs attention. It has its own default per folder, user and server, so a folder can give all its hosts a badge while every host keeps its own icon

### Changed

- The option for no color now says what it does for the chosen icon, such as Own colors for a multicolor uploaded icon, and shows a preview of the icon without a color
- Monochrome icon is now off by default when uploading an SVG, so an uploaded icon keeps the colors of its file unless you turn it on

### Fixed

- The 10 MB limit of the uploaded icon library now counts bytes on SQLite and PostgreSQL, not characters
- Uploads at the same time can no longer push the icon library past its limit of 500 icons or 10 MB

## 0.3.0

Updating asks an admin to approve two new capabilities, database and routes, which the shared icon library needs.

### Added

- Text icons: a label of up to 4 characters, such as DB or K8S, drawn as a frame, a plate or plain text, in the icon color, with the text icons already used on hosts or in rules one click away
- Upload your own SVG or PNG icons in the Uploaded tab of the picker. The library is shared, so every user sees the same icon on a shared host. A chosen icon color paints an uploaded icon, and a Monochrome option draws it in the theme color when no color is chosen
- Permissions Upload icons (add icons, rename or delete your own) and Manage uploaded icons (rename or delete anyone’s)
- Uploaded icons work in automatic icon rules
- Icons you upload sync to a linked desktop, so your hosts keep their icons offline

### Changed

- The MySQL logo is now the dolphin symbol
- Logos that are mostly lettering and unreadable when small (Cisco, VMware, macOS, iOS, Netgear, ASUS, Synology, QNAP, .NET, Plex, NetBSD and JFrog) are no longer offered in the picker. Hosts that already use them keep them

## 0.2.0

First release.

### Added

- An Icon and an Icon color field in the host editor, with a searchable picker of general icons and an Icons and Brands switch
- Brand logos to pick from: operating systems and Linux distributions, clouds, containers, databases, network gear and more, colored by the icon color like the other icons
- Icon and color defaults for a folder, a user or the whole server
- The icon in the Hosts list: large and left of the host, or small before or after the name, picked per user under Icon position, indenting only hosts that have an icon unless the user lines up all names
- Icon size, from 50% to 150%
- Change icon in the host context menu and in the command palette, where Use default hands the icon or the color back to the folder, user or server default
- Automatic icons: rules that give hosts an icon or a color by tag or by name, in a table you can reorder by dragging, with suggestions from your tags. A rule fills in what a host has not got, or with Priority on replaces the host's own icon
- Russian translation
