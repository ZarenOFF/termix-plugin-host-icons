# Changelog

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
