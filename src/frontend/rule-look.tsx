import { useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@termix-ssh/plugin-sdk/ui";
import { AppearanceEditor, type Appearance } from "./appearance-editor";
import { LayeredIcon } from "./LayeredIcon";
import {
  findIcon,
  iconLabel,
  isCustomIcon,
  normalizeColor,
  parseBadge,
  readLayers,
  type LucideIconDef,
} from "./icons";
import type { IconRule } from "./rules";

/**
 * Stands for "the host's own icon" where a rule gives none, so the rule's
 * color and badge still show on something. A dashed square, never stored and
 * never in a picker.
 */
export const OWN_ICON_PLACEHOLDER: LucideIconDef = {
  id: "__own-icon",
  lucide: "SquareDashed",
  group: "other",
};

/** The four stored values of a rule's look, as the editor edits them. */
function lookOf(rule: IconRule): Appearance {
  return {
    icon: rule.icon,
    color: rule.color,
    badge: rule.badge,
    badgeColor: rule.badgeColor,
  };
}

/**
 * What a rule's icon, color and badge make together, as the Hosts list draws
 * them. `size` is a Tailwind size class.
 */
function LookIcon({ look, size }: { look: Appearance; size?: string }) {
  const icon = findIcon(look.icon) ?? OWN_ICON_PLACEHOLDER;
  const layers = readLayers({
    badge: look.badge,
    badgeColor: look.badgeColor,
  });
  return (
    <LayeredIcon
      icon={icon}
      color={normalizeColor(look.color)}
      badge={layers.badge}
      badgeColor={layers.badgeColor}
      className={size}
    />
  );
}

/**
 * The Look cell of a rule: one button showing the rule's icon, color and
 * badge together, which opens a dialog to change them. The dialog keeps a
 * draft; Save writes it into the rule, closing it any other way discards it.
 */
export function RuleLook({
  rule,
  n,
  tile,
  disabled,
  onChange,
}: {
  rule: IconRule;
  n: number;
  /** Classes of the button. */
  tile: string;
  disabled: boolean;
  onChange: (patch: Partial<IconRule>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasIcon = findIcon(rule.icon) !== undefined;
  const label = t("rules.lookLabel", { n });
  return (
    <>
      {/* Always the same Tooltip around the button, so getting an icon does
          not remount it and drop keyboard focus; only the tip comes and goes. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title={hasIcon ? label : undefined}
            disabled={disabled}
            data-testid="rule-look"
            data-look-icon={rule.icon}
            className={`${tile} ${hasIcon ? "" : "border-dashed"}`}
            onClick={() => setOpen(true)}
          >
            <LookIcon look={lookOf(rule)} size="size-5" />
          </button>
        </TooltipTrigger>
        {!hasIcon && <TooltipContent>{t("rules.noIconTip")}</TooltipContent>}
      </Tooltip>
      {open && (
        <RuleLookDialog
          rule={rule}
          n={n}
          onClose={() => setOpen(false)}
          onSave={(patch) => {
            if (Object.keys(patch).length > 0) onChange(patch);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function RuleLookDialog({
  rule,
  n,
  onClose,
  onSave,
}: {
  rule: IconRule;
  n: number;
  onClose: () => void;
  onSave: (patch: Partial<IconRule>) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Appearance>(() => lookOf(rule));
  const icon = findIcon(draft.icon);

  // Only what changed, with colors and the badge as they are stored.
  const save = () => {
    const was = lookOf(rule);
    const patch: Partial<IconRule> = {};
    if (draft.icon !== was.icon) patch.icon = draft.icon;
    const color = normalizeColor(draft.color) ?? "";
    if (color !== (normalizeColor(was.color) ?? "")) patch.color = color;
    const badge = parseBadge(draft.badge)?.id ?? "";
    if (badge !== (parseBadge(was.badge)?.id ?? "")) patch.badge = badge;
    // A rule without a badge keeps no badge color either.
    const badgeColor =
      badge === "" ? "" : (normalizeColor(draft.badgeColor) ?? "");
    if (badgeColor !== (normalizeColor(was.badgeColor) ?? ""))
      patch.badgeColor = badgeColor;
    onSave(patch);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* The dialog is portaled, but React still bubbles its events to the
          rule row, whose drag handlers would react to drags over the dialog. */}
      <DialogContent
        className="sm:max-w-lg"
        data-host-icons-dialog=""
        onDragOver={(event) => event.stopPropagation()}
        onDrop={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{t("rules.lookTitle", { n })}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("rules.lookDescription")}
          </DialogDescription>
        </DialogHeader>
        <AppearanceEditor
          value={draft}
          noneLabel={t("rules.hostOwnIcon")}
          colorIcon={icon ?? null}
          preview={
            <span className="flex items-center gap-2 text-xs">
              <span data-host-icons-actual className="flex">
                <LookIcon look={draft} />
              </span>
              {icon === undefined
                ? t("rules.hostOwnIcon")
                : isCustomIcon(icon) && icon.pending
                  ? null
                  : iconLabel(icon, t)}
            </span>
          }
          onChange={(patch) => setDraft((was) => ({ ...was, ...patch }))}
          onSave={save}
        />
      </DialogContent>
    </Dialog>
  );
}
