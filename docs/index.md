Host Icons puts an icon next to each host name in the Hosts list, in a color you choose, so different kinds of hosts are easy to tell apart.

## Turn it on

Install Host Icons from the Plugins tab. There is nothing to set up: the host editor gets a Host Icons section.

## Use it

- Edit a host, open the Host Icons section and pick an icon. Pick a color too if you like, or leave it on Theme color to follow the text color. The section and the Change icon dialog look alike: the picker with its search and chips, the preview below it, a compact color row and, under the color, a Badge button that opens the badge settings. Core draws one field for each setting, so the badge color is a separate field after the Badge button that opens and closes with it, and each field keeps its own Use default. Save the host.
- To change an icon quickly, right-click the host in the Hosts list and choose Change icon.
- To give a whole folder one icon, set Icon and Icon color in the folder's host defaults. Hosts that have no icon of their own follow it. To send a host back to the default, use Use default in the host editor.
- To give all your hosts an icon, open Manage, switch to Defaults and set Icon and Icon color under My defaults. An admin can do the same under Server for everyone. A folder default wins over these, and a host's own icon wins over all of them. New hosts follow the default too.
- The picker is one search box above one scrolling list. The chips under the box narrow it: All (the default), Icons for general icons, Brands for logos such as Ubuntu, Proxmox or Docker, Text and Uploaded. With All and nothing typed, the list starts with the icons already used on your hosts and in your rules, then every group of icons, the brand groups (named Brands: and the group) and your uploaded icons. Typing searches the chosen chip, so k8s finds the Kubernetes logo and the names of uploaded icons in All; the chips keep what you typed. Brand logos are one color, so they follow the icon color.
- No icon is the first tile of the list. It removes the icon, and it is hidden while you search.
- Text icons: type 1 to 4 characters, such as DB, and All offers that label first as a Frame (in a rounded frame), a Plate (on a filled plate) or Plain (just the text). Or choose the Text chip: type the Label (1 to 4 characters; a search that fits is filled in for you) and pick one of the three styles below it, shown with their captions. The search box above filters the Text icons in use below; choosing one fills the Label and the style. The icon color applies to the text.
- Choose how icons show under Settings, Host Icons, Icon position: large and left of the host (the default), small before the name, or small after the name. Each user picks their own.
- Icon size in the same place makes icons bigger or smaller, from 50% to 150%. The picker shows icons at the size the Hosts list draws them, for your position and size, so you see how a logo reads before you pick it.
- With large icons, only hosts that have an icon move over. Turn off Indent only hosts with an icon in the same place to give the others an empty space, so all names line up.
- Folder icon size in the same place makes folder icons in the Hosts list bigger or smaller, from 75% to 200% of their usual size, for example to match large host icons. It works with the Classic Layout; other layouts keep their own folder icons.

Only people who can edit a host can change its icon. People it is shared with see the owner's icon.

## Corner badge

A corner badge is a small mark on the bottom right corner of an icon, for something the icon alone does not say, such as an environment: P for production, or a dot for "needs attention". It is cut out of the icon, so it stays readable on any row background.

- Open Change icon (right-click the host) and open **Badge** below the icon color, or edit the host, to set the **Corner badge**: **None**, **Badge text** (1 or 2 characters, such as P or QA) or **Dot**. Pick a **Badge color** too, or leave it on Theme color to get a chip in the text color with the label cut out of it.
- A badge needs an icon: it is drawn on top of it, and a host with no icon shows none. An icon given by an automatic rule counts.
- Badges can be set in host defaults like the icon: for a folder, under My defaults in Manage, and by an admin under Server. To send a host's badge, or its color, back to the default, use Use default in the host editor; the badge and its color each have their own.
- Automatic rules can set badges too; see Rules below.

## Your own icons

The Uploaded chip of the picker holds a library of SVG and PNG icons. The library is shared: everyone who can see a host sees the same icon, and everyone can pick from it.

- Choose Upload icon above the grid, pick an SVG or PNG file and give it a name, then choose Add to library. With no color chosen an uploaded icon keeps the colors of its file; the color picker calls that choice Own colors. Choosing a color for a host paints any uploaded icon in that color.
- Choose Manage, next to Upload icon (shown when you may change some icon), to open the Uploaded icons dialog over the picker. It has Upload on top, a search by name when there are more than 8 icons, and a scrolling list with one row for each icon you may change: the icon, its name, Save and Delete. Rename it and choose Save, or delete it after a confirmation. Done saves every name you changed (one request per icon) and returns to the picker as you left it; Escape and the close button do the same. A name that is empty or longer than 64 characters is marked and keeps the dialog open, and so does a rename the server refuses, with the failed rows still showing what you typed. Deleting an icon takes it away from everyone: hosts that use it show the fallback icon.
- At the top of the plugin's settings, Priority order has an info icon. Hover it, focus it with the keyboard (Tab) or click or tap it to read the order in short: the host's own icon, color and badge first, then the folder default, your user default and the server default; rules after that, top to bottom, filling in only what is missing unless the rule has Priority; and a rule's badge is drawn only on a host that ends up with an icon. Click it again or press Escape to close.
- The same dialog opens from the plugin's settings, with Manage uploaded icons, for users who may upload or manage icons.
- Uploaded icons can also be used in automatic icon rules.

