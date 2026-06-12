/**
 * idmlWriter.js — generates an InDesign IDML package from the edited banners,
 * so results can be reopened and refined in InDesign.
 *
 * Output: one document, one page per banner (web intent, pixel units).
 * - text elements   → native TextFrames + Stories (editable in InDesign)
 * - shapes          → Rectangles/Ovals with RGB swatches
 * - image elements  → graphic frames (placeholders); linked files must be
 *   relinked in InDesign since browser uploads carry no file path.
 *
 * IDML is a UCF/ZIP package: `mimetype` (stored, uncompressed) + designmap.xml
 * + Resources/Spreads/Stories/XML parts, per the Adobe IDML specification.
 */
import JSZip from 'jszip';

const PKG_NS = 'http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging';
const DOM_VERSION = '8.0';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hexToRGBValue(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '0 0 0';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const ALIGN_TO_JUSTIFICATION = {
  left: 'LeftAlign',
  center: 'CenterAlign',
  right: 'RightAlign',
  justify: 'FullyJustified',
};

function weightToFontStyle(el) {
  const w = String(el.fontWeight || 'normal');
  let style = 'Regular';
  if (w === 'bold' || Number(w) >= 700) style = 'Bold';
  else if (Number(w) >= 500) style = 'Medium';
  else if (Number(w) > 0 && Number(w) <= 300) style = 'Light';
  if (el.italic) style = style === 'Regular' ? 'Italic' : `${style} Italic`;
  return style;
}

function hasHebrew(text) {
  return /[֐-׿]/.test(text || '');
}

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

/** 4-corner rectangle path in spread coordinates (spread origin = page center). */
function pathGeometry(el, pageW, pageH) {
  const x1 = el.x - pageW / 2;
  const y1 = el.y - pageH / 2;
  const x2 = x1 + el.width;
  const y2 = y1 + el.height;
  const pt = (x, y) =>
    `<PathPointType Anchor="${fmt(x)} ${fmt(y)}" LeftDirection="${fmt(x)} ${fmt(y)}" RightDirection="${fmt(x)} ${fmt(y)}"/>`;
  return (
    '<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>' +
    pt(x1, y1) +
    pt(x1, y2) +
    pt(x2, y2) +
    pt(x2, y1) +
    '</PathPointArray></GeometryPathType></PathGeometry></Properties>'
  );
}

class ColorRegistry {
  constructor() {
    this.map = new Map(); // hex → Self id
  }
  ref(hex) {
    if (!hex) return 'Swatch/None';
    const key = hex.toUpperCase();
    if (key === '#000000') return 'Color/Black';
    if (key === '#FFFFFF') return 'Color/Paper';
    if (!this.map.has(key)) this.map.set(key, `Color/bs_${this.map.size + 1}`);
    return this.map.get(key);
  }
  xml() {
    let out = '';
    for (const [hex, self] of this.map) {
      out += `<Color Self="${self}" Model="Process" Space="RGB" ColorValue="${hexToRGBValue(hex)}" Name="${self.replace('Color/', '')}" ColorOverride="Normal"/>\n`;
    }
    return out;
  }
}

function storyXML(storySelf, el, colors) {
  const just = ALIGN_TO_JUSTIFICATION[el.align] || 'RightAlign';
  const rtl = hasHebrew(el.text);
  const linesXML = String(el.text || '')
    .split('\n')
    .map((line) => `<Content>${esc(line)}</Content>`)
    .join('<Br/>');

  return (
    XML_HEAD +
    `<idPkg:Story xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">\n` +
    `<Story Self="${storySelf}" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">\n` +
    `<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="${rtl ? 'RightToLeftDirection' : 'LeftToRightDirection'}"/>\n` +
    `<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false"/>\n` +
    `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle" Justification="${just}">\n` +
    `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]" PointSize="${fmt(el.fontSize || 14)}" FillColor="${colors.ref(el.color || '#000000')}" FontStyle="${esc(weightToFontStyle(el))}">\n` +
    `<Properties><AppliedFont type="string">${esc(el.fontFamily || 'Assistant')}</AppliedFont></Properties>\n` +
    linesXML +
    `\n</CharacterStyleRange>\n</ParagraphStyleRange>\n</Story>\n</idPkg:Story>\n`
  );
}

function spreadXML(banner, ids, colors, stories) {
  const W = banner.width;
  const H = banner.height;
  const spreadSelf = ids.next('spread');
  const pageSelf = ids.next('page');

  let items = '';
  for (const el of banner.elements) {
    const itemSelf = ids.next('item');
    const geometry = pathGeometry(el, W, H);
    const strokeAttrs = el.stroke
      ? ` StrokeColor="${colors.ref(el.stroke)}" StrokeWeight="${fmt(el.strokeWidth || 1)}"`
      : ' StrokeColor="Swatch/None" StrokeWeight="0"';
    const opacityXML =
      (el.opacity ?? 1) < 1
        ? `<TransparencySetting><BlendingSetting Opacity="${fmt((el.opacity ?? 1) * 100)}"/></TransparencySetting>`
        : '';

    if (el.type === 'text') {
      const storySelf = ids.next('story');
      stories.push({ self: storySelf, xml: storyXML(storySelf, el, colors) });
      items +=
        `<TextFrame Self="${itemSelf}" ParentStory="${storySelf}" ContentType="TextType" ItemLayer="${ids.layer}" Visible="true" Name="$ID/" ItemTransform="1 0 0 1 0 0" FillColor="${el.fill ? colors.ref(el.fill) : 'Swatch/None'}"${strokeAttrs}>` +
        geometry +
        opacityXML +
        `<TextFramePreference TextColumnCount="1" VerticalJustification="CenterAlign" AutoSizingType="Off"/>` +
        `</TextFrame>\n`;
    } else {
      const tag = el.shape === 'ellipse' ? 'Oval' : 'Rectangle';
      const contentType = el.type === 'image' ? 'GraphicType' : 'Unassigned';
      items +=
        `<${tag} Self="${itemSelf}" ContentType="${contentType}" ItemLayer="${ids.layer}" Visible="true" Name="$ID/" ItemTransform="1 0 0 1 0 0" FillColor="${el.fill ? colors.ref(el.fill) : 'Swatch/None'}"${strokeAttrs}>` +
        geometry +
        opacityXML +
        `</${tag}>\n`;
    }
  }

  const xml =
    XML_HEAD +
    `<idPkg:Spread xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">\n` +
    `<Spread Self="${spreadSelf}" PageCount="1" BindingLocation="0" AllowPageShuffle="true" ItemTransform="1 0 0 1 0 0" ShowMasterItems="true" PageTransitionType="None" PageTransitionDirection="NotApplicable" PageTransitionDuration="Medium" FlattenerOverride="Default">\n` +
    `<Page Self="${pageSelf}" Name="${esc(banner.name || '1')}" AppliedMaster="n" OverrideList="" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true" GeometricBounds="0 0 ${fmt(H)} ${fmt(W)}" ItemTransform="1 0 0 1 ${fmt(-W / 2)} ${fmt(-H / 2)}" AppliedTrapPreset="TrapPreset/$ID/kDefaultTrapStyleName">\n` +
    `<MarginPreference ColumnCount="1" ColumnGutter="12" Top="0" Bottom="0" Left="0" Right="0" ColumnDirection="Horizontal" ColumnsPositions="0 ${fmt(W)}"/>\n` +
    `</Page>\n` +
    items +
    `</Spread>\n</idPkg:Spread>\n`;

  return { self: spreadSelf, xml };
}

function stylesXML() {
  return (
    XML_HEAD +
    `<idPkg:Styles xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">\n` +
    `<RootCharacterStyleGroup Self="bs_rcsg"><CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]"/></RootCharacterStyleGroup>\n` +
    `<RootParagraphStyleGroup Self="bs_rpsg">` +
    `<ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" NextStyle="ParagraphStyle/$ID/[No paragraph style]"/>` +
    `<ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle" NextStyle="ParagraphStyle/$ID/NormalParagraphStyle"/>` +
    `</RootParagraphStyleGroup>\n` +
    `<RootObjectStyleGroup Self="bs_rosg">` +
    `<ObjectStyle Self="ObjectStyle/$ID/[None]" Name="$ID/[None]"/>` +
    `<ObjectStyle Self="ObjectStyle/$ID/[Normal Graphics Frame]" Name="$ID/[Normal Graphics Frame]"/>` +
    `<ObjectStyle Self="ObjectStyle/$ID/[Normal Text Frame]" Name="$ID/[Normal Text Frame]"/>` +
    `<ObjectStyle Self="ObjectStyle/$ID/[Normal Grid]" Name="$ID/[Normal Grid]"/>` +
    `</RootObjectStyleGroup>\n` +
    `<RootTableStyleGroup Self="bs_rtsg"><TableStyle Self="TableStyle/$ID/[Basic Table]" Name="$ID/[Basic Table]"/></RootTableStyleGroup>\n` +
    `<RootCellStyleGroup Self="bs_rcellsg"><CellStyle Self="CellStyle/$ID/[None]" Name="$ID/[None]"/></RootCellStyleGroup>\n` +
    `</idPkg:Styles>\n`
  );
}

function graphicXML(colors) {
  return (
    XML_HEAD +
    `<idPkg:Graphic xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">\n` +
    `<Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black" ColorOverride="Specialblack"/>\n` +
    `<Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="Paper" ColorOverride="Specialpaper"/>\n` +
    `<Color Self="Color/Registration" Model="Registration" Space="CMYK" ColorValue="100 100 100 100" Name="Registration" ColorOverride="Specialregistration"/>\n` +
    `<Swatch Self="Swatch/None" Name="None" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>\n` +
    colors.xml() +
    `</idPkg:Graphic>\n`
  );
}

function preferencesXML(banners) {
  const first = banners[0];
  return (
    XML_HEAD +
    `<idPkg:Preferences xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">\n` +
    `<DocumentPreference PageHeight="${fmt(first.height)}" PageWidth="${fmt(first.width)}" PagesPerDocument="${banners.length}" FacingPages="false" AllowPageShuffle="true" Intent="WebIntent" PageOrientation="Landscape" PagesPerSpread="1" DocumentBleedTopOffset="0" DocumentBleedBottomOffset="0" DocumentBleedInsideOrLeftOffset="0" DocumentBleedOutsideOrRightOffset="0" SlugTopOffset="0" SlugBottomOffset="0" SlugInsideOrLeftOffset="0" SlugRightOrOutsideOffset="0"/>\n` +
    `<ViewPreference HorizontalMeasurementUnits="Pixels" VerticalMeasurementUnits="Pixels" RulerOrigin="PageOrigin"/>\n` +
    `</idPkg:Preferences>\n`
  );
}

function tagsXML() {
  return (
    XML_HEAD +
    `<idPkg:Tags xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">\n` +
    `<XMLTag Self="XMLTag/Root" Name="Root"><Properties><TagColor type="enumeration">LightBlue</TagColor></Properties></XMLTag>\n` +
    `</idPkg:Tags>\n`
  );
}

function backingStoryXML() {
  return (
    XML_HEAD +
    `<idPkg:BackingStory xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">\n` +
    `<XmlStory Self="bs_backing" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">\n` +
    `<XMLElement Self="di2" MarkupTag="XMLTag/Root"/>\n` +
    `</XmlStory>\n</idPkg:BackingStory>\n`
  );
}

function masterSpreadXML() {
  return (
    XML_HEAD +
    `<idPkg:MasterSpread xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">\n` +
    `<MasterSpread Self="bs_master" Name="A-Master" NamePrefix="A" BaseName="Master" ShowMasterItems="true" PageCount="1" ItemTransform="1 0 0 1 0 0">\n` +
    `<Page Self="bs_master_p" AppliedMaster="n" OverrideList="" TabOrder="" Name="A" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 -50 -50" GridStartingPoint="TopOutside" UseMasterGrid="true">\n` +
    `<MarginPreference ColumnCount="1" ColumnGutter="12" Top="0" Bottom="0" Left="0" Right="0" ColumnDirection="Horizontal" ColumnsPositions="0 100"/>\n` +
    `</Page>\n</MasterSpread>\n</idPkg:MasterSpread>\n`
  );
}

function designMapXML(spreadFiles, storyFiles) {
  const spreadRefs = spreadFiles.map((p) => `<idPkg:Spread src="${p}"/>`).join('\n');
  const storyRefs = storyFiles.map((p) => `<idPkg:Story src="${p}"/>`).join('\n');
  return (
    XML_HEAD +
    `<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="8.0(370)" ?>\n` +
    `<Document xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}" Self="bs_doc" Name="banners" ZeroPoint="0 0" ActiveLayer="bs_layer" StoryList="${''}">\n` +
    `<idPkg:Graphic src="Resources/Graphic.xml"/>\n` +
    `<idPkg:Fonts src="Resources/Fonts.xml"/>\n` +
    `<idPkg:Styles src="Resources/Styles.xml"/>\n` +
    `<idPkg:Preferences src="Resources/Preferences.xml"/>\n` +
    `<idPkg:Tags src="XML/Tags.xml"/>\n` +
    `<Layer Self="bs_layer" Name="Layer 1" Visible="true" Locked="false" IgnoreWrap="false" ShowGuides="true" LockGuides="false" UI="true" Expendable="true" Printable="true"><Properties><LayerColor type="enumeration">LightBlue</LayerColor></Properties></Layer>\n` +
    `<idPkg:MasterSpread src="MasterSpreads/MasterSpread_bs_master.xml"/>\n` +
    spreadRefs +
    '\n' +
    `<idPkg:BackingStory src="XML/BackingStory.xml"/>\n` +
    storyRefs +
    '\n' +
    `</Document>\n`
  );
}

function fontsXML() {
  return (
    XML_HEAD + `<idPkg:Fonts xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">\n</idPkg:Fonts>\n`
  );
}

class IdRegistry {
  constructor() {
    this.counter = 0;
    this.layer = 'bs_layer';
  }
  next(prefix) {
    this.counter += 1;
    return `bs_${prefix}_u${this.counter}`;
  }
}

/**
 * Build the IDML package as a Blob (no DOM access — testable standalone).
 */
export async function buildIDML(banners) {
  const ids = new IdRegistry();
  const colors = new ColorRegistry();
  const stories = [];
  const spreads = banners.map((banner) => spreadXML(banner, ids, colors, stories));

  const zip = new JSZip();
  // mimetype must be the first entry and stored uncompressed (UCF requirement)
  zip.file('mimetype', 'application/vnd.adobe.indesign-idml-package', {
    compression: 'STORE',
  });
  zip.file(
    'META-INF/container.xml',
    XML_HEAD +
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">\n` +
      `<rootfiles><rootfile full-path="designmap.xml" media-type="text/xml"/></rootfiles>\n</container>\n`
  );

  const spreadFiles = [];
  spreads.forEach((s) => {
    const path = `Spreads/Spread_${s.self}.xml`;
    spreadFiles.push(path);
    zip.file(path, s.xml);
  });

  const storyFiles = [];
  stories.forEach((s) => {
    const path = `Stories/Story_${s.self}.xml`;
    storyFiles.push(path);
    zip.file(path, s.xml);
  });

  zip.file('designmap.xml', designMapXML(spreadFiles, storyFiles));
  zip.file('Resources/Graphic.xml', graphicXML(colors));
  zip.file('Resources/Fonts.xml', fontsXML());
  zip.file('Resources/Styles.xml', stylesXML());
  zip.file('Resources/Preferences.xml', preferencesXML(banners));
  zip.file('XML/Tags.xml', tagsXML());
  zip.file('XML/BackingStory.xml', backingStoryXML());
  zip.file('MasterSpreads/MasterSpread_bs_master.xml', masterSpreadXML());

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.adobe.indesign-idml-package',
  });
}

/**
 * Build an .idml file from the edited banners and trigger a download.
 */
export async function exportIDML(banners, filename = 'banners_export.idml') {
  if (!banners.length) return;
  const blob = await buildIDML(banners);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
