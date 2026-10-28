import { HostIcon, textWidth, useMaskId } from "./HostIcon";
import type { BadgeDef, HostIconDef } from "./icons";

/**
 * Geometry on the 24 unit box that every icon is drawn on. The chip sits in
 * the bottom right corner, touching both edges of the box. The hole cut in
 * the icon under it (host-icons.css, `data-has-badge`) is concentric and a
 * little wider, so the chip reads on any row background without painting a
 * background colored outline. The numbers in the CSS follow these.
 */
const CHIP = { cx: 16.75, cy: 16.75, r: 7.25 };

/** A badge with no label is smaller, so it stays a dot. */
const DOT = { cx: 18, cy: 18, r: 5.5 };

/** Label size on the chip by number of code points, bold. */
const CHIP_FONT = [0, 14, 10];

/** The widest a label may be, in box units. */
const CHIP_TEXT_ROOM = [0, 9, 11.5];

/**
 * Digits and capitals are about 0.72 em tall, so the middle of one is 0.36 em
 * above its baseline. A baseline set from the font size puts the label in the
 * middle of the chip in every font, unlike `dominant-baseline: central`,
 * which centers a font's em box and so sits higher or lower per font.
 */
const LABEL_DY = "0.36em";

/** "#000" or "#fff", whichever reads better on the given "#rrggbb". */
export function contrastOn(color: string): "#000" | "#fff" {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 150 ? "#000" : "#fff";
}

const FULL = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
} as const;

/**
 * A host's icon with its optional corner badge. Without a badge this is
 * exactly a HostIcon, so the plain case costs nothing and stays what it was.
 * With one it is one element of the same size that a single icon would be
 * (`className` goes on it), marked data-host-icon-layers; host-icons.css
 * sizes that element. The base icon fills the whole box, exactly where and
 * as big as the plain icon, and the badge is drawn over it.
 */
export function LayeredIcon({
  icon,
  color,
  badge,
  badgeColor,
  className,
}: {
  icon: HostIconDef;
  color?: string | null;
  badge?: BadgeDef;
  badgeColor?: string;
  className?: string;
}) {
  if (!badge) {
    return <HostIcon icon={icon} color={color} className={className} />;
  }
  return (
    <span
      aria-hidden
      className={className}
      style={{
        position: "relative",
        display: "inline-block",
        flexShrink: 0,
      }}
      data-host-icon-layers=""
      data-badge={badge.id}
      data-badge-kind={badge.kind}
      data-has-badge=""
    >
      <span data-layer="art" style={FULL}>
        <span data-layer="base" style={FULL}>
          <HostIcon icon={icon} color={color} fit />
        </span>
      </span>
      <Chip badge={badge} color={badgeColor} />
    </span>
  );
}

/**
 * The corner badge. A chosen color fills the circle and the label takes
 * black or white, whichever reads. Without one the circle is the icon's own
 * text color and the label is cut out of it with a mask, as a plate text
 * icon does, so it is readable in light and dark themes alike.
 */
function Chip({ badge, color }: { badge: BadgeDef; color?: string }) {
  const { cx, cy, r } = badge.kind === "dot" ? DOT : CHIP;
  const knockout = !color;
  const ink = knockout ? "#000" : contrastOn(color);
  const maskId = useMaskId("host-icon-chip");
  let label = null;
  if (badge.kind === "text") {
    const count = Math.min([...badge.text].length, CHIP_FONT.length - 1);
    const fontSize = CHIP_FONT[count]!;
    const room = CHIP_TEXT_ROOM[count]!;
    const wide = textWidth(badge.text, fontSize) > room;
    label = (
      <text
        x={cx}
        y={cy}
        dy={LABEL_DY}
        textAnchor="middle"
        fill={ink}
        fontSize={fontSize}
        textLength={wide ? room : undefined}
        lengthAdjust={wide ? "spacingAndGlyphs" : undefined}
        fontWeight={700}
        fontFamily="inherit"
      >
        {badge.text}
      </text>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      style={FULL}
      data-layer="badge"
      data-chip={knockout ? "theme" : "color"}
    >
      {knockout && label ? (
        <>
          <mask id={maskId}>
            <rect width={24} height={24} fill="#fff" />
            {label}
          </mask>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="currentColor"
            mask={`url(#${maskId})`}
          />
        </>
      ) : (
        <>
          <circle cx={cx} cy={cy} r={r} fill={color ?? "currentColor"} />
          {label}
        </>
      )}
    </svg>
  );
}
