/**
 * Node smoke test for the pure-logic modules:
 *   synthetic IDML → parseIDML → fallbackAdapt/clampElements → buildIDML
 * Run: node scripts/smoke-test.mjs
 */
import { DOMParser } from 'linkedom';
import JSZip from 'jszip';
import assert from 'node:assert';

globalThis.DOMParser = DOMParser;

const { parseIDML } = await import('../src/modules/idmlParser.js');
const { fallbackAdapt, clampElements } = await import('../src/modules/aiAdapter.js');
const { buildIDML } = await import('../src/modules/idmlWriter.js');

// ---- 1. build a synthetic IDML: one 728×90 leaderboard master ----
const W = 728;
const H = 90;
const zip = new JSZip();
zip.file('mimetype', 'application/vnd.adobe.indesign-idml-package');
zip.file(
  'designmap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="8.0" Self="d">
<idPkg:Graphic src="Resources/Graphic.xml"/>
<idPkg:Spread src="Spreads/Spread_u1.xml"/>
<idPkg:Story src="Stories/Story_s1.xml"/>
</Document>`
);
zip.file(
  'Resources/Graphic.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Graphic xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="8.0">
<Color Self="Color/Purple" Model="Process" Space="RGB" ColorValue="124 92 252" Name="Purple"/>
<Color Self="Color/White" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="White"/>
</idPkg:Graphic>`
);
// spread coords: page centered → origin at page center; items in spread coords
const rect = (x1, y1, x2, y2) =>
  `<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>` +
  `<PathPointType Anchor="${x1} ${y1}"/><PathPointType Anchor="${x1} ${y2}"/>` +
  `<PathPointType Anchor="${x2} ${y2}"/><PathPointType Anchor="${x2} ${y1}"/>` +
  `</PathPointArray></GeometryPathType></PathGeometry></Properties>`;
zip.file(
  'Spreads/Spread_u1.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="8.0">
<Spread Self="u1" PageCount="1" ItemTransform="1 0 0 1 0 0">
<Page Self="p1" GeometricBounds="0 0 ${H} ${W}" ItemTransform="1 0 0 1 ${-W / 2} ${-H / 2}"/>
<Rectangle Self="r1" ItemTransform="1 0 0 1 0 0" FillColor="Color/Purple">${rect(-W / 2, -H / 2, W / 2, H / 2)}</Rectangle>
<Rectangle Self="r2" ItemTransform="1 0 0 1 0 0" FillColor="Color/Purple">${rect(W / 2 - 108, -H / 2 + 10, W / 2 - 28, -H / 2 + 80)}<Image Self="img1"><Link Self="lnk1" LinkResourceURI="file:/C:/assets/logo.png"/></Image></Rectangle>
<TextFrame Self="t1" ParentStory="s1" ItemTransform="1 0 0 1 0 0">${rect(-W / 2 + 40, -H / 2 + 20, -W / 2 + 340, -H / 2 + 70)}</TextFrame>
</Spread>
</idPkg:Spread>`
);
zip.file(
  'Stories/Story_s1.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="8.0">
<Story Self="s1">
<ParagraphStyleRange Justification="RightAlign">
<CharacterStyleRange PointSize="24" FontStyle="Bold" FillColor="Color/White">
<Properties><AppliedFont type="string">Assistant</AppliedFont></Properties>
<Content>פרויקט מגורים יוקרתי</Content><Br/><Content>בלב העיר</Content>
</CharacterStyleRange>
</ParagraphStyleRange>
</Story>
</idPkg:Story>`
);
const idmlBuffer = await zip.generateAsync({ type: 'nodebuffer' });

// ---- 2. parse ----
const { masters } = await parseIDML(idmlBuffer);
assert.equal(masters.length, 1, 'one master');
const master = masters[0];
assert.equal(master.width, W);
assert.equal(master.height, H);
assert.equal(master.elements.length, 3, 'three elements');

const bg = master.elements.find((e) => e.role === 'background');
assert.ok(bg, 'background detected');
assert.equal(bg.fill, '#7C5CFC', 'RGB color resolved');
assert.ok(Math.abs(bg.x) < 0.5 && Math.abs(bg.y) < 0.5, 'background at origin');

