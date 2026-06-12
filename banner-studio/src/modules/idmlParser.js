/**
 * idmlParser.js — parses an Adobe InDesign IDML package (ZIP of XML files)
 * into clean per-master JSON layout descriptions.
 *
 * Coordinate notes:
 *  - IDML units are points; we treat 1pt = 1px (72 DPI screen mapping).
 *  - Page GeometricBounds = [top, left, bottom, right] in page-local coords.
 *  - Page items carry an ItemTransform affine matrix [a b c d tx ty] mapping
 *    item-local coords into spread coords. Groups nest, so transforms compose.
 *  - Item geometry comes from PathGeometry anchor points (preferred) or a
 *    GeometricBounds attribute when present.
 */
import JSZip from 'jszip';

const IDML_PARSE_ERROR =
  'Could not read this IDML file. Please re-export from InDesign (File → Export → IDML).';

// ---------- small math helpers ----------

const IDENTITY = [1, 0, 0, 1, 0, 0];

function parseMatrix(str) {
  if (!str) return IDENTITY;
  const v = str.trim().split(/\s+/).map(Number);
  return v.length === 6 && v.every((n) => Number.isFinite(n)) ? v : IDENTITY;
}

// result = outer ∘ inner  (apply inner first, then outer)
function multiplyMatrix(outer, inner) {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyMatrix(m, x, y) {
  const [a, b, c, d, e, f] = m;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

function transformBounds(m, bounds) {
  const corners = [
    applyMatrix(m, bounds.left, bounds.top),
    applyMatrix(m, bounds.right, bounds.top),
    applyMatrix(m, bounds.right, bounds.bottom),
    applyMatrix(m, bounds.left, bounds.bottom),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------- color handling ----------

function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')
  ).toUpperCase();
}

function cmykToHex(c, m, y, k) {
  // c/m/y/k in 0..100
  const r = 255 * (1 - c / 100) * (1 - k / 100);
  const g = 255 * (1 - m / 100) * (1 - k / 100);
  const b = 255 * (1 - y / 100) * (1 - k / 100);
  return rgbToHex(r, g, b);
}

function buildColorMap(graphicDoc) {
  const map = {
    'Color/Black': '#000000',
    'Color/Paper': '#FFFFFF',
    'Color/Registration': '#000000',
    'Color/None': null,
    'Swatch/None': null,
  };
  if (!graphicDoc) return map;
  for (const el of Array.from(graphicDoc.getElementsByTagName('Color'))) {
    const self = el.getAttribute('Self');
    const space = el.getAttribute('Space');
    const values = (el.getAttribute('ColorValue') || '')
      .trim()
      .split(/\s+/)
      .map(Number);
    let hex = null;
    if (space === 'RGB' && values.length >= 3) {
      hex = rgbToHex(values[0], values[1], values[2]);
    } else if (space === 'CMYK' && values.length >= 4) {
      hex = cmykToHex(values[0], values[1], values[2], values[3]);
    } else if (space === 'LAB' && values.length >= 3) {
      // crude LAB → grayscale fallback via L
      const l = clamp255((values[0] / 100) * 255);
      hex = rgbToHex(l, l, l);
    }
    if (self && hex) map[self] = hex;
  }
  // Gradients: approximate with the first stop's color if resolvable
  for (const el of Array.from(graphicDoc.getElementsByTagName('Gradient'))) {
    const self = el.getAttribute('Self');
    const stop = el.getElementsByTagName('GradientStop')[0];
    const stopColor = stop && stop.getAttribute('StopColor');
    if (self && stopColor && map[stopColor]) map[self] = map[stopColor];
  }
  return map;
}

function resolveColor(ref, colorMap, fallback = null) {
  if (!ref) return fallback;
  if (ref in colorMap) return colorMap[ref];
  if (ref.endsWith('/None')) return null;
  return fallback;
}

// ---------- font helpers ----------

const JUSTIFICATION_MAP = {
  LeftAlign: 'left',
  CenterAlign: 'center',
  RightAlign: 'right',
  LeftJustified: 'left',
  RightJustified: 'right',
  CenterJustified: 'center',
  FullyJustified: 'justify',
  ToBindingSide: 'right',
  AwayFromBindingSide: 'left',
};

function fontStyleToWeight(style) {
  if (!style) return { weight: 'normal', italic: false };
  const s = style.toLowerCase();
  const italic = s.includes('italic') || s.includes('oblique');
  let weight = 'normal';
  if (s.includes('thin')) weight = '100';
  else if (s.includes('extralight') || s.includes('ultra light')) weight = '200';
  else if (s.includes('light')) weight = '300';
  else if (s.includes('medium')) weight = '500';
  else if (s.includes('semibold') || s.includes('demi')) weight = '600';
  else if (s.includes('extrabold') || s.includes('heavy')) weight = '800';
  else if (s.includes('black')) weight = '900';
  else if (s.includes('bold')) weight = 'bold';
  return { weight, italic };
}

// ---------- story (text) extraction ----------

function getDirectChild(el, tag) {
  for (const child of Array.from(el.children)) {
    if (child.tagName === tag) return child;
  }
  return null;
}

function extractAppliedFont(csr) {
  const props = getDirectChild(csr, 'Properties');
  if (props) {
    const applied = getDirectChild(props, 'AppliedFont');
    if (applied && applied.textContent) return applied.textContent.trim();
  }
  const attr = csr.getAttribute('AppliedFont');
  return attr || null;
}

function parseStory(storyDoc, colorMap) {
  const storyEl = storyDoc.getElementsByTagName('Story')[0];
  if (!storyEl) return null;
  const self = storyEl.getAttribute('Self');

  const lines = [];
  let fontSize = null;
  let fontFamily = null;
  let fontWeight = 'normal';
  let italic = false;
  let color = null;
  let align = null;

  for (const psr of Array.from(storyEl.getElementsByTagName('ParagraphStyleRange'))) {
    const just = psr.getAttribute('Justification');
    if (!align && just && JUSTIFICATION_MAP[just]) align = JUSTIFICATION_MAP[just];

    for (const csr of Array.from(psr.getElementsByTagName('CharacterStyleRange'))) {
      if (fontSize == null) {
        const ps = parseFloat(csr.getAttribute('PointSize'));
        if (Number.isFinite(ps)) fontSize = ps;
      }
      if (!fontFamily) fontFamily = extractAppliedFont(csr);
      const fs = csr.getAttribute('FontStyle');
      if (fs && fontWeight === 'normal') {
        const parsed = fontStyleToWeight(fs);
        fontWeight = parsed.weight;
        italic = parsed.italic;
      }
      if (!color) {
        color = resolveColor(csr.getAttribute('FillColor'), colorMap, null);
      }
      // walk Content / Br in document order
      for (const node of Array.from(csr.childNodes)) {
        if (node.nodeName === 'Content') {
          lines.push(node.textContent || '');
        } else if (node.nodeName === 'Br') {
          lines.push('\n');
        }
      }
    }
    lines.push('\n');
  }

  // join, collapse the trailing paragraph break
  let text = '';
  for (const piece of lines) {
    if (piece === '\n') {
      if (!text.endsWith('\n')) text += '\n';
    } else {
      text += piece;
    }
  }
  text = text.replace(/\n+$/, '');

  return {
    self,
    text,
    fontSize: fontSize || 14,
    fontFamily: fontFamily || 'Assistant',
    fontWeight,
    italic,
    color: color || '#000000',
    align: align || 'right',
  };
}

// ---------- geometry ----------

function getLocalBounds(el) {
  // Prefer an explicit GeometricBounds attribute when present.
  const gb = el.getAttribute('GeometricBounds');
  if (gb) {
    const v = gb.trim().split(/\s+/).map(Number);
    if (v.length === 4 && v.every(Number.isFinite)) {
      return { top: v[0], left: v[1], bottom: v[2], right: v[3] };
    }
  }
  // Otherwise compute the bbox of PathGeometry anchor points.
  const anchors = [];
  for (const pp of Array.from(el.getElementsByTagName('PathPointType'))) {
    // only consider points belonging to this element, not nested children items
    let parent = pp.parentElement;
    let belongs = false;
    while (parent) {
      if (parent === el) {
        belongs = true;
        break;
      }
      if (PAGE_ITEM_TAGS.has(parent.tagName) && parent !== el) break;
      parent = parent.parentElement;
    }
    if (!belongs) continue;
    const a = (pp.getAttribute('Anchor') || '').trim().split(/\s+/).map(Number);
    if (a.length === 2 && a.every(Number.isFinite)) anchors.push(a);
  }
  if (!anchors.length) return null;
  const xs = anchors.map((p) => p[0]);
  const ys = anchors.map((p) => p[1]);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

const PAGE_ITEM_TAGS = new Set([
  'Rectangle',
  'Oval',
  'Polygon',
  'GraphicLine',
  'TextFrame',
  'Group',
]);

const IMAGE_CHILD_TAGS = ['Image', 'PDF', 'EPS', 'PICT', 'WMF', 'ImportedPage'];

function findImageChild(el) {
  for (const tag of IMAGE_CHILD_TAGS) {
    const child = el.getElementsByTagName(tag)[0];
    if (child) return child;
  }
  return null;
}

function extractLinkName(imageEl) {
  if (!imageEl) return null;
  const link = imageEl.getElementsByTagName('Link')[0];
  if (!link) return null;
  const uri = link.getAttribute('LinkResourceURI') || '';
  const m = uri.match(/[^/\\]+$/);
  return m ? decodeURIComponent(m[0]) : null;
}

// ---------- main spread walk ----------

function walkItems(containerEl, parentMatrix, ctx, out) {
  for (const el of Array.from(containerEl.children)) {
    if (!PAGE_ITEM_TAGS.has(el.tagName)) continue;
    const matrix = multiplyMatrix(parentMatrix, parseMatrix(el.getAttribute('ItemTransform')));

    if (el.tagName === 'Group') {
      walkItems(el, matrix, ctx, out);
      continue;
    }

    const local = getLocalBounds(el);
    if (!local) continue;
    const spreadBounds = transformBounds(matrix, local);
    const x = spreadBounds.left - ctx.pageOffsetX;
    const y = spreadBounds.top - ctx.pageOffsetY;
    const width = spreadBounds.right - spreadBounds.left;
    const height = spreadBounds.bottom - spreadBounds.top;
    if (width < 0.5 || height < 0.5) continue;

    const visible = el.getAttribute('Visible') !== 'false';
    if (!visible) continue;

    const id = `el_${String(++ctx.counter).padStart(3, '0')}`;
    const fill = resolveColor(el.getAttribute('FillColor'), ctx.colorMap, null);
    const stroke = resolveColor(el.getAttribute('StrokeColor'), ctx.colorMap, null);
    const strokeWeight = parseFloat(el.getAttribute('StrokeWeight'));

    const base = {
      id,
      idmlSelf: el.getAttribute('Self'),
      x: round2(x),
      y: round2(y),
      width: round2(width),
      height: round2(height),
      opacity: 1,
      stroke: stroke || null,
      strokeWidth: Number.isFinite(strokeWeight) && stroke ? strokeWeight : 0,
    };

    if (el.tagName === 'TextFrame') {
      const storyId = el.getAttribute('ParentStory');
      const story = ctx.stories[storyId];
      out.push({
        ...base,
        type: 'text',
        text: story ? story.text : '',
        fontSize: story ? story.fontSize : 14,
        fontFamily: story ? story.fontFamily : 'Assistant',
        fontWeight: story ? story.fontWeight : 'normal',
        italic: story ? story.italic : false,
        color: story ? story.color : '#000000',
        align: story ? story.align : 'right',
        fill: fill || null,
      });
    } else {
      const imageChild = findImageChild(el);
      if (imageChild) {
        out.push({
          ...base,
          type: 'image',
          src: null,
          linkName: extractLinkName(imageChild),
          originalAspect: round2(width / height),
          fill: fill || '#3a3a3a',
        });
      } else {
        out.push({
          ...base,
          type: 'shape',
          shape: el.tagName === 'Oval' ? 'ellipse' : 'rect',
          fill: fill || '#888888',
        });
      }
    }
  }
}

function classifyRoles(elements, pageW, pageH) {
  const pageArea = pageW * pageH;
  let backgroundAssigned = false;
  for (const el of elements) {
    const area = el.width * el.height;
    const coverage = area / pageArea;
    if (!backgroundAssigned && coverage >= 0.85 && (el.type === 'image' || el.type === 'shape')) {
      el.role = 'background';
      backgroundAssigned = true;
      continue;
    }
    if (el.type === 'image') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const nearEdgeX = cx < pageW * 0.3 || cx > pageW * 0.7;
      const nearEdgeY = cy < pageH * 0.35 || cy > pageH * 0.65;
      el.role = coverage <= 0.18 && (nearEdgeX || nearEdgeY) ? 'logo' : 'image';
    } else if (el.type === 'text') {
      el.role = el.fontSize >= 18 ? 'headline' : 'body';
    } else {
      const looksLikeButton =
        coverage > 0.005 && coverage < 0.2 && el.width / el.height > 1.5 && el.width / el.height < 8;
      el.role = looksLikeButton ? 'cta' : 'shape';
    }
  }
}

async function readXML(zip, path, parser) {
  const f = zip.file(path);
  if (!f) return null;
  const txt = await f.async('text');
  const doc = parser.parseFromString(txt, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  return doc;
}

/**
 * Parse an IDML File/Blob → { masters: [{ masterId, name, width, height, elements }] }
 */
export async function parseIDML(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error(IDML_PARSE_ERROR);
  }

  const parser = new DOMParser();

  const designMap = await readXML(zip, 'designmap.xml', parser);
  if (!designMap) throw new Error(IDML_PARSE_ERROR);

  // colors
  const graphicDoc = await readXML(zip, 'Resources/Graphic.xml', parser);
  const colorMap = buildColorMap(graphicDoc);

  // stories
  const stories = {};
  const storyFiles = Object.keys(zip.files).filter(
    (p) => p.startsWith('Stories/') && p.endsWith('.xml')
  );
  for (const path of storyFiles) {
    const doc = await readXML(zip, path, parser);
    if (!doc) continue;
    const story = parseStory(doc, colorMap);
    if (story && story.self) stories[story.self] = story;
  }

  // spread order from designmap (falls back to alphabetical zip order)
  let spreadPaths = [];
  for (const el of Array.from(designMap.getElementsByTagName('idPkg:Spread'))) {
    const src = el.getAttribute('src');
    if (src) spreadPaths.push(src);
  }
  if (!spreadPaths.length) {
    spreadPaths = Object.keys(zip.files)
      .filter((p) => p.startsWith('Spreads/') && p.endsWith('.xml'))
      .sort();
  }
  if (!spreadPaths.length) throw new Error(IDML_PARSE_ERROR);

  const masters = [];
  let spreadIndex = 0;
  for (const path of spreadPaths) {
    spreadIndex += 1;
    const doc = await readXML(zip, path, parser);
    if (!doc) continue;
    const spreadEl = doc.getElementsByTagName('Spread')[0];
    if (!spreadEl) continue;

    const pages = Array.from(spreadEl.getElementsByTagName('Page'));
    if (!pages.length) continue;
    // Banner masters are single-page spreads; use the first page.
    const page = pages[0];
    const pb = (page.getAttribute('GeometricBounds') || '')
      .trim()
      .split(/\s+/)
      .map(Number);
    if (pb.length !== 4 || !pb.every(Number.isFinite)) continue;
    const pageBounds = { top: pb[0], left: pb[1], bottom: pb[2], right: pb[3] };
    const pageMatrix = parseMatrix(page.getAttribute('ItemTransform'));
    const pageInSpread = transformBounds(pageMatrix, pageBounds);

    const width = round2(pageInSpread.right - pageInSpread.left);
    const height = round2(pageInSpread.bottom - pageInSpread.top);
    if (width <= 0 || height <= 0) continue;

    const ctx = {
      colorMap,
      stories,
      counter: 0,
      pageOffsetX: pageInSpread.left,
      pageOffsetY: pageInSpread.top,
    };
    const elements = [];
    walkItems(spreadEl, IDENTITY, ctx, elements);

    // drop elements entirely outside the page (pasteboard items)
    const onPage = elements.filter(
      (el) => el.x + el.width > -1 && el.y + el.height > -1 && el.x < width + 1 && el.y < height + 1
    );
    classifyRoles(onPage, width, height);

    masters.push({
      masterId: `spread_${spreadIndex}`,
      name: `Master ${spreadIndex} (${Math.round(width)}×${Math.round(height)})`,
      width: Math.round(width),
      height: Math.round(height),
      elements: onPage,
    });
  }

  if (!masters.length) throw new Error(IDML_PARSE_ERROR);
  return { masters };
}

export { IDML_PARSE_ERROR };
