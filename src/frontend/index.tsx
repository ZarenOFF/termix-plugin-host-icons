import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import "./host-icons.css";
import { BADGE_ID, BADGE_ORDER, createHostIconBadge } from "./badge";
import {
  ChangeIconMenuIcon,
  MENU_ITEM_ID,
  OVERLAY_ACTION_ID,
  OVERLAY_SLOT,
  canChangeIcon,
  createChangeIconOverlay,
  createPickerState,
} from "./change-icon";
import { library } from "./library";
import { createPreferences, createPreferencesSync } from "./preferences";
import { usedIcons, usedTextIcons } from "./used-text";
import { RULES_FIELD_COMPONENT, RulesField } from "./rules-editor";
import {
  BADGE_COLOR_FIELD_COMPONENT,
  BADGE_FIELD_COMPONENT,
  BadgeColorField,
  BadgeField,
  COLOR_FIELD_COMPONENT,
  ColorField,
  ICON_FIELD_COMPONENT,
  LIBRARY_FIELD_COMPONENT,
  LibraryField,
  IconField,
  SIZE_FIELD_COMPONENT,
  SizeField,
  FOLDER_SIZE_FIELD_COMPONENT,
  FolderSizeField,
} from "./settings";
import { HELP_FIELD_COMPONENT, HelpField } from "./help";

export const PREFERENCES_ACTION_ID = "host-icons.preferences";

export function activate(app: TermixApp): void {
  app.registerSettingsComponent(ICON_FIELD_COMPONENT, IconField);
  app.registerSettingsComponent(COLOR_FIELD_COMPONENT, ColorField);
  app.registerSettingsComponent(BADGE_FIELD_COMPONENT, BadgeField);
  app.registerSettingsComponent(BADGE_COLOR_FIELD_COMPONENT, BadgeColorField);
  app.registerSettingsComponent(RULES_FIELD_COMPONENT, RulesField);
  app.registerSettingsComponent(SIZE_FIELD_COMPONENT, SizeField);
  app.registerSettingsComponent(FOLDER_SIZE_FIELD_COMPONENT, FolderSizeField);
  app.registerSettingsComponent(LIBRARY_FIELD_COMPONENT, LibraryField);
  app.registerSettingsComponent(HELP_FIELD_COMPONENT, HelpField);

  const preferences = createPreferences();
  app.registerSlotContribution(OVERLAY_SLOT, {
    actionId: PREFERENCES_ACTION_ID,
    titleKey: "settings.user.position.label",
    kind: "component",
    component: createPreferencesSync(preferences),
  });
  app.registerHostBadge({
    id: BADGE_ID,
    when: () => true,
    component: createHostIconBadge(preferences),
    order: BADGE_ORDER,
  });

  const picker = createPickerState();
  app.registerSlotContribution(OVERLAY_SLOT, {
    actionId: OVERLAY_ACTION_ID,
    titleKey: "menu.changeIcon",
    kind: "component",
    component: createChangeIconOverlay(picker, preferences),
  });
  app.registerHostContextMenuItem({
    id: MENU_ITEM_ID,
    titleKey: "menu.changeIcon",
    icon: ChangeIconMenuIcon,
    when: canChangeIcon,
    run: (host) => picker.open(host.id),
  });
  app.registerPaletteEntry({
    id: MENU_ITEM_ID,
    titleKey: "menu.changeIcon",
    icon: ChangeIconMenuIcon,
    keywords: ["icon", "color"],
    scope: "host",
    when: (host) => host !== undefined && canChangeIcon(host),
    run: (_shell, host) => {
      if (host) picker.open(host.id);
    },
  });
  app.onDispose(picker.close);
  app.onDispose(library.reset);
  app.onDispose(usedTextIcons.reset);
  app.onDispose(usedIcons.reset);
}
