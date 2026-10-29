import { useId, type ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Input, PluginIcon } from "@termix-ssh/plugin-sdk/ui";
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

/**
 * The summary of a badge as the disclosure button says it: None, Dot or the
 * label. A stored value that does not parse counts as none, like the list.
 */
export function useBadgeSummary(value: string): string {
  const { t } = useTranslation();
  const parsed = parseBadge(value);
  if (parsed === null) return t("layers.badgeNone");
  return parsed.kind === "dot" ? t("layers.badgeDot") : parsed.text;
}

/**
 * A "Badge: <summary>" button that opens its content below with a short
 * animation (data-host-icons-collapse in host-icons.css). Shared by the
 * Change icon dialog and the host editor, which differ in what is inside.
 */
export function BadgeDisclosure({
  summary,
  open,
  onToggle,
  disabled = false,
  children,
}: {
  summary: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={onToggle}
        className="flex items-center justify-between gap-2 min-w-0 h-8 px-2 border border-border text-xs text-left transition-colors hover:border-muted-foreground disabled:opacity-50"
      >
        <span className="truncate">{t("dialog.badge", { summary })}</span>
        <PluginIcon
          name="ChevronDown"
          aria-hidden
          className={`size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        id={panelId}
        data-testid="badge-panel"
        data-host-icons-collapse=""
        data-open={open ? "true" : "false"}
      >
        <div className="flex flex-col gap-2 min-w-0 pt-2">{children}</div>
      </div>
    </>
  );
}
