import { useState, type ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import { ColorPicker, IconPicker } from "./IconPicker";
import { parseBadge, type HostIconDef } from "./icons";
import { BadgeDisclosure, BadgeEditor, useBadgeSummary } from "./layers";

/** What the editor changes: the four stored values, as typed. */
export interface Appearance {
  icon: string;
  color: string;
  badge: string;
  badgeColor: string;
}

/**
 * The body of the dialogs that edit how an icon looks: Change icon (for a
 * host) and the look of a rule. Top to bottom: the icon picker, a note, the
 * live preview, the icon color, the Badge section, and a footer with Save at
 * the bottom right. The caller owns the values, the preview (it knows what
 * the Hosts list will draw) and what Save does. Escape and the close button
 * belong to the dialog around it.
 */
export function AppearanceEditor({
  value,
  onChange,
  onSave,
  disabled = false,
  noneLabel,
  colorIcon,
  badgeBlocked = false,
  note,
  preview,
}: {
  value: Appearance;
  onChange: (patch: Partial<Appearance>) => void;
  onSave: () => void;
  disabled?: boolean;
  /** Text of the picker's first tile. */
  noneLabel?: string;
  /** The icon the color is for, which names the choice of no color. */
  colorIcon: HostIconDef | null;
  /** Shows the badge section but not editable, with a hint to pick an icon. */
  badgeBlocked?: boolean;
  note?: ReactNode;
  preview: ReactNode;
}) {
  const { t } = useTranslation();
  // The badge editor opens on a value that already has a badge.
  const [badgeOpen, setBadgeOpen] = useState(
    () => parseBadge(value.badge) !== null,
  );
  // The badge as the section's button says it, so a closed section still
  // tells what is set.
  const badgeSummary = useBadgeSummary(value.badge);
  return (
    <div className="flex flex-col gap-3 min-w-0 max-h-[80vh] overflow-y-auto p-1">
      <IconPicker
        value={value.icon}
        color={value.color}
        disabled={disabled}
        listHeight={340}
        noneLabel={noneLabel}
        onChange={(icon) => onChange({ icon })}
      />
      {note}
      <div
        data-testid="dialog-preview"
        className="flex items-center gap-1 min-w-0 border-t border-border pt-3"
      >
        {preview}
      </div>
      <section
        data-testid="color-section"
        className="flex flex-col gap-1.5 min-w-0"
      >
        <span className="text-xs">{t("settings.host.color.label")}</span>
        <ColorPicker
          compact
          value={value.color}
          icon={colorIcon}
          disabled={disabled}
          onChange={(color) => onChange({ color })}
        />
      </section>
      <section data-testid="badge-section" className="flex flex-col min-w-0">
        <BadgeDisclosure
          summary={badgeSummary}
          open={badgeOpen}
          onToggle={() => setBadgeOpen((open) => !open)}
          disabled={disabled}
        >
          {badgeBlocked && (
            <p className="text-xs text-muted-foreground">
              {t("layers.needIcon")}
            </p>
          )}
          <BadgeEditor
            value={value.badge}
            disabled={disabled || badgeBlocked}
            onChange={(badge) => onChange({ badge })}
          />
          <span className="text-xs">{t("dialog.badgeColor")}</span>
          <ColorPicker
            compact
            value={value.badgeColor}
            disabled={disabled || badgeBlocked}
            themeLabel={t("layers.badgeThemeColor")}
            onChange={(badgeColor) => onChange({ badgeColor })}
          />
        </BadgeDisclosure>
      </section>
      <div
        data-testid="dialog-footer"
        className="flex items-center justify-end border-t border-border pt-3"
      >
        <Button type="button" disabled={disabled} onClick={onSave}>
          {t("dialog.save")}
        </Button>
      </div>
    </div>
  );
}
