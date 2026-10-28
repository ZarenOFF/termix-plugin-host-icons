import { Parser } from "htmlparser2";

// Turns an uploaded SVG into markup that is safe to show to every user.
//
// The input is never trusted and never passed through: it is parsed as XML into
// a small tree, and a new document is written from that tree. Only elements and
// attributes on the lists below survive, and every attribute value has to pass a
// strict character check, so there is no way to smuggle a script, an event
// handler, an external reference or a CSS escape through.
//
// The frontend still draws the result only through an <img> data URL or a CSS
// mask, never as inline markup, so this is the second line of defense.

export type SanitizeResult =
  { ok: true; svg: string } | { ok: false; error: string };

/** Longest raw upload we even try to parse. Real exports with metadata are far smaller. */
export const MAX_RAW_SVG_LENGTH = 512 * 1024;
/** Longest sanitized SVG we store. */
export const MAX_SVG_LENGTH = 100 * 1024;

const MAX_ELEMENTS = 5000;
const MAX_DEPTH = 48;
const MAX_USE_EXPANSION = 20000;
const MAX_TEXT_LENGTH = 200;

const SVG_NS = "http://www.w3.org/2000/svg";

// Dropped with everything inside them.
// Anything not on ELEMENTS and not on UNWRAP is dropped this way, which
// covers script, style, foreignObject, image, animate*, set, filter and
// every namespaced element (sodipodi:namedview, rdf:RDF, ...).
const ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "title",
  "desc",
  "use",
  "symbol",
]);

// Links are dropped but what they wrap is kept.
const UNWRAP = new Set(["a"]);

// Elements whose text is kept.
const TEXT_ELEMENTS = new Set(["title", "desc"]);

// Properties that may come from an attribute or from a style="" declaration.
const PRESENTATION = new Set([
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "clip-rule",
  "clip-path",
  "mask",
  "opacity",
  "stop-color",
  "stop-opacity",
  "display",
  "visibility",
  "color",
]);

// Geometry and other plain attributes. href and id have their own rules.
const GEOMETRY = new Set([
  "d",
  "x",
  "y",
  "width",
  "height",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x1",
  "y1",
  "x2",
  "y2",
  "fx",
  "fy",
  "fr",
  "points",
  "transform",
  "viewBox",
  "preserveAspectRatio",
  "offset",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "markerUnits",
]);

