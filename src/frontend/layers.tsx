import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Input } from "@termix-ssh/plugin-sdk/ui";
import {
  BADGE_DOT_ID,
  badgeTextId,
  clampBadgeLabel,
  parseBadge,
} from "./icons";

const CHIP = "border text-[11px] transition-colors disabled:opacity-50";
const CHIP_ON = "border-accent-brand/50 bg-accent-brand/10 text-foreground";
const CHIP_OFF =
  "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground";

/**
 * The corner badge: a label of one or two characters, stored as
 * "text:<label>", or a plain dot, stored as "dot". Empty is no badge.
 */
export function BadgeEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (badge: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const badge = parseBadge(value);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={badge === null}
        onClick={() => onChange("")}
        className={`h-7 px-2 ${CHIP} ${badge === null ? CHIP_ON : CHIP_OFF}`}
      >
        {t("layers.badgeNone")}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={badge?.kind === "dot"}
        onClick={() => onChange(BADGE_DOT_ID)}
        className={`h-7 px-2 ${CHIP} ${badge?.kind === "dot" ? CHIP_ON : CHIP_OFF}`}
      >
        {t("layers.badgeDot")}
      </button>
      <Input
        value={badge?.kind === "text" ? badge.text : ""}
        disabled={disabled}
        placeholder={t("picker.badgePlaceholder")}
        aria-label={t("layers.badgeText")}
        onChange={(event) =>
          onChange(badgeTextId(clampBadgeLabel(event.target.value)) ?? "")
        }
        className="h-7 w-36 text-xs placeholder:text-muted-foreground/60"
      />
    </div>
  );
}
