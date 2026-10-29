import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Input, PluginIcon } from "@termix-ssh/plugin-sdk/ui";
import { HostIcon } from "./HostIcon";
import { LayeredIcon } from "./LayeredIcon";
import { useUsedIcons, useUsedTextIcons } from "./used-text";
import {
  BRAND_GROUPS,
  FALLBACK_ICON_ID,
  ICON_GROUPS,
  TEXT_STYLES,
  clampTextLabel,
  findIcon,
  iconLabel,
  isBrandIcon,
  isCustomIcon,
  normalizeColor,
  parseTextIcon,
  readLayers,
  searchBrands,
  searchCustomIcons,
  searchIcons,
  textIconId,
  type HostIconDef,
  type TextIconDef,
  type TextIconStyle,
} from "./icons";
import { useLibrary } from "./library";
import { UploadedControls } from "./uploaded";

/** The filter chips under the search box; one is on at a time. */
const FILTERS = ["all", "icons", "brands", "text", "custom"] as const;
type Filter = (typeof FILTERS)[number];

/** Most icons in use shown in the first section, so it stays a shortcut. */
const MAX_USED = 24;

const TILE =
  "flex items-center justify-center min-h-9 border transition-colors disabled:opacity-50 disabled:pointer-events-none";
const TILE_ON = "border-accent-brand/50 bg-accent-brand/10 text-foreground";
const TILE_OFF =
  "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground";

const HEADING = "text-[11px] text-muted-foreground";

interface Section {
  key: string;
  title?: string;
  icons: HostIconDef[];
}

/**
 * A search box, a row of filter chips (All, Icons, Brands, Text, Uploaded)
 * and one scrolling list of sections, with a "No icon" tile first. `value` is
 * the stored icon id; an empty string means no icon.
 *
 * The search box is one field for every filter and its text is kept when the
 * filter changes; on Text it filters the text icons in use. Text has its own
 * labeled field for the label of a text icon, inside the list. A search of
 * one to four characters also offers that text as an icon, in All.
 *
 * The list has a fixed height, so changing filter never resizes the picker.
 */
