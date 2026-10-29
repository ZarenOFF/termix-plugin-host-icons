import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  PluginIcon,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@termix-ssh/plugin-sdk/ui";

/** The component id, as manifest.json names it on the `help` user setting. */
export const HELP_FIELD_COMPONENT = "icon-help";

/** The memo lines, as keys under `help.` in the locale files. */
export const HELP_LINES = ["order", "rules", "badge"] as const;

/** How long the memo stays after the pointer leaves, so it can reach it. */
const LEAVE_DELAY = 150;

/**
 * A help line at the top of the plugin's settings: "Priority order" with an
 * info icon. The memo opens on hover and on keyboard focus, and a click, tap
 * or Enter pins it open (so touch works, where there is no hover); another
 * click, Escape or a click elsewhere closes it. Built on the SDK's Popover,
 * since a Tooltip does not open on touch. Holds no setting: the manifest key
 * only gives core a place to draw it.
 */
export function HelpField() {
  const { t } = useTranslation();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || focus || pinned;

  useEffect(() => () => clearTimeout(timer.current), []);

  const enter = () => {
    clearTimeout(timer.current);
    setHover(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(false), LEAVE_DELAY);
  };
  const closeAll = () => {
    clearTimeout(timer.current);
    setHover(false);
    setFocus(false);
    setPinned(false);
  };

  return (
    <div className="py-3 min-w-0 border-b border-border last:border-0">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) closeAll();
        }}
      >
        <PopoverAnchor asChild>
          <button
            ref={button}
            type="button"
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            onClick={() => (pinned ? closeAll() : setPinned(true))}
            onMouseEnter={enter}
            onMouseLeave={leave}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:text-foreground rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PluginIcon name="Info" aria-hidden className="size-4 shrink-0" />
            {t("settings.user.help.label")}
          </button>
        </PopoverAnchor>
        <PopoverContent
          id={id}
          align="start"
          className="w-96 max-w-[90vw] p-3"
          data-testid="help-memo"
          // Focus stays on the button, so the memo neither takes it nor
          // closes when the button itself is clicked.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (button.current?.contains(event.target as Node))
              event.preventDefault();
          }}
          onMouseEnter={enter}
          onMouseLeave={leave}
        >
          <ul className="flex flex-col gap-2 text-xs leading-snug list-disc pl-4">
            {HELP_LINES.map((line) => (
              <li key={line}>{t(`settings.user.help.${line}`)}</li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
