import { useMemo, useRef, type CSSProperties } from "react";
import { PluginIcon } from "@termix-ssh/plugin-sdk/ui";
import {
  isBrandIcon,
  isCustomIcon,
  isTextIcon,
  type CustomIconDef,
  type HostIconDef,
  type TextIconDef,
} from "./icons";

/**
 * One catalog icon, in the given color or the surrounding text color. A
 * Lucide icon and a brand logo both take their size from `className` and
 * their color from `currentColor`, so the list's CSS treats them the same.
 */
export function HostIcon({
  icon,
  color,
  className,
  fit = false,
}: {
  icon: HostIconDef;
  color?: string | null;
  className?: string;
  /**
   * Fill the parent box exactly, by inline style, so no stylesheet decides
   * the size. For the base of a LayeredIcon.
   */
  fit?: boolean;
}) {
  const style: CSSProperties | undefined =
    color || fit
      ? {
          ...(color ? { color } : {}),
          ...(fit ? { display: "block", width: "100%", height: "100%" } : {}),
        }
      : undefined;
  if (isCustomIcon(icon)) {
    return (
      <CustomIcon
        icon={icon}
        tinted={icon.tint || !!color}
        className={className}
        style={style}
      />
    );
  }
  if (isTextIcon(icon)) {
    return <TextIcon icon={icon} className={className} style={style} />;
  }
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

/** Font size on the 24 box by number of code points, boxed or bare. */
const FRAMED_SIZE = [0, 14, 11.5, 8.5, 7];
const PLAIN_SIZE = [0, 20, 15, 11, 8.5];

const WIDE = new Set([..."MWmwЖШЩЮжшщю"]);
const NARROW = new Set([..."iljI1.,:;'!|"]);

/** Estimated width of a bold label, in the same units as the box. */
export function textWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text)
    em += WIDE.has(char) ? 0.9 : NARROW.has(char) ? 0.35 : 0.62;
  return em * fontSize;
}

let maskCount = 0;

/**
 * An id for one SVG mask, unique to this instance. Not derived from the
 * content and not useId: ids are shared by the whole document, and Termix may
 * draw badges in separate React roots, where useId values collide. Equal
 * badges sharing an id is a bug too: when the first one sits in a display:none
 * subtree (a collapsed folder, a closed tab) Chromium resolves url(#id) to
 * its unrendered mask and the others lose the knockout. So a counter shared
 * by the bundle hands out one id per instance.
 */
export function useMaskId(prefix: string): string {
  const id = useRef<string | null>(null);
  if (id.current === null) id.current = `${prefix}-${++maskCount}`;
  return id.current;
}

/**
 * A text icon as an inline svg on a 24x24 box, like a brand logo. The plate
 * knocks the text out of its box with a mask, so it is see-through.
 */
function TextIcon({
  icon,
  className,
  style,
}: {
  icon: TextIconDef;
  className?: string;
  style?: CSSProperties;
}) {
  const maskId = useMaskId("host-icon");
  const count = [...icon.text].length;
  const plain = icon.style === "plain";
  const fontSize = (plain ? PLAIN_SIZE : FRAMED_SIZE)[count];
  const room = plain ? 22 : 17;
  const width = textWidth(icon.text, fontSize);
  const label = (fill: string) => (
    <text
      x={12}
      y={12}
      textAnchor="middle"
      dominantBaseline="central"
      fill={fill}
      fontSize={fontSize}
      textLength={width > room ? room : undefined}
      lengthAdjust={width > room ? "spacingAndGlyphs" : undefined}
      fontWeight={700}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
    >
      {icon.text}
    </text>
  );
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      className={className}
      style={style}
      aria-hidden
      data-text-icon={icon.style}
    >
      {icon.style === "frame" && (
        <rect
          x={1.5}
          y={1.5}
          width={21}
          height={21}
          rx={5}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        />
      )}
      {icon.style === "plate" && (
        <>
          <mask id={maskId}>
            <rect width={24} height={24} fill="#fff" />
            {label("#000")}
          </mask>
          <rect
            x={1}
            y={1}
            width={22}
            height={22}
            rx={5}
            fill="currentColor"
            mask={`url(#${maskId})`}
          />
        </>
      )}
      {icon.style === "plain" ? label("currentColor") : null}
      {icon.style === "frame" ? label("currentColor") : null}
    </svg>
  );
}

/**
 * The data URL of an uploaded icon. The SVG was sanitized by the server and
 * is still only ever shown as an image or a mask, which never run script or
 * load anything, and is never put into the page as markup.
 */
export function customIconUrl(icon: CustomIconDef): string {
  if (icon.kind === "png") return `data:image/png;base64,${icon.data}`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.data)}`;
}

/**
 * An uploaded icon. Not tinted: an <img>. Tinted: a span whose background is
 * the icon color, cut to the icon's shape by a mask. A chosen color always
 * tints; without one only a monochrome icon does, in the theme color. Both carry
 * data-custom-icon, which host-icons.css sizes like it sizes an svg. Before
 * the library has loaded the icon is an empty box of the same size, so the
 * row neither jumps nor shows the fallback icon.
 */
function CustomIcon({
  icon,
  tinted,
  className,
  style,
}: {
  icon: CustomIconDef;
  tinted: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const url = useMemo(
    () => (icon.pending ? "" : customIconUrl(icon)),
    [icon.pending, icon.kind, icon.data],
  );
  if (icon.pending) {
    return (
      <span
        aria-hidden
        className={className}
        style={style}
        data-custom-icon="pending"
      />
    );
  }
  if (!tinted) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        draggable={false}
        className={className}
        style={{ objectFit: "contain", ...style }}
        data-custom-icon="img"
      />
    );
  }
  const mask = `url("${url}")`;
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        backgroundColor: "currentColor",
        maskImage: mask,
        WebkitMaskImage: mask,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        ...style,
      }}
      data-custom-icon="mask"
    />
  );
}
