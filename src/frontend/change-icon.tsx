import { useEffect, useState, useSyncExternalStore } from "react";
import {
  notifyHostsChanged,
  useHost,
  useSettings,
  useToast,
  useTranslation,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PluginIcon,
} from "@termix-ssh/plugin-sdk/ui";
import { ColorPicker, IconPicker, IconPreview } from "./IconPicker";
import {
  BADGE_COLOR_KEY,
  BADGE_KEY,
  COLOR_KEY,
  ICON_KEY,
  PLUGIN_ID,
  normalizeColor,
  parseBadge,
} from "./icons";
import { BadgeEditor } from "./layers";
import { useLibrary } from "./library";
import { useIconLayout, type Preferences } from "./preferences";
import { resolveAppearance } from "./rules";

export const MENU_ITEM_ID = "change-icon";
export const OVERLAY_ACTION_ID = `${PLUGIN_ID}.change-icon`;
export const OVERLAY_SLOT = "shell.overlay";

/**
 * Which host the "Change icon" dialog is open for. A context menu item only
 * gets a run callback, so it sets this and the dialog, mounted once at the
 * root of the app through the shell.overlay slot, reads it.
 */
export interface PickerState {
  get: () => string | null;
  open: (hostId: string) => void;
  close: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPickerState(): PickerState {
  let hostId: string | null = null;
  const listeners = new Set<() => void>();
  const set = (next: string | null) => {
    hostId = next;
    for (const listener of listeners) listener();
  };
  return {
    get: () => hostId,
    open: (id) => set(id),
    close: () => set(null),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Hosts the user may change settings on. Core checks again on save; this
 * only keeps the item out of menus where it would fail.
 */
export function canChangeIcon(host: PluginHostRecord): boolean {
  if (host.sharedCopy || host.quickConnectLogin) return false;
  if (!host.isShared) return true;
  return host.permissionLevel === "edit" || host.permissionLevel === "manage";
}

export function ChangeIconMenuIcon({ className }: { className?: string }) {
  return <PluginIcon name="Palette" className={className} />;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

function ChangeIconDialog({
  hostId,
  preferences,
  onClose,
}: {
  hostId: string;
  preferences: Preferences;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const host = useHost(hostId);
  const settings = useSettings("host", hostId);
  const { rules } = useIconLayout(preferences);
  // The preview resolves uploaded icons through the library.
  useLibrary();
  const current = host?.pluginSettings?.[PLUGIN_ID] ?? {};
  const [icon, setIcon] = useState(text(current[ICON_KEY]));
  const [color, setColor] = useState(text(current[COLOR_KEY]));
  const [badge, setBadge] = useState(text(current[BADGE_KEY]));
  const [badgeColor, setBadgeColor] = useState(text(current[BADGE_COLOR_KEY]));
  // Keys to hand back to the folder, user or server default on Save.
  const [inherit, setInherit] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // The shell's host list can arrive after the dialog opens.
  const loadedIcon = text(current[ICON_KEY]);
  const loadedColor = text(current[COLOR_KEY]);
  const loadedBadge = text(current[BADGE_KEY]);
  const loadedBadgeColor = text(current[BADGE_COLOR_KEY]);
  useEffect(() => {
    setIcon(loadedIcon);
    setColor(loadedColor);
    setBadge(loadedBadge);
    setBadgeColor(loadedBadgeColor);
  }, [hostId, loadedIcon, loadedColor, loadedBadge, loadedBadgeColor]);

  // What the Hosts list will draw for this host with what is picked now,
  // and the rule that changed it, if one did.
  const { resolved, rule } = host
    ? resolveAppearance(
        {
          ...host,
          pluginSettings: {
            ...host.pluginSettings,
            [PLUGIN_ID]: {
              [ICON_KEY]: icon,
              [COLOR_KEY]: color,
              [BADGE_KEY]: badge,
              [BADGE_COLOR_KEY]: badgeColor,
            },
          },
        },
        rules,
      )
    : { resolved: null, rule: null };
  const ruleName = rule
    ? t(rule.match === "tag" ? "rules.summary.tag" : "rules.summary.name", {
        value: rule.value,
      })
    : "";
  // Layers are drawn on a base icon, from the host or from a rule.
  const hasBase = (resolved?.icon.id ?? "") !== "";
  const ruleGivesIcon = rule !== null && rule.icon !== "" && icon === "";

  const follow = (key: string) =>
    setInherit((keys) => (keys.includes(key) ? keys : [...keys, key]));
  const own = (key: string) =>
    setInherit((keys) => keys.filter((other) => other !== key));

  // The host record holds resolved values, so an untouched field may be a
  // folder or user default. Sending it back would pin it to this host.
  const changes = () => {
    const values: Record<string, unknown> = {};
    if (inherit.length > 0) values._inherit = inherit;
    if (!inherit.includes(ICON_KEY) && icon !== loadedIcon)
      values[ICON_KEY] = icon;
    const nextColor = normalizeColor(color) ?? "";
    if (
      !inherit.includes(COLOR_KEY) &&
      nextColor !== (normalizeColor(loadedColor) ?? "")
    )
      values[COLOR_KEY] = nextColor;
    // The badge compares by what it parses to, so a stored value that is
    // not valid counts as empty like the host list reads it.
    const nextBadge = parseBadge(badge)?.id ?? "";
    if (
      !inherit.includes(BADGE_KEY) &&
      nextBadge !== (parseBadge(loadedBadge)?.id ?? "")
    )
      values[BADGE_KEY] = nextBadge;
    const nextBadgeColor = normalizeColor(badgeColor) ?? "";
    if (
      !inherit.includes(BADGE_COLOR_KEY) &&
      nextBadgeColor !== (normalizeColor(loadedBadgeColor) ?? "")
    )
      values[BADGE_COLOR_KEY] = nextBadgeColor;
    return values;
  };

  const defaultToggle = (key: string, label: string) =>
    inherit.includes(key) ? (
      <span className="text-xs text-muted-foreground">
        {t("dialog.followsDefault")}
      </span>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={saving}
        aria-label={label}
        onClick={() => follow(key)}
        className="h-7 px-2 text-xs"
      >
        {t("dialog.useDefault")}
      </Button>
    );

  const write = async (values: Record<string, unknown>) => {
    if (Object.keys(values).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await settings.save(values);
      notifyHostsChanged();
      toast.success(t("dialog.saved"));
      onClose();
    } catch {
      toast.error(t("dialog.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-host-icons-dialog="">
        <DialogHeader>
          <DialogTitle>
            {t("dialog.title", { name: host?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 min-w-0 max-h-[65vh] overflow-y-auto pr-1">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <IconPreview
              value={resolved?.icon.id ?? ""}
              color={resolved?.color}
              badge={hasBase ? badge : ""}
              badgeColor={badgeColor}
            />
            {defaultToggle(ICON_KEY, t("dialog.useDefaultIcon"))}
          </div>
          {rule && (
            <p className="text-xs text-muted-foreground">
              {t(
                ruleGivesIcon ? "dialog.ruleNote" : "dialog.ruleOverrideNote",
                {
                  rule: ruleName,
                },
              )}
            </p>
          )}
          <IconPicker
            value={icon}
            color={color}
            disabled={saving}
            onChange={(id) => {
              own(ICON_KEY);
              setIcon(id);
            }}
          />
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-sm font-medium">
              {t("settings.host.color.label")}
            </span>
            {defaultToggle(COLOR_KEY, t("dialog.useDefaultColor"))}
          </div>
          <ColorPicker
            value={color}
            icon={hasBase ? resolved!.icon : null}
            disabled={saving}
            onChange={(next) => {
              own(COLOR_KEY);
              setColor(next);
            }}
          />
          <div className="flex flex-col gap-3 min-w-0 border-t border-border pt-3">
            <span className="text-sm font-medium">{t("layers.title")}</span>
            {!hasBase && (
              <p className="text-xs text-muted-foreground">
                {t("layers.needIcon")}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-xs">{t("dialog.badge")}</span>
              {defaultToggle(BADGE_KEY, t("dialog.useDefaultBadge"))}
            </div>
            <BadgeEditor
              value={badge}
              disabled={saving || !hasBase}
              onChange={(next) => {
                own(BADGE_KEY);
                setBadge(next);
              }}
            />
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-xs">{t("dialog.badgeColor")}</span>
              {defaultToggle(BADGE_COLOR_KEY, t("dialog.useDefaultBadgeColor"))}
            </div>
            <ColorPicker
              value={badgeColor}
              disabled={saving || !hasBase}
              themeLabel={t("layers.badgeThemeColor")}
              onChange={(next) => {
                own(BADGE_COLOR_KEY);
                setBadgeColor(next);
              }}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            {t("dialog.cancel")}
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void write(changes())}
          >
            {t("dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function createChangeIconOverlay(
  state: PickerState,
  preferences: Preferences,
) {
  return function ChangeIconOverlay() {
    const hostId = useSyncExternalStore(state.subscribe, state.get, state.get);
    if (!hostId) return null;
    return (
      <ChangeIconDialog
        key={hostId}
        hostId={hostId}
        preferences={preferences}
        onClose={state.close}
      />
    );
  };
}
