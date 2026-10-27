import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { HexColorPicker, Input, Segmented } from "@termix-ssh/plugin-sdk/ui";
import { HostIcon } from "./HostIcon";
import {
  BRAND_GROUPS,
  FALLBACK_ICON_ID,
  ICON_GROUPS,
  findIcon,
  iconLabel,
  isBrandIcon,
  normalizeColor,
  searchBrands,
  searchIcons,
  type HostIconDef,
} from "./icons";

type Pack = "icons" | "brands";

function packOf(value: string): Pack | null {
  const current = findIcon(value);
  if (!current) return null;
  return isBrandIcon(current) ? "brands" : "icons";
}

const TILE =
  "flex items-center justify-center h-9 border transition-colors disabled:opacity-50 disabled:pointer-events-none";
const TILE_ON = "border-accent-brand/50 bg-accent-brand/10 text-foreground";
const TILE_OFF =
  "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground";

/**
 * A switch between the two packs (Lucide icons and brand logos), a search box
 * and a grid, with a "No icon" tile first. `value` is the stored icon id; an
 * empty string means no icon. The pack opens on the one the value is from.
 * A search looks through both packs, whichever is shown.
 */
export function IconPicker({
  value,
  color,
  onChange,
  disabled = false,
  noneLabel,
}: {
  value: string;
  color?: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Text of the first tile, "No icon" unless the caller says otherwise. */
  noneLabel?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [pack, setPack] = useState<Pack>(() => packOf(value) ?? "icons");
  // The host list can arrive after the dialog opens, so `value` may change
  // from empty to a brand id. Follow a change that moves to the other pack,
  // and leave the user's own tab choice alone otherwise.
  const valuePack = useRef<Pack>(packOf(value) ?? "icons");
  useEffect(() => {
    const next = packOf(value);
    if (next && next !== valuePack.current) setPack(next);
    if (next) valuePack.current = next;
  }, [value]);
  const label = (icon: HostIconDef) => iconLabel(icon, t);
  const tint = normalizeColor(color);
  const unknown = value !== "" && !findIcon(value);
  const lucide = searchIcons(query, label);
  const brands = searchBrands(query);
  const searching = query.trim() !== "";

  const tile = (icon: HostIconDef) => {
    const selected = value === icon.id;
    return (
      <button
        key={icon.id}
        type="button"
        title={label(icon)}
        aria-label={label(icon)}
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => onChange(icon.id)}
        className={`${TILE} ${selected ? TILE_ON : TILE_OFF}`}
      >
        <HostIcon
          icon={icon}
          color={selected ? tint : null}
          className="size-4"
        />
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <Segmented<Pack>
        value={pack}
        onChange={setPack}
        options={[
          { value: "icons", label: t("picker.packIcons") },
          { value: "brands", label: t("picker.packBrands") },
        ]}
        className="self-start"
      />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("picker.search")}
        aria-label={t("picker.search")}
        disabled={disabled}
        className="h-8 text-xs"
      />
      {unknown && (
        <p className="text-xs text-warning">
          {t("picker.unknown", {
            fallback: t(`icons.${FALLBACK_ICON_ID}`),
          })}
        </p>
      )}
      <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
        {!searching && (
          <div className="grid grid-cols-8 gap-1.5">
            <button
              type="button"
              aria-pressed={value === ""}
              disabled={disabled}
              onClick={() => onChange("")}
              className={`${TILE} col-span-2 text-[11px] ${value === "" ? TILE_ON : TILE_OFF}`}
            >
              {noneLabel ?? t("picker.none")}
            </button>
          </div>
        )}
        {searching ? (
          lucide.length + brands.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("picker.empty")}</p>
          ) : (
            <div className="grid grid-cols-8 gap-1.5">
              {[...lucide, ...brands].map(tile)}
            </div>
          )
        ) : pack === "brands" ? (
          BRAND_GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t(`brandGroups.${group}`)}
              </span>
              <div className="grid grid-cols-8 gap-1.5">
                {brands.filter((icon) => icon.group === group).map(tile)}
              </div>
            </div>
          ))
        ) : (
          ICON_GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t(`groups.${group}`)}
              </span>
              <div className="grid grid-cols-8 gap-1.5">
                {lucide.filter((icon) => icon.group === group).map(tile)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Termix's own folder color picker, plus a "Theme color" choice that clears
 * the value so the icon follows the text color.
 */
export function ColorPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const themed = normalizeColor(value) === null;
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2 min-w-0">
      <button
        type="button"
        aria-pressed={themed}
        onClick={() => onChange("")}
        className={`self-start h-7 px-2 border text-[11px] transition-colors ${themed ? TILE_ON : TILE_OFF}`}
      >
        {t("picker.themeColor")}
      </button>
      <HexColorPicker value={value} onChange={onChange} />
    </fieldset>
  );
}

/** The chosen icon, large, with its name: what the host row will show. */
export function IconPreview({
  value,
  color,
}: {
  value: string;
  color?: string | null;
}) {
  const { t } = useTranslation();
  if (!value) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("picker.noIconPreview")}
      </span>
    );
  }
  const icon = findIcon(value) ?? findIcon(FALLBACK_ICON_ID)!;
  return (
    <span className="flex items-center gap-2 text-xs">
      <HostIcon icon={icon} color={normalizeColor(color)} className="size-5" />
      {iconLabel(icon, t)}
    </span>
  );
}