const logo = master.elements.find((e) => e.type === 'image' && e !== bg);
assert.ok(logo, 'image element found');
assert.equal(logo.role, 'logo', 'logo role classified');
assert.equal(logo.linkName, 'logo.png', 'link name extracted');
assert.ok(Math.abs(logo.x - (W - 108)) < 0.5, `logo x ≈ ${W - 108}, got ${logo.x}`);

const text = master.elements.find((e) => e.type === 'text');
assert.ok(text, 'text element found');
assert.equal(text.text, 'פרויקט מגורים יוקרתי\nבלב העיר', 'story text with Br line break');
assert.equal(text.fontSize, 24);
assert.equal(text.fontWeight, 'bold');
assert.equal(text.align, 'right');
assert.equal(text.color, '#FFFFFF', 'CMYK paper white resolved');
assert.ok(Math.abs(text.x - 40) < 0.5 && Math.abs(text.y - 20) < 0.5, 'text position');
console.log('✓ parseIDML: dimensions, colors, transforms, story text, roles');

// ---- 3. fallback adaptation + clamping ----
const target = { width: 300, height: 250 };
const adapted = fallbackAdapt(master, target);
const aBg = adapted.find((e) => e.role === 'background');
assert.deepEqual(
  [aBg.x, aBg.y, aBg.width, aBg.height],
  [0, 0, 300, 250],
  'background fills target'
);
for (const el of adapted) {
  assert.ok(el.x >= 0 && el.y >= 0, `${el.id} inside top-left`);
  assert.ok(el.x + el.width <= 300.01 && el.y + el.height <= 250.01, `${el.id} inside bottom-right`);
}
const clamped = clampElements([{ id: 'z', type: 'text', x: -50, y: 900, width: 500, height: 80, fontSize: 2 }], 300, 250);
assert.equal(clamped[0].x, 0);
assert.equal(clamped[0].width, 300);
assert.equal(clamped[0].y, 170);
assert.equal(clamped[0].fontSize, 6);
console.log('✓ fallbackAdapt / clampElements: bounds respected');

// ---- 4. IDML writer round-trip ----
const banners = [
  { id: 'b1', name: 'Medium Rectangle', width: 300, height: 250, elements: adapted },
  { id: 'b2', name: 'Leaderboard', width: 728, height: 90, elements: master.elements },
];
const blob = await buildIDML(banners);
const outZip = await JSZip.loadAsync(await blob.arrayBuffer());
const names = Object.keys(outZip.files);
assert.ok(names.includes('mimetype'), 'mimetype present');
assert.ok(names.includes('designmap.xml'), 'designmap present');
assert.equal(names.filter((n) => n.startsWith('Spreads/') && n.endsWith('.xml')).length, 2, 'two spreads');
assert.equal(names.filter((n) => n.startsWith('Stories/') && n.endsWith('.xml')).length, 2, 'two stories');
assert.ok(names.includes('Resources/Graphic.xml') && names.includes('Resources/Styles.xml'));

const mimetype = await outZip.file('mimetype').async('text');
assert.equal(mimetype, 'application/vnd.adobe.indesign-idml-package');

// every generated XML part must be well-formed
const parser = new DOMParser();
for (const name of names.filter((n) => n.endsWith('.xml'))) {
  const txt = await outZip.file(name).async('text');
  const doc = parser.parseFromString(txt, 'text/xml');
  assert.ok(doc.documentElement, `${name} parses`);
}

// the written IDML must survive a round-trip through our own parser
const reparsed = await parseIDML(await blob.arrayBuffer());
assert.equal(reparsed.masters.length, 2, 'round-trip: two masters');
assert.equal(reparsed.masters[0].width, 300);
assert.equal(reparsed.masters[1].width, 728);
const rtText = reparsed.masters[1].elements.find((e) => e.type === 'text');
assert.ok(rtText && rtText.text.includes('פרויקט'), 'round-trip: Hebrew text survives');
console.log('✓ buildIDML: valid package, well-formed XML, parser round-trip OK');

console.log('\nAll smoke tests passed.');
