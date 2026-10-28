import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { HexColorPicker, Input, Segmented } from "@termix-ssh/plugin-sdk/ui";
import { HostIcon } from "./HostIcon";
import { useUsedTextIcons } from "./used-text";
import {
  BRAND_GROUPS,
  FALLBACK_ICON_ID,
  ICON_GROUPS,
  findIcon,
  iconLabel,
  isBrandIcon,
  isTextIcon,
  TEXT_STYLES,
  clampTextLabel,
  normalizeColor,
  parseTextIcon,
  textIconId,
  type TextIconDef,
  type TextIconStyle,
  isCustomIcon,
  searchBrands,
  searchCustomIcons,
  searchIcons,
  type HostIconDef,
} from "./icons";
import { useLibrary } from "./library";
import { UploadedPack } from "./uploaded";

type Pack = "icons" | "brands" | "text" | "custom";

function packOf(value: string): Pack | null {
  const current = findIcon(value);
  if (!current) return null;
  if (isTextIcon(current)) return "text";
  if (isCustomIcon(current)) return "custom";
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
  // Uploaded icons resolve through the library, which can change under us.
  const { icons: uploaded } = useLibrary();
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
  const [textLabel, setTextLabel] = useState(
    () => parseTextIcon(value)?.text ?? "",
  );
  const [textStyle, setTextStyle] = useState<TextIconStyle>(
    () => parseTextIcon(value)?.style ?? "frame",
  );
  // Follow a text id that arrives from outside, but keep what is being typed
  // (a trailing space, say) when the value is just the echo of it.
  useEffect(() => {
    const parsed = parseTextIcon(value);
    if (!parsed) return;
    setTextLabel((current) =>
      current.trim() === parsed.text ? current : parsed.text,
    );
    setTextStyle(parsed.style);
  }, [value]);
  const label = (icon: HostIconDef) => iconLabel(icon, t);
  const tint = normalizeColor(color);
  const unknown = value !== "" && !findIcon(value);
  const lucide = searchIcons(query, label);
  const brands = searchBrands(query);
  const custom = searchCustomIcons(query, uploaded);
  // A hidden logo is not offered, but a host that already has it must still
  // see it selected, in its own group.
  const current = findIcon(value);
  const hiddenCurrent =
    current && isBrandIcon(current) && current.hidden ? current : null;
  const textPack = pack === "text";
  const usedText = useUsedTextIcons()
    .map((id) => parseTextIcon(id))
    .filter((icon): icon is TextIconDef => icon !== undefined);
  const searching = !textPack && query.trim() !== "";

  const editText = (nextLabel: string, nextStyle: TextIconStyle) => {
    setTextLabel(nextLabel);
    setTextStyle(nextStyle);
    const id = textIconId(nextStyle, nextLabel);
    if (id) onChange(id);
  };
  const textPreview = parseTextIcon(textIconId(textStyle, textLabel) ?? "");

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
          { value: "text", label: t("picker.packText") },
          { value: "custom", label: t("picker.packCustom") },
        ]}
        className="self-start"
      />
      {!textPack && (
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("picker.search")}
          aria-label={t("picker.search")}
          disabled={disabled}
          className="h-8 text-xs"
        />
      )}
      {unknown && (
        <p className="text-xs text-warning">
          {t("picker.unknown", {
            fallback: t(`icons.${FALLBACK_ICON_ID}`),
          })}
        </p>
      )}
      {textPack ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Input
              value={textLabel}
              onChange={(event) =>
                editText(clampTextLabel(event.target.value), textStyle)
              }
              placeholder={t("picker.textPlaceholder")}
              aria-label={t("picker.textLabel")}
              disabled={disabled}
              className="h-8 text-xs w-36 placeholder:text-muted-foreground/60"
            />
            <span
              data-testid="text-icon-preview"
              className="flex items-center justify-center size-9 border border-border"
            >
              {textPreview && (
                <HostIcon icon={textPreview} color={tint} className="size-6" />
              )}
            </span>
          </div>
          <Segmented<TextIconStyle>
            value={textStyle}
            onChange={(next) => editText(textLabel, next)}
            options={TEXT_STYLES.map((style) => ({
              value: style,
              label: t(`picker.textStyle.${style}`),
            }))}
            className="self-start"
          />
          <p className="text-[11px] text-muted-foreground">
            {t("picker.textHint")}
          </p>
          {usedText.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t("picker.textUsed")}
              </span>
              <div className="grid grid-cols-8 gap-1.5 max-h-36 overflow-y-auto pr-1">
                {usedText.map(tile)}
              </div>
            </div>
          )}
        </div>
      ) : (
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
            lucide.length + brands.length + custom.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("picker.empty")}
              </p>
            ) : (
              <div className="grid grid-cols-8 gap-1.5">
                {[...lucide, ...brands, ...custom].map(tile)}
              </div>
            )
          ) : pack === "custom" ? null : pack === "brands" ? (
            BRAND_GROUPS.map((group) => (
              <div key={group} className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t(`brandGroups.${group}`)}
                </span>
                <div className="grid grid-cols-8 gap-1.5">
                  {[
                    ...brands.filter((icon) => icon.group === group),
                    ...(hiddenCurrent?.group === group ? [hiddenCurrent] : []),
                  ].map(tile)}
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
          {pack === "custom" && (
            <UploadedPack
              query={query}
              hideGrid={searching}
              disabled={disabled}
              renderTile={tile}
              onSelect={onChange}
            />
          )}
        </div>
      )}
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
  useLibrary();
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
      {isCustomIcon(icon) && icon.pending ? null : iconLabel(icon, t)}
    </span>
  );
}
