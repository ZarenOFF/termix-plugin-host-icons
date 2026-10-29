import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  useTranslation,
  type SettingsComponentProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, Input } from "@termix-ssh/plugin-sdk/ui";
import { ColorPicker, IconPicker, IconPreview } from "./IconPicker";
import {
  BADGE_COLOR_KEY,
  BADGE_KEY,
  COLOR_KEY,
  ICON_KEY,
  findIcon,
} from "./icons";
import { useLibrary } from "./library";
import { BadgeDisclosure, BadgeEditor, useBadgeSummary } from "./layers";
import { ManageDialog, useCanManageLibrary } from "./uploaded";
import {
  DEFAULT_SIZE,
  MAX_SIZE,
  MIN_SIZE,
  SIZE_KEY,
  normalizeSize,
} from "./preferences";

/** Component ids, as manifest.json names them on the custom fields. */
export const ICON_FIELD_COMPONENT = "icon-picker";
export const COLOR_FIELD_COMPONENT = "icon-color";
export const SIZE_FIELD_COMPONENT = "icon-size";
export const BADGE_FIELD_COMPONENT = "icon-badge";
export const BADGE_COLOR_FIELD_COMPONENT = "icon-badge-color";
export const LIBRARY_FIELD_COMPONENT = "icon-library";

const text = (value: unknown) => (typeof value === "string" ? value : "");

