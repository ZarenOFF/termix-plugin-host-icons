Host Icons puts an icon next to each host name in the Hosts list, in a color you choose, so different kinds of hosts are easy to tell apart.

## Turn it on

Install Host Icons from the Plugins tab. There is nothing to set up: the host editor gets a Host Icons section.

## Use it

- Edit a host, open the Host Icons section and pick an icon. Pick a color too if you like, or leave it on Theme color to follow the text color. Save the host.
- To change an icon quickly, right-click the host in the Hosts list and choose Change icon.
- To give a whole folder one icon, set Icon and Icon color in the folder's host defaults. Hosts that have no icon of their own follow it. Use default in the Change icon dialog sends the icon or the color back to the default.
- To give all your hosts an icon, open Manage, switch to Defaults and set Icon and Icon color under My defaults. An admin can do the same under Server for everyone. A folder default wins over these, and a host's own icon wins over all of them. New hosts follow the default too.
- The picker has four tabs: Icons for general icons, Brands for logos such as Ubuntu, Proxmox or Docker, Text and Uploaded. Searching looks in the first two and in the names of uploaded icons, so typing k8s finds the Kubernetes logo from either tab. Brand logos are one color, so they follow the icon color.
- In the Text tab, type a Label of 1 to 4 characters, such as DB, and pick a style: Frame (the label in a rounded frame), Plate (the label on a filled plate) or Plain (just the text). The icon color applies to the text. Text icons already used on a host or in a rule are listed under Already in use, to pick again with one click.
- Pick No icon to remove the icon.
- Choose how icons show under Settings, Host Icons, Icon position: large and left of the host (the default), small before the name, or small after the name. Each user picks their own.
- Icon size in the same place makes icons bigger or smaller, from 50% to 150%.
- With large icons, only hosts that have an icon move over. Turn off Indent only hosts with an icon in the same place to give the others an empty space, so all names line up.

Only people who can edit a host can change its icon. People it is shared with see the owner's icon.

## Your own icons

The Uploaded tab of the picker holds a library of SVG and PNG icons. The library is shared: everyone who can see a host sees the same icon, and everyone can pick from it.

- Choose Upload icon, pick an SVG or PNG file and give it a name. Turn on Monochrome icon for a one-color icon: with no color chosen it is drawn in the theme color, like the built-in icons. Leave it off to keep the colors of the file. Then choose Add to library. Choosing a color for a host paints any uploaded icon in that color.
- Choose Manage to rename or delete icons you may change. Deleting an icon takes it away from everyone: hosts that use it show the fallback icon.
- Uploaded icons can also be used in automatic icon rules.

Two permissions in Termix say who may do what. Upload icons (admins and users by default) adds icons and lets you rename or delete your own. Manage uploaded icons (admins by default) lets you rename or delete anyone's. Everyone who is signed in can see and use the library.

On a linked Termix desktop the icons you uploaded sync along with your hosts, in both directions: an icon added on the desktop reaches the server, if you may upload icons there. Icons other people uploaded do not sync, because Termix syncs each user's own data, so a host that uses someone else's icon shows the fallback icon on the desktop while it is offline.

Limits: an SVG may be 100 KB after cleaning and a PNG 256 KB and 512 by 512 pixels at most. A name has 1 to 64 characters. The library holds up to 500 icons and 10 MB in all. SVG files are cleaned when you upload them: scripts, styles, images and links to other files are removed, so an icon that relies on them may look different. PNG files are shown as they are.

## Rules

Rules give icons to hosts by tag or by name, so you do not have to pick one host by host. They are yours only: other people do not see your rules, and the rules only change what you see in your own Hosts list. Add them under Settings, Host Icons, Automatic icons.

Each rule is a row of the table, with:

- A **Match**: **Tag** (the host has this tag, the whole tag, any letter case) or **Name contains** (part of the host name, any letter case), and its **Text**. For a tag, the Text box suggests the tags your hosts already have as you type: pick one with the mouse, or with the arrow keys and Enter. A rule with no text never matches.
- An **Icon**, and a **Color**. Pick **Host's own icon** in the icon picker, which shows as an empty dashed tile, to set only a color on a host that already has an icon. A rule with neither an icon nor a color does nothing.
- **Priority**, off by default: the rule takes priority over the host's own icon.

The rules are tried from the top and the first rule that applies to a host wins. Drag the handle at the start of a row to reorder them, or focus the handle and press Alt with the Up or Down arrow key. Changes show in the Hosts list as soon as you save your settings.

What "applies" means:

- A rule without priority only fills in what the host has not got. An icon rule applies to a host with no icon; a color rule (no icon) applies to a host that has an icon but no color. A host's own icon and color, and ones from a folder, user or server default, are never changed. A rule that does not apply is skipped, so a rule further down can still apply.
- A rule with priority applies even to a host that has an icon or a color. It replaces the icon (or only the color, for a color rule), whether the host's icon is its own or comes from a default. A color rule never applies to a host with no icon.
- If an icon rule with priority has no color, the host's own color stays.

The Change icon dialog shows a note under the icon when a rule applies to the host.

Limits of rules: Termix does not tell Host Icons whether an icon is the host's own or inherited, so a host cannot be excepted from a rule with priority. For a rule without priority, a host with no icon cannot opt out either: an empty icon means no icon, so pick an icon for that host to stop the rules from giving it one. A rule whose icon was removed from a later version of the plugin is skipped.

## If the icon does not show

- Check that Plugin badges is on under Customize sidebar, Row details.
- A host saved with an icon that this version does not know shows the Server icon until you pick another one.

## Limits

Termix lets plugins add badges after the host name. Host Icons moves its badge to the left with CSS that follows the Classic Layout's markup; if a Classic Layout update changes that markup, the large icon shows small before the name until Host Icons catches up. Some logos that are mostly lettering (such as Cisco or VMware) are not offered any more because they are unreadable when small; hosts that already use them keep them. Brand logos are single color shapes, not the full color logos, and they are trademarks of their owners; the Brands pack covers common software and hardware, not every brand.
