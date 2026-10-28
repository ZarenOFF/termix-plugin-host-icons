import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  useHosts,
  useTranslation,
  type SettingsComponentProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Checkbox,
  Input,
  PluginIcon,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@termix-ssh/plugin-sdk/ui";
import { HostIcon } from "./HostIcon";
import { ColorPicker, IconPicker } from "./IconPicker";
import { findIcon, normalizeColor } from "./icons";
import { useLibrary } from "./library";
import {
  RULES_KEY,
  newRule,
  readRules,
  type IconRule,
  type RuleMatch,
} from "./rules";
import { FieldRow } from "./settings";

/** Component id, as manifest.json names it on the custom field. */
export const RULES_FIELD_COMPONENT = "icon-rules";

// One grid for the header and every row, so the columns line up:
// handle, match, text, icon, color, priority, delete. The last four are
// wide enough for their header ("Приоритет" is the longest) and centered,
// so a header and its tile or checkbox share one axis. Counted from the end,
// because a row starts with its drop indicator lines while dragging.
const GRID =
  "grid grid-cols-[1.5rem_7.5rem_minmax(8rem,1fr)_3rem_3rem_5rem_2rem] items-center gap-2 [&>*:nth-last-child(-n+4)]:justify-self-center";

const TILE =
  "flex items-center justify-center size-8 border border-border text-muted-foreground transition-colors hover:text-foreground hover:border-muted-foreground disabled:opacity-50 disabled:pointer-events-none";

