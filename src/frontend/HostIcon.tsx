import { PluginIcon } from "@termix-ssh/plugin-sdk/ui";
import { isBrandIcon, type HostIconDef } from "./icons";

/**
 * One catalog icon, in the given color or the surrounding text color. A
 * Lucide icon and a brand logo both take their size from `className` and
 * their color from `currentColor`, so the list's CSS treats them the same.
 */
export function HostIcon({
  icon,
  color,
  className,
}: {
  icon: HostIconDef;
  color?: string | null;
  className?: string;
}) {
  const style = color ? { color } : undefined;
  if (!isBrandIcon(icon)) {
    return (
      <PluginIcon
        name={icon.lucide}
        className={className}
        style={style}
        aria-hidden
      />
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill={icon.stroke ? "none" : "currentColor"}
      stroke={icon.stroke ? "currentColor" : undefined}
      strokeWidth={icon.stroke ? 2 : undefined}
      strokeLinecap={icon.stroke ? "round" : undefined}
      strokeLinejoin={icon.stroke ? "round" : undefined}
      className={className}
      style={style}
      aria-hidden
      data-brand={icon.id}
    >
      <path d={icon.d} />
    </svg>
  );
}