// Letters, digits, whitespace and . , + - % ( ) # / _ only. No colon, quote,
// semicolon, backslash, angle bracket, ampersand, @ or ! means no URL scheme, no
// CSS escape, no second declaration and no markup, whatever the attribute is.
const SAFE_VALUE = /^[\w\s.,+\-%()#/]*$/;
const LOCAL_URL = /url\(\s*#[\w.-]+\s*\)/gi;
const ANY_URL = /url\(/gi;
const LOCAL_ID = /^[\w.-]+$/;
const LOCAL_HREF = /^#[\w.-]+$/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function safeValue(raw: string): string | null {
  const value = raw.trim();
  if (value.length > MAX_SVG_LENGTH) return null;
  if (!SAFE_VALUE.test(value)) return null;
  // Every url(...) must point inside the document.
  const all = value.match(ANY_URL)?.length ?? 0;
  const local = value.match(LOCAL_URL)?.length ?? 0;
  if (all !== local) return null;
  return value;
}

interface Node {
  name: string;
  attrs: Map<string, string>;
  children: Node[];
  text: string;
}

function cleanAttributes(
  raw: Record<string, string>,
  isRoot: boolean,
): Map<string, string> {
  const out = new Map<string, string>();
  const own = Object.keys(raw);

  for (const key of own) {
    const value = raw[key] ?? "";
    if (key === "id") {
      const id = value.trim();
      if (LOCAL_ID.test(id)) out.set("id", id);
    } else if (key === "href" || key === "xlink:href") {
      const href = value.trim();
      // href wins over xlink:href when both are there, as in SVG 2.
      if (LOCAL_HREF.test(href) && (key === "href" || !out.has("href"))) {
        out.set("href", href);
      }
    } else if (GEOMETRY.has(key) || PRESENTATION.has(key)) {
      const safe = safeValue(value);
      if (safe !== null) out.set(key, safe);
    }
  }

  // style="fill:#f00;stroke:none" is how Inkscape and Illustrator write most
  // colors. Keep the declarations we know as presentation attributes. A style
  // declaration beats the attribute, so it replaces it.
  const style = raw["style"];
  if (typeof style === "string") {
    for (const declaration of style.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      if (!PRESENTATION.has(property)) continue;
      const safe = safeValue(declaration.slice(colon + 1));
      if (safe !== null) out.set(property, safe);
    }
  }

  if (isRoot) {
    // xmlns is written by serialize(); a different one in the input is ignored.
    for (const key of ["x", "y", "id", "href"]) out.delete(key);
  }
  return out;
}

function viewBoxOf(root: Node): string | null {
  const given = root.attrs.get("viewBox");
  if (given !== undefined) {
    const parts = given.split(/[\s,]+/).filter(Boolean);
    if (
      parts.length === 4 &&
      parts.every((part) => NUMBER.test(part)) &&
      Number(parts[2]) > 0 &&
      Number(parts[3]) > 0
    ) {
      return parts.join(" ");
    }
    return null;
  }
  const size = (key: string) => {
    const match = /^(\d+(?:\.\d+)?|\.\d+)(?:px)?$/i.exec(
      root.attrs.get(key) ?? "",
    );
    return match ? Number(match[1]) : 0;
  };
  const width = size("width");
  const height = size("height");
  return width > 0 && height > 0 ? `0 0 ${width} ${height}` : null;
}

function countNodes(node: Node): number {
  let total = 1;
  for (const child of node.children) total += countNodes(child);
  return total;
}

function containsUse(node: Node): boolean {
  return node.name === "use" || node.children.some(containsUse);
}

// A use may only point at something that has no use inside it. Without that,
// groups that each use the previous one twice blow up exponentially when drawn.
// Returns an error message or removes the uses that cannot be kept.
function checkUses(root: Node): string | null {
  const byId = new Map<string, Node>();
  const uses: Node[] = [];
  const walk = (node: Node) => {
    const id = node.attrs.get("id");
    if (id !== undefined && !byId.has(id)) byId.set(id, node);
    for (const child of node.children) {
      if (child.name === "use") uses.push(child);
      walk(child);
    }
  };
  walk(root);

  let expansion = 0;
  const drop = new Set<Node>();
  for (const node of uses) {
    const href = node.attrs.get("href");
    const target = href ? byId.get(href.slice(1)) : undefined;
    if (!target || containsUse(target)) {
      drop.add(node);
    } else {
      expansion += countNodes(target);
    }
  }
  if (expansion > MAX_USE_EXPANSION) return "The SVG is too complex";

  const prune = (node: Node) => {
    node.children = node.children.filter((child) => !drop.has(child));
    node.children.forEach(prune);
  };
  prune(root);
  return null;
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const escapeText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function serialize(node: Node, isRoot: boolean): string {
  const attrs = new Map(node.attrs);
  if (isRoot) {
    attrs.delete("width");
    attrs.delete("height");
  }
  let out = `<${node.name}`;
  if (isRoot) out += ` xmlns="${SVG_NS}"`;
  for (const [key, value] of attrs)
    out += ` ${key}="${escapeAttribute(value)}"`;
  const inner =
    escapeText(node.text) +
    node.children.map((child) => serialize(child, false)).join("");
  return inner ? `${out}>${inner}</${node.name}>` : `${out}/>`;
}

export function sanitizeSvg(input: unknown): SanitizeResult {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, error: "The SVG is empty" };
  }
  if (input.length > MAX_RAW_SVG_LENGTH) {
    return { ok: false, error: "The SVG is too big" };
  }

  // "skip" frames sit inside a dropped element, "unwrap" frames are links that
  // are dropped while their children stay.
  type Frame = { node: Node | null; kind: "el" | "skip" | "unwrap" };
  const stack: Frame[] = [];
  let root: Node | null = null;
  let failure: string | null = null;
  let skipFrames = 0;
  let elements = 0;

  const fail = (message: string) => {
    failure ??= message;
  };
  const skip = () => {
    skipFrames++;
    stack.push({ node: null, kind: "skip" });
  };

  // The element that new children belong to.
  const parentNode = (): Node | null => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const frame = stack[i]!;
      if (frame.kind !== "unwrap") return frame.node;
    }
    return null;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (failure || skipFrames > 0) return skip();
        if (stack.length === 0 && (name !== "svg" || root)) {
          // First element: it has to be the svg, and there is only one.
          fail("The file is not an SVG image");
          return skip();
        }
        if (UNWRAP.has(name) && stack.length > 0) {
          stack.push({ node: null, kind: "unwrap" });
          return;
        }
        if (!ELEMENTS.has(name)) return skip();
        // A single value that long can only be a file over the limit; dropping
        // it quietly would store a broken icon.
        if (Object.values(attribs).some((v) => v.length > MAX_SVG_LENGTH)) {
          fail("The SVG is too big");
          return skip();
        }
        if (++elements > MAX_ELEMENTS) {
          fail("The SVG is too complex");
          return skip();
        }
        if (stack.length >= MAX_DEPTH) {
          fail("The SVG is nested too deeply");
          return skip();
        }
        const node: Node = {
          name,
          attrs: cleanAttributes(attribs, stack.length === 0),
          children: [],
          text: "",
        };
        const parent = parentNode();
        if (parent) parent.children.push(node);
        else root = node;
        stack.push({ node, kind: "el" });
      },
      onclosetag() {
        const frame = stack.pop();
        if (frame?.kind === "skip") skipFrames--;
      },
      ontext(data) {
        if (skipFrames > 0) return;
        const node = parentNode();
        if (node && TEXT_ELEMENTS.has(node.name)) {
          node.text = (node.text + data).slice(0, MAX_TEXT_LENGTH);
        }
      },
      // Comments, processing instructions, DOCTYPE and entity declarations are
      // not handled, so they are dropped. Entities are never expanded.
    },
    { xmlMode: true, decodeEntities: true },
  );
  parser.write(input);
  parser.end();

  if (failure) return { ok: false, error: failure };
  const svg = root as Node | null;
  if (!svg) return { ok: false, error: "The file is not an SVG image" };

  const viewBox = viewBoxOf(svg);
  if (viewBox === null) {
    return {
      ok: false,
      error: "The SVG needs a viewBox or a width and height",
    };
  }
  svg.attrs.set("viewBox", viewBox);

  const problem = checkUses(svg);
  if (problem) return { ok: false, error: problem };

  const markup = serialize(svg, true);
  if (markup.length > MAX_SVG_LENGTH) {
    return { ok: false, error: "The SVG is too big" };
  }
  return { ok: true, svg: markup };
}