export function IconPicker({
  value,
  color,
  onChange,
  disabled = false,
  noneLabel,
  listHeight = 224,
}: {
  value: string;
  color?: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Text of the first tile, "No icon" unless the caller says otherwise. */
  noneLabel?: string;
  /** Height of the scrolling list in pixels; fixed, not a maximum. */
  listHeight?: number;
}) {
  const { t } = useTranslation();
  // Uploaded icons resolve through the library, which can change under us.
  const { icons: uploaded } = useLibrary();
  const usedIds = useUsedIcons();
  const usedTextIds = useUsedTextIcons();
  const initialText = parseTextIcon(value);
  const [query, setQuery] = useState("");
  // The label of the text icon being made, apart from the search.
  const [text, setText] = useState(initialText?.text ?? "");
  const [filter, setFilter] = useState<Filter>(initialText ? "text" : "all");
  const [textStyle, setTextStyle] = useState<TextIconStyle>(
    initialText?.style ?? "frame",
  );
  // The host list can arrive after the dialog opens, so `value` may change
  // from empty to a text icon. Until the user has touched the picker, open on
  // Text for it. After that only the style and the label follow, keeping what
  // is being typed (a trailing space, say) when the value is just the echo of
  // it.
  const touched = useRef(false);
  useEffect(() => {
    const parsed = parseTextIcon(value);
    if (!parsed) return;
    setTextStyle(parsed.style);
    if (!touched.current) setFilter("text");
    setText((current) =>
      current.trim() === parsed.text ? current : parsed.text,
    );
  }, [value]);

  const label = (icon: HostIconDef) => iconLabel(icon, t);
  const tint = normalizeColor(color);
  const unknown = value !== "" && !findIcon(value);
  const needle = query.trim();
  const searching = needle !== "";
  const textFilter = filter === "text";
  const typedText = textIconId("frame", query) !== null;
  const labelIcon = (style: TextIconStyle, from = text) =>
    parseTextIcon(textIconId(style, from) ?? "");

  const pick = (id: string) => {
    touched.current = true;
    onChange(id);
  };
  // `from` is the label to use: the typed one, or the search that All offers.
  const pickText = (style: TextIconStyle, from = text) => {
    setTextStyle(style);
    setText(clampTextLabel(from));
    const id = textIconId(style, from);
    if (id) pick(id);
    else touched.current = true;
  };
  const editText = (raw: string) => {
    touched.current = true;
    const next = clampTextLabel(raw);
    setText(next);
    const id = textIconId(textStyle, next);
    if (id) onChange(id);
  };
  const chooseFilter = (name: Filter) => {
    touched.current = true;
    // A search that is a fit label starts an empty one.
    if (name === "text" && text === "") {
      const id = textIconId("frame", query);
      if (id) setText(parseTextIcon(id)!.text);
    }
    setFilter(name);
  };

  const tile = (icon: HostIconDef, key: string, fromUsedText = false) => {
    const selected = value === icon.id;
    return (
      <button
        key={key}
        type="button"
        title={label(icon)}
        aria-label={label(icon)}
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => {
          // A text icon in use fills the label and the style, to be edited from.
          if (fromUsedText) {
            const parsed = parseTextIcon(icon.id);
            if (parsed) {
              setText(parsed.text);
              setTextStyle(parsed.style);
            }
          }
          pick(icon.id);
        }}
        className={`${TILE} ${selected ? TILE_ON : TILE_OFF}`}
        data-host-icons-tile
        data-host-icons-actual
      >
        <HostIcon icon={icon} color={selected ? tint : null} />
      </button>
    );
  };

  // The first tile of the list, a tile like the others and the same in every
  // picker; a rule's picker only names it the host's own icon.
  const noneText = noneLabel ?? t("picker.none");
  const noneTile = (
    <button
      key="none"
      type="button"
      title={noneText}
      aria-label={noneText}
      aria-pressed={value === ""}
      disabled={disabled}
      onClick={() => pick("")}
      data-host-icons-tile
      data-host-icons-actual
      className={`${TILE} ${value === "" ? TILE_ON : TILE_OFF}`}
    >
      <PluginIcon name="Ban" aria-hidden />
    </button>
  );

  // One style of the typed label. The tile shows the label as typed, or a
  // faint sample while there is none; the caption is the style's name.
  const styleTile = (style: TextIconStyle) => {
    const def = labelIcon(style);
    const name = t(`picker.textStyle.${style}`);
    const on = textStyle === style;
    const sample = def ?? parseTextIcon(`text:${style}:Aa`)!;
    return (
      <button
        key={style}
        type="button"
        title={name}
        aria-label={name}
        aria-pressed={on}
        disabled={disabled}
        onClick={() => pickText(style)}
        data-testid={`text-style-${style}`}
        className={`${TILE} flex-col gap-1 py-1.5 ${on ? TILE_ON : TILE_OFF}`}
      >
        <span
          data-host-icons-actual
          className={`flex ${def ? "" : "opacity-40"}`}
        >
          <HostIcon icon={sample} color={on ? tint : null} />
        </span>
        <span className="text-[10px] leading-none">{name}</span>
      </button>
    );
  };

  // What the list holds: first the icons in use, then Lucide and brand groups,
  // then the uploaded ones; a search leaves the matches in the same order.
  const withLucide = filter === "all" || filter === "icons";
  const withBrands = filter === "all" || filter === "brands";
  const withCustom = filter === "all" || filter === "custom";
  const current = findIcon(value);
  // A hidden logo is not offered, but a host that already has it must still
  // see it selected, in its own group.
  const hiddenCurrent =
    !searching && current && isBrandIcon(current) && current.hidden
      ? current
      : null;
  const sections: Section[] = [];
  if (filter === "all" && !searching) {
    const used = usedIds
      .map((id) => findIcon(id))
      .filter(
        (icon): icon is HostIconDef =>
          icon !== undefined && !(isCustomIcon(icon) && icon.pending),
      )
      .slice(0, MAX_USED);
    if (used.length > 0)
      sections.push({ key: "used", title: t("picker.used"), icons: used });
  }
  if (withLucide) {
    const found = searchIcons(query, label);
    for (const group of ICON_GROUPS) {
      const icons = found.filter((icon) => icon.group === group);
      if (icons.length > 0)
        sections.push({
          key: `group-${group}`,
          title: t(`groups.${group}`),
          icons,
        });
    }
  }
  if (withBrands) {
    const found = searchBrands(query);
    for (const group of BRAND_GROUPS) {
      const icons: HostIconDef[] = found.filter((icon) => icon.group === group);
      if (hiddenCurrent?.group === group) icons.push(hiddenCurrent);
      if (icons.length === 0) continue;
      const name = t(`brandGroups.${group}`);
      sections.push({
        key: `brand-${group}`,
        title:
          filter === "all" ? t("picker.brandsGroup", { group: name }) : name,
        icons,
      });
    }
  }
  if (withCustom) {
    const found = searchCustomIcons(query, uploaded);
    if (found.length > 0 || (filter === "custom" && !searching))
      sections.push({
        key: "custom",
        title: filter === "all" ? t("picker.chips.custom") : undefined,
        icons: found,
      });
  }

  // The "No icon" tile opens the first section; a search hides it.
  const withNone = !textFilter && !searching;
  const textOffered = filter === "all" && typedText;
  const nothing =
    !textFilter && searching && sections.length === 0 && !textOffered;
  const emptyLibrary =
    filter === "custom" && !searching && uploaded.length === 0;

  const usedText = usedTextIds
    .map((id) => parseTextIcon(id))
    .filter((icon): icon is TextIconDef => icon !== undefined)
    .filter((icon) => icon.text.toLowerCase().includes(needle.toLowerCase()));

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div data-host-icons-search>
        <PluginIcon name="Search" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("picker.search")}
          aria-label={t("picker.search")}
          disabled={disabled}
          className="h-8 text-xs"
        />
      </div>
      <div
        role="group"
        aria-label={t("picker.filter")}
        className="flex flex-wrap gap-1.5"
      >
        {FILTERS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter === name}
            disabled={disabled}
            onClick={() => chooseFilter(name)}
            className={`h-6 px-2 border text-[11px] transition-colors disabled:opacity-50 ${filter === name ? TILE_ON : TILE_OFF}`}
          >
            {t(`picker.chips.${name}`)}
          </button>
        ))}
      </div>
      {unknown && (
        <p className="text-xs text-warning">
          {t("picker.unknown", {
            fallback: t(`icons.${FALLBACK_ICON_ID}`),
          })}
        </p>
      )}
      <div
        data-testid="picker-list"
        className="flex flex-col gap-2 overflow-y-auto p-0.5 pr-1.5"
        style={{ height: listHeight }}
      >
        {textFilter && (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className={HEADING}>{t("picker.textLabel")}</span>
              <Input
                value={text}
                onChange={(event) => editText(event.target.value)}
                placeholder={t("picker.textPlaceholder")}
                disabled={disabled}
                className="h-8 text-xs"
              />
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {TEXT_STYLES.map(styleTile)}
            </div>
          </div>
        )}
        {textOffered && (
          <div className="flex flex-col gap-1">
            <span className={HEADING}>
              {t("picker.textFor", { label: needle })}
            </span>
            <div data-host-icons-grid>
              {TEXT_STYLES.map((style) => {
                const def = labelIcon(style, query)!;
                const on = value === def.id;
                const name = t("picker.textTile", {
                  style: t(`picker.textStyle.${style}`),
                  label: def.text,
                });
                return (
                  <button
                    key={style}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => pickText(style, needle)}
                    className={`${TILE} ${on ? TILE_ON : TILE_OFF}`}
                    data-host-icons-tile
                    data-host-icons-actual
                  >
                    <HostIcon icon={def} color={on ? tint : null} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {textFilter && usedText.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className={HEADING}>{t("picker.textUsed")}</span>
            <div data-host-icons-grid>
              {usedText.map((icon) => tile(icon, icon.id, true))}
            </div>
          </div>
        )}
        {filter === "custom" && (
          <UploadedControls disabled={disabled} onSelect={pick} />
        )}
        {!textFilter &&
          sections.map((section, at) => (
            <div key={section.key} className="flex flex-col gap-1">
              {section.title && (
                <span className={HEADING}>{section.title}</span>
              )}
              <div data-host-icons-grid>
                {at === 0 && withNone && noneTile}
                {section.icons.map((icon) =>
                  tile(icon, `${section.key}:${icon.id}`),
                )}
              </div>
            </div>
          ))}
        {!textFilter && sections.length === 0 && withNone && (
          <div data-host-icons-grid>{noneTile}</div>
        )}
        {emptyLibrary && (
          <p className="text-xs text-muted-foreground">{t("custom.empty")}</p>
        )}
        {nothing && (
          <p className="text-xs text-muted-foreground">
            {t("picker.nothing", { query: needle })}
          </p>
        )}
      </div>
    </div>
  );
}

const SWATCHES = [
  "#f59145",
  "#ef4444",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#6b7280",
];

/** What the native color input shows while no color is chosen. */
const NEUTRAL_COLOR = "#6b7280";

/**
 * A color picker like Termix's folder one (native input, hex field,
 * swatches), plus a choice that clears the value. Its hex field stays empty
 * while no color is chosen, which the SDK's own picker cannot do.
 *
 * `icon` is the icon the color is for, because what the clearing choice does
 * depends on it. Pass null when it is not known (a default for many hosts,
 * no icon). `themeLabel` replaces the choice's text for a color that is not
 * the icon's; it has no preview. `compact` lays the controls out in one
 * wrapping row, for the dialog.
 */
export function ColorPicker({
  value,
  onChange,
  disabled = false,
  themeLabel,
  icon = null,
  compact = false,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  /** Text of the choice that clears the value. */
  themeLabel?: string;
  icon?: HostIconDef | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const themed = normalizeColor(value) === null;
  // A stand in for an icon the library has not loaded is not known yet.
  const known = icon && !(isCustomIcon(icon) && icon.pending) ? icon : null;
  const kind =
    known === null
      ? "none"
      : isCustomIcon(known) && !known.tint
        ? "own"
        : "theme";
  const noColorLabel = {
    none: "picker.noColor",
    own: "picker.ownColors",
    theme: "picker.themeColor",
  }[kind];
  const typed = value.trim();
  const native = /^#[0-9a-f]{6}$/i.test(typed) ? typed : NEUTRAL_COLOR;
  const swatch = compact ? "size-5" : "size-6";
  return (
    <fieldset
      disabled={disabled}
      className={
        compact
          ? "flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0 p-1"
          : "flex flex-col gap-2 min-w-0 p-1"
      }
    >
      <button
        type="button"
        aria-pressed={themed}
        onClick={() => onChange("")}
        className={`self-start h-7 px-2 border text-[11px] transition-colors flex items-center gap-1.5 ${themed ? TILE_ON : TILE_OFF}`}
      >
        {themeLabel === undefined && known && (
          <span data-testid="no-color-preview" className="flex shrink-0">
            <HostIcon icon={known} color={null} className="size-4" />
          </span>
        )}
        {themeLabel ?? t(noColorLabel)}
      </button>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={native}
          aria-label={t("picker.colorInput")}
          onChange={(event) => onChange(event.target.value)}
          className={`h-8 w-10 shrink-0 cursor-pointer rounded-none border border-input bg-transparent p-0.5`}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#rrggbb"
          aria-label={t("picker.hexInput")}
          className={`font-mono uppercase ${compact ? "w-24" : ""}`}
          maxLength={7}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            onClick={() => onChange(hex)}
            className={`${swatch} rounded-none border transition-all ${value.toLowerCase() === hex ? "ring-2 ring-offset-1 ring-offset-background ring-white/60" : "opacity-80 hover:opacity-100"}`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The chosen icon, at the list's size, with its name: what the host row will show,
 * including its corner badge when given. The layers are the stored setting
 * values; invalid ones are ignored like the host list does.
 */
export function IconPreview({
  value,
  color,
  badge,
  badgeColor,
}: {
  value: string;
  color?: string | null;
  badge?: string;
  badgeColor?: string;
}) {
  const { t } = useTranslation();
  useLibrary();
  const layers = readLayers({ badge, badgeColor });
  if (!value) {
    return (
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {t("picker.noIconPreview")}
      </span>
    );
  }
  const icon = findIcon(value) ?? findIcon(FALLBACK_ICON_ID)!;
  return (
    <span className="flex items-center gap-2 text-xs">
      <span data-host-icons-actual className="flex">
        <LayeredIcon
          icon={icon}
          color={normalizeColor(color)}
          badge={layers.badge}
          badgeColor={layers.badgeColor}
        />
      </span>
      {isCustomIcon(icon) && icon.pending ? null : iconLabel(icon, t)}
    </span>
  );
}