// A custom field draws its own label, so this copies the row core draws for
// its own fields.
export function FieldRow({
  label,
  description,
  children,
  divider = true,
}: {
  label: string;
  description: string;
  children: ReactNode;
  /** The line under the row; off for a row whose next one can be hidden. */
  divider?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 py-3 min-w-0 ${divider ? "border-b border-border last:border-0" : ""}`}
    >
      <span className="text-sm font-medium leading-snug">{label}</span>
      <span className="text-xs text-muted-foreground leading-snug">
        {description}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// The editor is laid out like the Change icon dialog: the picker at a fixed
// height, the preview in a row below it, a compact color row, and the badge
// as a disclosure under the color. Core draws one field per key, in manifest
// order (icon, color, badge, badge color), so each part is its own component
// and a key keeps core's own Use default; see AGENTS.md.
export function IconField({
  values,
  setValue,
  running,
}: SettingsComponentProps) {
  const { t } = useTranslation();
  const icon = text(values[ICON_KEY]);
  const color = text(values[COLOR_KEY]);
  return (
    <FieldRow
      label={t("settings.host.icon.label")}
      description={t("settings.host.icon.description")}
    >
      <div className="flex flex-col gap-3 min-w-0">
        <IconPicker
          value={icon}
          color={color}
          disabled={!running}
          listHeight={340}
          onChange={(id) => setValue(ICON_KEY, id)}
        />
        <div
          data-testid="field-preview"
          className="flex items-center gap-1 min-w-0 border-t border-border pt-3"
        >
          <IconPreview
            value={icon}
            color={color}
            badge={text(values[BADGE_KEY])}
            badgeColor={text(values[BADGE_COLOR_KEY])}
          />
        </div>
      </div>
    </FieldRow>
  );
}

// Core draws the badge and the badge color as two fields, but the color only
// matters while the Badge disclosure is open, so BadgeField publishes its open
// state here and BadgeColorField opens and closes with it.
let badgeOpen = false;
const badgeListeners = new Set<() => void>();
function setBadgeOpen(next: boolean) {
  if (badgeOpen === next) return;
  badgeOpen = next;
  badgeListeners.forEach((listener) => listener());
}
const subscribeBadgeOpen = (listener: () => void) => {
  badgeListeners.add(listener);
  return () => {
    badgeListeners.delete(listener);
  };
};
const readBadgeOpen = () => badgeOpen;
const useBadgeOpen = () =>
  useSyncExternalStore(subscribeBadgeOpen, readBadgeOpen, () => false);

/** A field that holds one color, under its own key and texts. */
function ColorKeyField(
  key: string,
  textKey: string,
  forIcon: boolean,
): (props: SettingsComponentProps) => ReactNode {
  return function ColorKeyFieldComponent({
    values,
    setValue,
    running,
  }: SettingsComponentProps) {
    const { t } = useTranslation();
    useLibrary();
    // The icon of the same scope: this host, or the default being edited.
    const icon = forIcon ? findIcon(text(values[ICON_KEY])) : undefined;
    const open = useBadgeOpen();
    const row = (
      <FieldRow
        label={t(`settings.host.${textKey}.label`)}
        description={t(`settings.host.${textKey}.description`)}
      >
        <ColorPicker
          compact
          value={text(values[key])}
          disabled={!running}
          icon={icon ?? null}
          themeLabel={forIcon ? undefined : t("picker.themeColor")}
          onChange={(color) => setValue(key, color)}
        />
      </FieldRow>
    );
    if (forIcon) return row;
    // The badge color follows the Badge disclosure above it.
    return (
      <div
        data-testid="badge-color-field"
        data-host-icons-collapse=""
        data-open={open ? "true" : "false"}
      >
        <div>{row}</div>
      </div>
    );
  };
}

export const ColorField = ColorKeyField(COLOR_KEY, "color", true);
/** The corner badge's circle: a color, or empty for the theme chip. */
export const BadgeColorField = ColorKeyField(
  BADGE_COLOR_KEY,
  "badgeColor",
  false,
);

/**
 * The corner badge, as the same disclosure the Change icon dialog has. It
 * starts open when the host (or the default being edited) has a badge.
 */
export function BadgeField({
  values,
  setValue,
  running,
}: SettingsComponentProps) {
  const { t } = useTranslation();
  const badge = text(values[BADGE_KEY]);
  const summary = useBadgeSummary(badge);
  const [open, setOpen] = useState(() => badge !== "");
  // Before paint, so a field that starts open does not animate from closed.
  useLayoutEffect(() => {
    setBadgeOpen(open);
  }, [open]);
  useLayoutEffect(() => () => setBadgeOpen(false), []);
  return (
    // No line under Badge: Badge color below it is hidden while it is closed,
    // and a line would then end the section.
    <FieldRow
      label={t("settings.host.badge.label")}
      description={t("settings.host.badge.description")}
      divider={false}
    >
      <div className="flex flex-col min-w-0">
        <BadgeDisclosure
          summary={summary}
          open={open}
          onToggle={() => setOpen((value) => !value)}
        >
          <BadgeEditor
            value={badge}
            disabled={!running}
            onChange={(next) => setValue(BADGE_KEY, next)}
          />
        </BadgeDisclosure>
      </div>
    </FieldRow>
  );
}

/**
 * Core's number field is full width with no unit, so Icon size draws its
 * own: a narrow box with a % after it. Typing is free; leaving the box puts
 * the value back inside 50-150, which is also how it is read.
 */
export function SizeField({
  values,
  setValue,
  running,
}: SettingsComponentProps) {
  const { t } = useTranslation();
  const stored = values[SIZE_KEY];
  const size = normalizeSize(stored);
  const [draft, setDraft] = useState(String(size));
  // While the box has focus the draft is the user's: what they typed so far
  // may be out of bounds ("8" on the way to "80") and must not be replaced.
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(String(size));
  }, [size]);
  return (
    <FieldRow
      label={t("settings.user.size.label")}
      description={t("settings.user.size.description")}
    >
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min={MIN_SIZE}
          max={MAX_SIZE}
          step={5}
          value={draft}
          disabled={!running}
          aria-label={t("settings.user.size.label")}
          onFocus={() => {
            editing.current = true;
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            if (/^\d+$/.test(event.target.value))
              setValue(SIZE_KEY, Number(event.target.value));
          }}
          onBlur={() => {
            editing.current = false;
            const next = /^\d+$/.test(draft) ? normalizeSize(draft) : size;
            setDraft(String(next));
            // Leave an unset or unchanged value alone, so passing through the
            // box doesn't change the form.
            const unchanged =
              next === stored ||
              (stored === undefined && next === DEFAULT_SIZE);
            if (!unchanged) setValue(SIZE_KEY, next);
          }}
          className="h-8 w-20 text-xs"
        />
        <span className="text-xs text-muted-foreground">
          {t("settings.user.size.unit")}
        </span>
      </div>
    </FieldRow>
  );
}

/**
 * A button that opens the manager of uploaded icons, for users who may add
 * or change some. Draws nothing for anyone else.
 */
export function LibraryField() {
  const { t } = useTranslation();
  const allowed = useCanManageLibrary();
  const [open, setOpen] = useState(false);
  if (!allowed) return null;
  return (
    <FieldRow
      label={t("settings.user.library.label")}
      description={t("settings.user.library.description")}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 px-3 text-xs"
      >
        {t("custom.manageSettings")}
      </Button>
      {open && <ManageDialog open onClose={() => setOpen(false)} />}
    </FieldRow>
  );
}
