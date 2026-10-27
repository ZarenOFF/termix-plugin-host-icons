import {
  useTranslation,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import { HostIcon } from "./HostIcon";
import { iconLabel } from "./icons";
import { useIconLayout, type Preferences } from "./preferences";
import { resolveAppearance } from "./rules";

export const BADGE_ID = "host-icon";

/**
 * Runs before every other plugin's badge. Where the badge shows in the row
 * is up to host-icons.css and the user's Icon position setting.
 */
export const BADGE_ORDER = -100;

/**
 * Every host gets the badge, because a host without an icon may still need
 * an empty slot to line up with the large icons. The component decides, and
 * draws the icon of the first matching rule for a host that has none.
 */
export function createHostIconBadge(preferences: Preferences) {
  return function HostIconBadge({ host }: { host: PluginHostRecord }) {
    const { t } = useTranslation();
    const { position, anyIcon, skipEmptySlot, rules } =
      useIconLayout(preferences);
    const { resolved, rule } = resolveAppearance(host, rules);
    if (!resolved) {
      if (position !== "large" || !anyIcon || skipEmptySlot) return null;
      return (
        <span
          data-testid="host-icon-slot"
          data-host-icon-position="large"
          aria-hidden
          className="flex shrink-0"
        />
      );
    }
    const label = iconLabel(resolved.icon, t);
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
        <HostIcon
          icon={resolved.icon}
          color={resolved.color}
          className="size-3.5"
        />
      </span>
    );
  };
}
