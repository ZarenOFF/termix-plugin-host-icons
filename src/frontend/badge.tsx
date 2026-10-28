import {
  useTranslation,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import { LayeredIcon } from "./LayeredIcon";
import { iconLabel, isCustomIcon, type ResolvedHostIcon } from "./icons";
import { useLibrary } from "./library";
import { useIconLayout, type Preferences } from "./preferences";
import { resolveAppearance } from "./rules";

export const BADGE_ID = "host-icon";

/**
 * Runs before every other plugin's badge. Where the badge shows in the row
 * is up to host-icons.css and the user's Icon position setting.
 */
export const BADGE_ORDER = -100;

/**
 * What the badge draws, from what has been worked out for a host: its icon
 * (null for none), and whether the large layout needs an empty slot to line
 * names up.
 */
export function HostIconMarkup({
  position,
  resolved,
  rule,
  label,
  emptySlot,
}: {
  position: string;
  resolved: ResolvedHostIcon | null;
  rule?: boolean;
  label?: string;
  emptySlot?: boolean;
}) {
  if (!resolved) {
    if (!emptySlot) return null;
    return (
      <span
        data-testid="host-icon-slot"
        data-host-icon-position="large"
        aria-hidden
        className="flex shrink-0"
      />
    );
  }
  return (
    <span
      data-testid="host-icon-badge"
      data-host-icon-position={position}
      data-host-icon-source={rule ? "rule" : undefined}
      title={label}
      aria-label={label}
      role="img"
      className="flex items-center shrink-0 text-muted-foreground"
    >
      <LayeredIcon
        icon={resolved.icon}
        color={resolved.color}
        badge={resolved.badge}
        badgeColor={resolved.badgeColor}
        className="size-3.5"
      />
    </span>
  );
}

/**
 * Every host gets the badge, because a host without an icon may still need
 * an empty slot to line up with the large icons. The component
 * decides, and draws the icon of the first matching rule for a host that has
 * none.
 */
export function createHostIconBadge(preferences: Preferences) {
  return function HostIconBadge({ host }: { host: PluginHostRecord }) {
    const { t } = useTranslation();
    // Badges never ask the server: the overlay loads the library, and this
    // redraws when it changes.
    useLibrary();
    const { position, anyIcon, skipEmptySlot, rules } =
      useIconLayout(preferences);
    const { resolved, rule } = resolveAppearance(host, rules);
    // An uploaded icon the library has not loaded yet is an empty slot with
    // no name to announce.
    const label =
      resolved && !(isCustomIcon(resolved.icon) && resolved.icon.pending)
        ? iconLabel(resolved.icon, t)
        : undefined;
    return (
      <HostIconMarkup
        position={position}
        resolved={resolved}
        rule={rule !== null}
        label={label}
        emptySlot={position === "large" && anyIcon && !skipEmptySlot}
      />
    );
  };
}
