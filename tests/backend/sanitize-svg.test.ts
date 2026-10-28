import { describe, expect, it } from "vitest";
import { MAX_SVG_LENGTH, sanitizeSvg } from "../../src/backend/sanitize-svg.js";

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function clean(input: string): string {
  const result = sanitizeSvg(input);
  if (result.ok === false) throw new Error(`rejected: ${result.error}`);
  return result.svg;
}

// Whatever went in, none of this may come out.
function expectSafe(output: string) {
  const withoutNamespace = output.replace(`${NS}`, "");
  expect(withoutNamespace).not.toMatch(/<script|<style|<foreignObject|<image/i);
  expect(withoutNamespace).not.toMatch(/\son\w+\s*=/i);
  expect(withoutNamespace).not.toMatch(/javascript:|data:|https?:|ftp:/i);
  expect(withoutNamespace).not.toMatch(/<!|<\?|\[CDATA\[|ENTITY|DOCTYPE/);
  expect(withoutNamespace).not.toMatch(/\sstyle\s*=|xlink|<a[\s>]/);
}

const wrap = (inner: string, attrs = 'viewBox="0 0 24 24"') =>
  `<svg ${NS} ${attrs}>${inner}</svg>`;

describe("sanitizeSvg, hostile input", () => {
  it("drops script elements and what is inside", () => {
    const out = clean(wrap('<script>alert(1)</script><path d="M0 0h1"/>'));
    expect(out).toBe(wrap('<path d="M0 0h1"/>'));
    expectSafe(out);
  });

  it("drops script in a different case, with a namespace or in CDATA", () => {
    for (const evil of [
      "<SCRIPT>alert(1)</SCRIPT>",
      "<Script>alert(1)</Script>",
      '<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script>',
      "<script><![CDATA[alert(1)]]></script>",
      '<script href="https://evil.example/x.js"/>',
    ]) {
      const out = clean(wrap(`${evil}<circle r="3"/>`));
      expect(out).toBe(wrap('<circle r="3"/>'));
    }
  });

  it("drops event handler attributes in every spelling", () => {
    const out = clean(
      `<svg ${NS} viewBox="0 0 8 8" onload="alert(1)" ONLOAD="alert(2)">` +
        '<g onclick="alert(3)"><rect width="1" height="1" onmouseover="alert(4)" OnClick="x"/></g>' +
        "</svg>",
    );
    expect(out).toBe(
      wrap('<g><rect width="1" height="1"/></g>', 'viewBox="0 0 8 8"'),
    );
    expectSafe(out);
  });

  it("drops an event handler without quotes or spaces", () => {
    const out = clean(
      `<svg viewBox="0 0 8 8"/onload=alert(1)><path d="M0 0"/></svg>`,
    );
    expectSafe(out);
    expect(out).toContain('<path d="M0 0"/>');
  });

  it("drops foreignObject with its content", () => {
    const out = clean(
      wrap(
        '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script><iframe src="https://evil.example"/></div></foreignObject><path d="M1 1"/>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
  });

  it("unwraps a link and removes its target", () => {
    const out = clean(
      wrap(
        '<a href="javascript:alert(1)" xlink:href="javascript:alert(2)"><path d="M1 1"/></a>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
    expectSafe(out);
  });

  it("only keeps href that points inside the document", () => {
    const out = clean(
      wrap(
        '<defs><path id="a" d="M0 0h4"/></defs>' +
          '<use href="#a"/><use xlink:href="#a" x="2"/>' +
          '<use href="http://evil.example/x.svg#a"/>' +
          '<use xlink:href="https://evil.example/x.svg#a"/>' +
          '<use href="data:image/svg+xml;base64,PHN2Zy8+"/>' +
          '<use href="javascript:alert(1)"/>' +
          '<use href="#missing"/>',
      ),
    );
    expect(out).toBe(
      wrap(
        '<defs><path id="a" d="M0 0h4"/></defs><use href="#a"/><use href="#a" x="2"/>',
      ),
    );
    expectSafe(out);
  });

  it("drops image elements, with or without a remote source", () => {
    const out = clean(
      wrap(
        '<image href="https://evil.example/pixel.png" width="1" height="1"/><image href="data:image/png;base64,AAAA"/><path d="M1 1"/>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
  });

  it("drops style elements and keeps no external url from them", () => {
    const out = clean(
      wrap(
        '<style>@import url(https://evil.example/x.css); path { fill: url(https://evil.example/x) }</style><path d="M1 1"/>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
  });

  it("drops style declarations with an external url, keeps plain ones", () => {
    const out = clean(
      wrap(
        '<path d="M1 1" style="fill:url(https://evil.example/x);stroke:#ff0000;background:url(http://evil.example/y);behavior:url(x.htc)"/>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1" stroke="#ff0000"/>'));
  });

  it("drops presentation attributes with an external or odd url", () => {
    const out = clean(
      wrap(
        '<path d="M1 1" fill="url(http://evil.example/x)" stroke="url(&quot;https://evil.example&quot;)" clip-path="url(//evil.example/x)" mask="url(x.svg#m)"/>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
  });

  it("keeps url(#id) references", () => {
    const out = clean(
      wrap(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M1 1" fill="url(#g)" style="stroke:url( #g )"/>',
      ),
    );
    expect(out).toContain('fill="url(#g)"');
    expect(out).toContain('stroke="url( #g )"');
  });

  it("does not let CSS escapes or comments hide a url", () => {
    const out = clean(
      wrap(
        '<path d="M1 1" style="fill:u\\72l(https://evil.example);stroke:/**/url(https://evil.example)"/>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
  });

  it("drops style and class attributes that are not presentation", () => {
    const out = clean(
      wrap(
        '<path d="M1 1" class="x" style="position:fixed;top:0;expression(alert(1))"/>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
  });

  it("drops animation elements", () => {
    const out = clean(
      wrap(
        '<path d="M1 1"><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="onmouseover" to="alert(1)"/><animateTransform type="rotate"/></path>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
  });

  it("never expands entities or keeps a DOCTYPE", () => {
    const lol =
      '<?xml version="1.0"?><!DOCTYPE svg [' +
      '<!ENTITY a "aaaaaaaaaa">' +
      '<!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">' +
      '<!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">' +
      '<!ENTITY x SYSTEM "file:///etc/passwd">' +
      `]><svg ${NS} viewBox="0 0 8 8"><title>&c;&x;</title><path d="M1 1"/></svg>`;
    const out = clean(lol);
    expect(out.length).toBeLessThan(200);
    expectSafe(out);
    expect(out).toContain('<path d="M1 1"/>');
  });

  it("drops a DOCTYPE that tries to smuggle in markup", () => {
    const out = clean(
      `<!DOCTYPE svg [<!ENTITY e "<script>alert(1)</script>">]><svg ${NS} viewBox="0 0 8 8">&e;<path d="M1 1"/></svg>`,
    );
    expectSafe(out);
    expect(out).toContain('<path d="M1 1"/>');
  });

  it("ignores xmlns and ns declarations in the input", () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/1999/xhtml" xmlns:evil="http://evil.example" viewBox="0 0 8 8"><path d="M1 1"/></svg>',
    );
    expect(out).toBe(wrap('<path d="M1 1"/>', 'viewBox="0 0 8 8"'));
  });

  it("drops comments and processing instructions", () => {
    const out = clean(
      `<?xml-stylesheet href="https://evil.example/x.css"?><svg ${NS} viewBox="0 0 8 8"><!-- <script>alert(1)</script> --><path d="M1 1"/><?php echo 1 ?></svg>`,
    );
    expect(out).toBe(wrap('<path d="M1 1"/>', 'viewBox="0 0 8 8"'));
  });

  it("keeps CDATA only as escaped text in a title", () => {
    const out = clean(
      wrap(
        '<title><![CDATA[<script>alert(1)</script>]]></title><path d="M1 1"/>',
      ),
    );
    expect(out).toBe(
      wrap(
        '<title>&lt;script&gt;alert(1)&lt;/script&gt;</title><path d="M1 1"/>',
      ),
    );
  });

  it("escapes what it writes", () => {
    const out = clean(
      wrap('<title>a &amp; b &lt;c&gt; "d"</title><path id="x" d="M1 1"/>'),
    );
    expect(out).toContain('<title>a &amp; b &lt;c&gt; "d"</title>');
  });

  it("does not let an entity rebuild a blocked value", () => {
    const out = clean(
      wrap(
        '<path d="M1 1" fill="&#x6A;avascript&#58;alert(1)" stroke="url&#40;https&#58;//evil.example&#41;"/>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
  });

  it("drops unknown and namespaced elements, with their children", () => {
    const out = clean(
      wrap(
        '<sodipodi:namedview id="base"><foo/></sodipodi:namedview><metadata><rdf:RDF><cc:Work/></rdf:RDF></metadata><text>hi</text><filter id="f"><feImage href="https://evil.example"/></filter><path d="M1 1"/>',
      ),
    );
    expect(out).toBe(wrap('<path d="M1 1"/>'));
  });

  it("keeps only a leading svg element", () => {
    for (const input of [
      "<html><body><svg viewBox='0 0 1 1'/></body></html>",
      "<svg:svg xmlns:svg='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>",
      "<SVG viewBox='0 0 1 1'/>",
      `<svg ${NS} viewBox="0 0 1 1"/><svg ${NS} viewBox="0 0 1 1"/>`,
      "not xml at all",
      "",
      "   ",
    ]) {
      expect(sanitizeSvg(input).ok, input).toBe(false);
    }
    expect(sanitizeSvg(undefined).ok).toBe(false);
    expect(sanitizeSvg(42).ok).toBe(false);
  });

  it("refuses an svg that is too big, deep or complex", () => {
    const big = wrap(`<path d="${"M0 0h1 ".repeat(30_000)}"/>`);
    expect(sanitizeSvg(big).ok).toBe(false);
    const huge = wrap("<!--" + "x".repeat(600 * 1024) + "-->");
    expect(sanitizeSvg(huge).ok).toBe(false);
    const deep = wrap("<g>".repeat(200) + "</g>".repeat(200));
    expect(sanitizeSvg(deep).ok).toBe(false);
    const many = wrap("<g/>".repeat(6000));
    expect(sanitizeSvg(many).ok).toBe(false);
    expect(MAX_SVG_LENGTH).toBe(100 * 1024);
  });

  it("refuses use chains that multiply when drawn", () => {
    let inner = '<path id="l0" d="M0 0h1"/>';
    for (let i = 1; i <= 25; i++) {
      inner += `<g id="l${i}"><use href="#l${i - 1}"/><use href="#l${i - 1}" x="1"/></g>`;
    }
    const out = clean(wrap(`<defs>${inner}</defs><use href="#l25"/>`));
    // Only the uses of a plain path survive, never a use of a group with a use.
    expect(out.match(/<use/g)).toHaveLength(2);
    expect(out).not.toContain('href="#l1"');
    expect(out).not.toContain('href="#l25"');
  });

  it("refuses a use that points at itself or its parent", () => {
    const out = clean(
      wrap(
        '<g id="a"><use href="#a"/></g><use id="u" href="#u"/><use id="v" href="#a"/>',
      ),
    );
    expect(out).not.toContain("<use");
  });

  it("refuses a use fan out that is too large", () => {
    const shapes = '<path d="M0 0h1"/>'.repeat(400);
    const uses = '<use href="#big"/>'.repeat(100);
    const result = sanitizeSvg(
      wrap(`<defs><g id="big">${shapes}</g></defs>${uses}`),
    );
    expect(result.ok).toBe(false);
  });

  it("survives junk that a lenient parser might trip on", () => {
    for (const input of [
      "<svg viewBox='0 0 1 1'><path d='M1 1'",
      "<svg viewBox='0 0 1 1'></g></g><path d='M1 1'/></svg>",
      "<svg viewBox='0 0 1 1'><g><path d='M1 1'/></svg>",
      "<svg viewBox='0 0 1 1' viewBox='0 0 9 9' __proto__='x' constructor='y'/>",
      "<svg viewBox='0 0 1 1'>\u0000<path d='M1 1'/>\u0000</svg>",
    ]) {
      const result = sanitizeSvg(input);
      if (result.ok) expectSafe(result.svg);
    }
  });
});

describe("sanitizeSvg, viewBox", () => {
  it("keeps a valid viewBox and drops the root size", () => {
    const out = clean(
      `<svg ${NS} width="48" height="48" viewBox="0 0 24 24"/>`,
    );
    expect(out).toBe(`<svg ${NS} viewBox="0 0 24 24"/>`);
  });

  it("derives the viewBox from width and height", () => {
    expect(clean("<svg width='32px' height='16'/>")).toBe(
      `<svg ${NS} viewBox="0 0 32 16"/>`,
    );
  });

  it("refuses an svg that has no size at all or a broken viewBox", () => {
    expect(sanitizeSvg("<svg/>").ok).toBe(false);
    expect(sanitizeSvg("<svg width='50%' height='1em'/>").ok).toBe(false);
    expect(sanitizeSvg("<svg viewBox='0 0 0 0'/>").ok).toBe(false);
    expect(sanitizeSvg("<svg viewBox='a b c d'/>").ok).toBe(false);
    expect(sanitizeSvg("<svg viewBox='0 0 24'/>").ok).toBe(false);
  });
});

describe("sanitizeSvg, real files", () => {
  it("cleans an Inkscape file but keeps the drawing and its colors", () => {
    const inkscape = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<svg
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:cc="http://creativecommons.org/ns#"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   width="64mm" height="64mm" viewBox="0 0 64 64" version="1.1" id="svg8"
   inkscape:version="1.2" sodipodi:docname="logo.svg">
  <defs id="defs2"/>
  <sodipodi:namedview id="base" pagecolor="#ffffff" inkscape:zoom="1.4"/>
  <metadata id="metadata5">
    <rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format></cc:Work></rdf:RDF>
  </metadata>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1" transform="translate(0,-233)">
    <rect style="fill:#ff6600;fill-opacity:1;stroke:none;stroke-width:0.26" id="rect10" width="40" height="40" x="12" y="245" ry="6"/>
    <path style="fill:none;stroke:#000000;stroke-width:2;stroke-linecap:round;stroke-opacity:1" d="m 20,260 c 10,-10 20,10 30,0" id="path12" inkscape:connector-curvature="0"/>
  </g>
</svg>`;
    const out = clean(inkscape);
    expect(out).toBe(
      `<svg ${NS} viewBox="0 0 64 64">` +
        '<defs id="defs2"/>' +
        '<g id="layer1" transform="translate(0,-233)">' +
        '<rect id="rect10" width="40" height="40" x="12" y="245" ry="6" fill="#ff6600" fill-opacity="1" stroke="none" stroke-width="0.26"/>' +
        '<path d="m 20,260 c 10,-10 20,10 30,0" id="path12" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-opacity="1"/>' +
        "</g></svg>",
    );
    expectSafe(out);
  });

  it("keeps gradients, clip paths, masks and local use", () => {
    const file = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
  <title>Badge</title>
  <desc>A badge</desc>
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox" spreadMethod="pad">
      <stop offset="0%" stop-color="#ff0" stop-opacity="1"/>
      <stop offset="100%" stop-color="rgb(255, 0, 0)" stop-opacity="0.5"/>
    </linearGradient>
    <radialGradient id="rad" cx="50" cy="50" r="50" fx="40" fy="40" xlink:href="#grad"/>
    <clipPath id="clip"><circle cx="50" cy="50" r="40"/></clipPath>
    <mask id="mask"><rect width="100" height="100" fill="#fff"/></mask>
    <symbol id="sym" viewBox="0 0 10 10"><path d="M0 0L10 10"/></symbol>
    <polygon id="tri" points="0,0 10,0 5,8"/>
  </defs>
  <g clip-path="url(#clip)" mask="url(#mask)">
    <rect width="100" height="100" fill="url(#grad)"/>
    <ellipse cx="50" cy="50" rx="30" ry="20" fill="url(#rad)" opacity="0.8"/>
    <line x1="0" y1="0" x2="100" y2="100" stroke="#000" stroke-dasharray="4 2"/>
    <polyline points="0,0 10,10" fill="none"/>
    <use xlink:href="#tri" x="10" y="10"/>
    <use href="#sym" x="60" y="60" width="20" height="20"/>
  </g>
</svg>`;
    const out = clean(file);
    expect(out).toContain("<title>Badge</title>");
    expect(out).toContain("<desc>A badge</desc>");
    expect(out).toContain(
      '<linearGradient id="grad" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox" spreadMethod="pad">',
    );
    expect(out).toContain(
      '<stop offset="0%" stop-color="#ff0" stop-opacity="1"/>',
    );
    expect(out).toContain('stop-color="rgb(255, 0, 0)"');
    expect(out).toContain(
      '<radialGradient id="rad" cx="50" cy="50" r="50" fx="40" fy="40" href="#grad"/>',
    );
    expect(out).toContain(
      '<clipPath id="clip"><circle cx="50" cy="50" r="40"/></clipPath>',
    );
    expect(out).toContain('<mask id="mask">');
    expect(out).toContain('<g clip-path="url(#clip)" mask="url(#mask)">');
    expect(out).toContain('fill="url(#grad)"');
    expect(out).toContain('<use href="#tri" x="10" y="10"/>');
    expect(out).toContain(
      '<use href="#sym" x="60" y="60" width="20" height="20"/>',
    );
    expect(out).toContain('<polygon id="tri" points="0,0 10,0 5,8"/>');
    expectSafe(out);
  });

  it("is stable when run on its own output", () => {
    const first = clean(
      wrap(
        '<title>T &amp; U</title><defs><path id="p" d="M0 0h4"/></defs><use href="#p"/><g fill="url(#p)" opacity=".5"/>',
      ),
    );
    expect(clean(first)).toBe(first);
  });
});