/** The tags the user's hosts have: no repeats (any case), sorted. */
export function collectTags(
  hosts: ReadonlyArray<{ tags?: string[] | null }>,
): string[] {
  const seen = new Map<string, string>();
  for (const host of hosts) {
    for (const raw of host.tags ?? []) {
      const tag = typeof raw === "string" ? raw.trim() : "";
      const key = tag.toLowerCase();
      if (tag && !seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/** The tags that contain what is typed, minus one that is already typed in full. */
export function filterTags(tags: string[], typed: string): string[] {
  const query = typed.trim().toLowerCase();
  const found = tags.filter((tag) => tag.toLowerCase().includes(query));
  return found.length === 1 && found[0]!.toLowerCase() === query ? [] : found;
}

/**
 * Where the dragged rule ends up. `to` is a gap between rules: 0 is before
 * the first one, `rules.length` after the last one.
 */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  const at = to > from ? to - 1 : to;
  if (from < 0 || from >= list.length || at === from) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(at, 0, moved!);
  return next;
}

/** A small button that opens a popover with `children` in it. */
function PopoverTile({
  label,
  disabled,
  dashed,
  tip,
  trigger,
  children,
}: {
  label: string;
  disabled: boolean;
  dashed?: boolean;
  /** Shown as a tooltip instead of the label. */
  tip?: string;
  trigger: ReactNode;
  /** Gets a function that closes the popover. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = (
    <button
      type="button"
      aria-label={label}
      title={tip ? undefined : label}
      disabled={disabled}
      className={`${TILE} ${dashed ? "border-dashed" : ""}`}
    >
      {trigger}
    </button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {tip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{button}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{tip}</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{button}</PopoverTrigger>
      )}
      <PopoverContent align="start" className="w-80 max-w-[90vw] p-3">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The text of a rule. For a tag rule it is a combobox: a list of the tags
 * hosts already have, narrowed by what is typed. Built on the SDK's Popover,
 * because the SDK has no combobox. Focus stays in the input the whole time.
 */
function RuleText({
  rule,
  n,
  tags,
  disabled,
  onChange,
}: {
  rule: IconRule;
  n: number;
  tags: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Giving the input focus back after a pick must not open the list again.
  const picked = useRef(false);
  const options = useMemo(
    () => (rule.match === "tag" ? filterTags(tags, rule.value) : []),
    [rule.match, rule.value, tags],
  );
  const shown = open && !disabled && options.length > 0;

  const pick = (tag: string) => {
    onChange(tag);
    setOpen(false);
    setActive(-1);
    picked.current = true;
    input.current?.focus();
    picked.current = false;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (options.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!shown) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((active + step + options.length) % options.length);
    } else if (event.key === "Enter" && shown && active >= 0) {
      event.preventDefault();
      pick(options[active]!);
    } else if (event.key === "Escape" && shown) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <Popover open={shown} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={input}
          value={rule.value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            if (!picked.current) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={t(
            rule.match === "tag"
              ? "rules.valuePlaceholderTag"
              : "rules.valuePlaceholderName",
          )}
          aria-label={t("rules.valueLabel", { n })}
          role={rule.match === "tag" ? "combobox" : undefined}
          aria-expanded={rule.match === "tag" ? shown : undefined}
          aria-controls={shown ? listId : undefined}
          aria-activedescendant={
            shown && active >= 0 ? `${listId}-${active}` : undefined
          }
          aria-autocomplete={rule.match === "tag" ? "list" : undefined}
          autoComplete="off"
          disabled={disabled}
          className="h-8 text-xs min-w-0"
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-40 max-w-[90vw] p-1"
        // The input keeps focus, so the list neither takes it nor closes
        // when the input is clicked.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (input.current?.contains(event.target as Node))
            event.preventDefault();
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <ul
          id={listId}
          role="listbox"
          aria-label={t("rules.suggestions")}
          className="flex flex-col max-h-48 overflow-y-auto"
        >
          {options.map((tag, at) => (
            <li
              key={tag}
              id={`${listId}-${at}`}
              role="option"
              aria-selected={at === active}
              onClick={() => pick(tag)}
              onMouseEnter={() => setActive(at)}
              className={`px-2 py-1 text-xs cursor-pointer truncate ${at === active ? "bg-accent text-accent-foreground" : "text-foreground"}`}
            >
              {tag}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function RuleRow({
  rule,
  index,
  count,
  tags,
  disabled,
  dragging,
  drop,
  onChange,
  onDelete,
  onHandleKeyDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  rule: IconRule;
  index: number;
  count: number;
  tags: string[];
  disabled: boolean;
  dragging: boolean;
  /** Where a drop would land, as a gap number, or null. */
  drop: number | null;
  onChange: (patch: Partial<IconRule>) => void;
  onDelete: () => void;
  onHandleKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onDragStart: (row: HTMLElement, dataTransfer: DataTransfer | null) => void;
  onDragOver: (after: boolean) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const { t } = useTranslation();
  const row = useRef<HTMLLIElement>(null);
  const n = index + 1;
  useLibrary();
  const icon = findIcon(rule.icon);
  const color = normalizeColor(rule.color);
  const lineAbove = drop === index;
  const lineBelow = drop === count && index === count - 1;
  return (
    <li
      ref={row}
      data-rule-row
      onDragOver={(event) => {
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        onDragOver(event.clientY >= box.top + box.height / 2);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={`relative ${GRID} py-1 min-w-0 ${dragging ? "opacity-50" : ""}`}
    >
      {lineAbove && (
        <span
          aria-hidden
          data-drop-indicator
          className="absolute inset-x-0 top-0 h-0.5 -translate-y-1/2 bg-accent-brand pointer-events-none"
        />
      )}
      {lineBelow && (
        <span
          aria-hidden
          data-drop-indicator
          className="absolute inset-x-0 bottom-0 h-0.5 translate-y-1/2 bg-accent-brand pointer-events-none"
        />
      )}
      <button
        type="button"
        draggable={!disabled}
        disabled={disabled}
        aria-label={t("rules.handleLabel", { n })}
        title={t("rules.handleLabel", { n })}
        data-rule-handle={index}
        onKeyDown={onHandleKeyDown}
        onDragStart={(event) => {
          if (row.current) onDragStart(row.current, event.dataTransfer ?? null);
        }}
        onDragEnd={onDragEnd}
        className="flex items-center justify-center h-8 cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing disabled:opacity-50 disabled:pointer-events-none"
      >
        <PluginIcon name="GripVertical" className="size-4" />
      </button>
      <Select
        value={rule.match}
        onValueChange={(match) => onChange({ match: match as RuleMatch })}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          aria-label={t("rules.matchLabel", { n })}
          className="h-8 w-full text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tag">{t("rules.matchTag")}</SelectItem>
          <SelectItem value="name">{t("rules.matchName")}</SelectItem>
        </SelectContent>
      </Select>
      <RuleText
        rule={rule}
        n={n}
        tags={tags}
        disabled={disabled}
        onChange={(value) => onChange({ value })}
      />
      <PopoverTile
        label={t("rules.iconLabel", { n })}
        disabled={disabled}
        dashed={!icon}
        tip={icon ? undefined : t("rules.noIconTip")}
        trigger={
          icon ? (
            <HostIcon icon={icon} color={color} className="size-4" />
          ) : null
        }
      >
        {(close) => (
          <IconPicker
            value={rule.icon}
            color={color}
            noneLabel={t("rules.hostOwnIcon")}
            onChange={(id) => {
              onChange({ icon: id });
              close();
            }}
          />
        )}
      </PopoverTile>
      <PopoverTile
        label={t("rules.colorLabel", { n })}
        disabled={disabled}
        trigger={
          <span
            aria-hidden
            className="size-4 border border-border bg-muted"
            style={color ? { background: color } : undefined}
          />
        }
      >
        {() => (
          <ColorPicker
            value={rule.color}
            icon={icon ?? null}
            onChange={(next) => onChange({ color: next })}
          />
        )}
      </PopoverTile>
      <div className="flex items-center justify-center">
        <Checkbox
          checked={rule.override}
          onCheckedChange={(checked) =>
            onChange({ override: checked === true })
          }
          aria-label={t("rules.overrideLabel", { n })}
          disabled={disabled}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("rules.delete", { n })}
        title={t("rules.delete", { n })}
        disabled={disabled}
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive"
      >
        <PluginIcon name="Trash" className="size-4" />
      </Button>
    </li>
  );
}

/**
 * A stable key for each row, kept beside the stored list and never saved.
 * Rows keyed by position would hand an open popover or suggestion list to
 * whichever rule slides into that place after a delete or a move. The keys
 * follow `commit`, which a list change passes the reordered keys through.
 * When the stored list changes by some other route, keys stay by position and
 * are added or dropped at the end to match its length.
 */
function useRowKeys(rules: IconRule[]) {
  const counter = useRef(0);
  const fresh = () => `rule-${counter.current++}`;
  const current = useRef<{ json: string; keys: string[] } | null>(null);
  // What `commit` expects the stored list to become, in case the new value
  // arrives a render or more after the call.
  const pending = useRef<{ json: string; keys: string[] } | null>(null);

  const json = JSON.stringify(rules);
  if (pending.current?.json === json) {
    current.current = pending.current;
    pending.current = null;
  }
  const known = current.current;
  let keys: string[];
  if (known?.json === json) {
    keys = known.keys;
  } else {
    pending.current = null;
    keys = rules.map((_, at) => known?.keys[at] ?? fresh());
  }
  current.current = { json, keys };

  return {
    keys,
    fresh,
    commit: (next: IconRule[], nextKeys: string[]) => {
      pending.current = { json: JSON.stringify(next), keys: nextKeys };
    },
  };
}

/**
 * The editor behind the user's `rules` setting: a table of rules in the
 * order they are tried, one per row. Rows reorder by dragging the handle, or
 * with Alt and the arrow keys while it has focus. The setting is a custom
 * field, so core stores the array as it is sent.
 */
export function RulesField({
  values,
  setValue,
  running,
}: SettingsComponentProps) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const tags = useMemo(() => collectTags(hosts), [hosts]);
  const rules = readRules(values[RULES_KEY]);
  const { keys, fresh, commit } = useRowKeys(rules);
  const write = (next: IconRule[]) => setValue(RULES_KEY, next);
  // A change to the list itself, with the same change made to the row keys.
  const writeList = (next: IconRule[], nextKeys: string[]) => {
    commit(next, nextKeys);
    write(next);
  };
  const change = (index: number, patch: Partial<IconRule>) =>
    write(
      rules.map((rule, at) => (at === index ? { ...rule, ...patch } : rule)),
    );

  const [from, setFrom] = useState<number | null>(null);
  const [gap, setGap] = useState<number | null>(null);
  // After a keyboard move the handle of the moved rule gets the focus back,
  // once the new order is drawn.
  const refocus = useRef<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (refocus.current === null) return;
    const handle = list.current?.querySelector<HTMLElement>(
      `[data-rule-handle="${refocus.current}"]`,
    );
    refocus.current = null;
    handle?.focus();
  });

  const endDrag = () => {
    setFrom(null);
    setGap(null);
  };
  const dropAt = () => {
    if (from !== null && gap !== null) {
      const next = reorder(rules, from, gap);
      if (next !== rules) writeList(next, reorder(keys, from, gap));
    }
    endDrag();
  };
  // A gap next to the dragged rule changes nothing, so it gets no line.
  const visibleGap =
    from !== null && gap !== from && gap !== from + 1 ? gap : null;

  const onHandleKeyDown =
    (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!event.altKey) return;
      const step =
        event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const target = index + step;
      if (target < 0 || target >= rules.length) return;
      refocus.current = target;
      const to = step > 0 ? target + 1 : target;
      writeList(reorder(rules, index, to), reorder(keys, index, to));
    };

  return (
    <FieldRow
      label={t("settings.user.rules.label")}
      description={t("settings.user.rules.description")}
    >
      <TooltipProvider>
        <div className="flex flex-col gap-2 min-w-0">
          {rules.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("rules.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[34rem]">
                <div
                  className={`${GRID} pb-1 border-b border-border text-[11px] text-muted-foreground`}
                >
                  <span aria-hidden />
                  <span>{t("rules.colMatch")}</span>
                  <span>{t("rules.colText")}</span>
                  <span>{t("rules.colIcon")}</span>
                  <span>{t("rules.colColor")}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        tabIndex={0}
                        className="underline decoration-dotted cursor-help"
                      >
                        {t("rules.colPriority")}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t("rules.priorityTip")}</TooltipContent>
                  </Tooltip>
                  <span aria-hidden />
                </div>
                <ul ref={list} className="flex flex-col min-w-0">
                  {rules.map((rule, index) => (
                    <RuleRow
                      key={keys[index]}
                      rule={rule}
                      index={index}
                      count={rules.length}
                      tags={tags}
                      disabled={!running}
                      dragging={from === index}
                      drop={visibleGap}
                      onChange={(patch) => change(index, patch)}
                      onDelete={() =>
                        writeList(
                          rules.filter((_, at) => at !== index),
                          keys.filter((_, at) => at !== index),
                        )
                      }
                      onHandleKeyDown={onHandleKeyDown(index)}
                      onDragStart={(row, data) => {
                        setFrom(index);
                        if (data) {
                          data.effectAllowed = "move";
                          // Firefox does not start a drag without data.
                          data.setData("text/plain", String(index));
                          data.setDragImage?.(row, 0, 0);
                        }
                      }}
                      onDragOver={(after) => {
                        if (from === null) return;
                        const next = index + (after ? 1 : 0);
                        if (next !== gap) setGap(next);
                      }}
                      onDrop={dropAt}
                      onDragEnd={endDrag}
                    />
                  ))}
                </ul>
              </div>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!running}
            onClick={() => writeList([...rules, newRule()], [...keys, fresh()])}
            className="self-start"
          >
            {t("rules.add")}
          </Button>
        </div>
      </TooltipProvider>
    </FieldRow>
  );
}
