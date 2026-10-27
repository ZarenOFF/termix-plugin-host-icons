import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  useTranslation,
  type SettingsComponentProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { Input } from "@termix-ssh/plugin-sdk/ui";
import { ColorPicker, IconPicker, IconPreview } from "./IconPicker";
import { COLOR_KEY, ICON_KEY } from "./icons";
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

const text = (value: unknown) => (typeof value === "string" ? value : "");

// A custom field draws its own label, so this copies the row core draws for
// its own fields.
export function FieldRow({
  label,
  description,
  aside,
  children,
}: {
  label: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-border last:border-0 min-w-0">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-sm font-medium leading-snug">{label}</span>
        {aside}
      </div>
      <span className="text-xs text-muted-foreground leading-snug">
        {description}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

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
      aside={<IconPreview value={icon} color={color} />}
    >
      <IconPicker
        value={icon}
        color={color}
        disabled={!running}
        onChange={(id) => setValue(ICON_KEY, id)}
      />
    </FieldRow>
  );
}

export function ColorField({
  values,
  setValue,
  running,
}: SettingsComponentProps) {
  const { t } = useTranslation();
  return (
    <FieldRow
      label={t("settings.host.color.label")}
      description={t("settings.host.color.description")}
    >
      <ColorPicker
        value={text(values[COLOR_KEY])}
        disabled={!running}
        onChange={(color) => setValue(COLOR_KEY, color)}
      />
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