Two permissions in Termix say who may do what. Upload icons (admins and users by default) adds icons and lets you rename or delete your own. Manage uploaded icons (admins by default) lets you rename or delete anyone's. Everyone who is signed in can see and use the library.

On a linked Termix desktop the icons you uploaded sync along with your hosts, in both directions: an icon added on the desktop reaches the server, if you may upload icons there. Icons other people uploaded sync down as read only copies, so every host draws the same icon on the desktop as on the server, offline too. Renaming or deleting them is done in the server's library; the desktop picks the change up on its next sync.

Limits: an SVG may be 100 KB after cleaning and a PNG 256 KB and 512 by 512 pixels at most. A name has 1 to 64 characters. The library holds up to 500 icons and 10 MB in all. SVG files are cleaned when you upload them: scripts, styles, images and links to other files are removed, so an icon that relies on them may look different. PNG files are shown as they are.

## Rules

Rules give icons, colors and badges to hosts by tag, by name or by a regular expression, so you do not have to pick one host by host. They are yours only: other people do not see your rules, and the rules only change what you see in your own Hosts list. Add them under Settings, Host Icons, Automatic icons.

Each rule is a row of the table, with:

- A **Match**: **Tag** (the host has this tag, the whole tag, any letter case), **Name contains** (part of the host name, any letter case) or **Name regex** (the host name matches a JavaScript regular expression, any letter case: `^(db|pg)-` matches every name that starts with db- or pg-; add ^ and $ to match the whole name), and its **Text**. A regular expression that is not valid is marked red and the rule does nothing until it is fixed. For a tag, the Text box suggests the tags your hosts already have as you type: pick one with the mouse, or with the arrow keys and Enter. A rule with no text never matches.
- A **Look**: one button that shows the icon, color and badge of the rule together, the way the Hosts list draws them. It opens a dialog like Change icon, with the icon picker, a preview, the icon color and a Badge button for the corner badge (None, Badge text or Dot) and its color. Save puts the look into the rule; Escape or the close button leaves the rule as it was. Pick **Host's own icon**, the first tile of the picker, to set only a color or a badge on a host that already has an icon; the button then shows a dashed square for the host's own icon with the color and badge on it. A rule with no icon, no color and no badge does nothing.
- **Priority**, off by default: the rule takes priority over the host's own icon, color and badge.

The rules are tried from the top and the first rule that applies to a host wins. Drag the handle at the start of a row to reorder them, or focus the handle and press Alt with the Up or Down arrow key. Changes show in the Hosts list as soon as you save your settings.

What "applies" means:

- A rule without priority only fills in what the host has not got. An icon rule applies to a host with no icon; a rule with no icon applies to a host that has an icon but lacks what the rule gives: no color for a color, no badge for a badge. A host's own icon, color and badge, and ones from a folder, user or server default, are never changed. A rule that does not apply is skipped, so a rule further down can still apply.
- A rule with priority applies even to a host that has an icon, a color or a badge. It replaces the icon (or, for a rule with no icon, only its color and badge), whether the host's value is its own or comes from a default. A rule with no icon never applies to a host with no icon.
- With priority, what the rule leaves empty stays the host's: no color keeps the host's color, no badge keeps its badge, and a badge with no badge color keeps the host's badge color.
- The first rule that applies decides the icon, the color and the badge together; rules further down are not looked at for the rest. A badge is drawn only when the host ends up with an icon.

The Change icon dialog shows a note under the icon when a rule applies to the host.

Limits of rules: Termix does not tell Host Icons whether an icon is the host's own or inherited, so a host cannot be excepted from a rule with priority. For a rule without priority, a host with no icon cannot opt out either: an empty icon means no icon, so pick an icon for that host to stop the rules from giving it one. A rule whose icon was removed from a later version of the plugin is skipped.

## If the icon does not show

- Check that Plugin badges is on under Customize sidebar, Row details.
- A host saved with an icon that this version does not know shows the Server icon until you pick another one.

## Limits

Termix lets plugins add badges after the host name. Host Icons moves its badge to the left with CSS that follows the Classic Layout's markup; if a Classic Layout update changes that markup, the large icon shows small before the name until Host Icons catches up. Some logos that are mostly lettering (such as Cisco or VMware) are not offered any more because they are unreadable when small; hosts that already use them keep them. Brand logos are single color shapes, not the full color logos, and they are trademarks of their owners; the Brands pack covers common software and hardware, not every brand.
