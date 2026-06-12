/**
 * exportModule.js — renders banners to PNG/JPEG via an offscreen Konva stage
 * and bundles multi-banner exports into a ZIP.
 *
 * Rendering happens on a detached stage (not the interactive editor) so the
 * output never contains selection handles, and banners on inactive tabs can
 * be exported without mounting them.
 */
import Konva from 'konva';
import JSZip from 'jszip';

const FONT_STACK_SUFFIX = ", 'Assistant', 'Heebo', Arial, sans-serif";

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function konvaFontStyle(el) {
  const parts = [];
  if (el.italic) parts.push('italic');
  if (el.fontWeight && el.fontWeight !== 'normal') {
    parts.push(el.fontWeight === 'bold' ? 'bold' : String(el.fontWeight));
  }
  return parts.join(' ') || 'normal';
}

async function buildStage(banner) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  document.body.appendChild(container);

  const stage = new Konva.Stage({
    container,
    width: banner.width,
    height: banner.height,
  });
  const layer = new Konva.Layer();
  stage.add(layer);

  // wait for webfonts so text measures correctly
  try {
    await document.fonts.ready;
  } catch {
    /* older browsers — render anyway */
  }

  for (const el of banner.elements) {
    const common = {
      x: el.x,
      y: el.y,
      opacity: el.opacity ?? 1,
      listening: false,
    };
    if (el.type === 'text') {
      layer.add(
        new Konva.Text({
          ...common,
          width: el.width,
          height: el.height,
          text: el.text || '',
          fontSize: el.fontSize || 14,
          fontFamily: `${el.fontFamily || 'Assistant'}${FONT_STACK_SUFFIX}`,
          fontStyle: konvaFontStyle(el),
          fill: el.color || '#000000',
          align: el.align === 'justify' ? 'justify' : el.align || 'right',
          direction: 'rtl',
          wrap: 'word',
          verticalAlign: 'middle',
        })
      );
    } else if (el.type === 'image' && el.src) {
      const img = await loadImage(el.src);
      if (img) {
        layer.add(new Konva.Image({ ...common, image: img, width: el.width, height: el.height }));
        continue;
      }
      layer.add(
        new Konva.Rect({ ...common, width: el.width, height: el.height, fill: el.fill || '#3a3a3a' })
      );
    } else if (el.type === 'image') {
      // unfilled placeholder — export as its fill color
      layer.add(
        new Konva.Rect({ ...common, width: el.width, height: el.height, fill: el.fill || '#3a3a3a' })
      );
    } else if (el.shape === 'ellipse') {
      layer.add(
        new Konva.Ellipse({
          ...common,
          x: el.x + el.width / 2,
          y: el.y + el.height / 2,
          radiusX: el.width / 2,
          radiusY: el.height / 2,
          fill: el.fill || '#888888',
          stroke: el.stroke || undefined,
          strokeWidth: el.strokeWidth || 0,
        })
      );
    } else {
      layer.add(
        new Konva.Rect({
          ...common,
          width: el.width,
          height: el.height,
          fill: el.fill || '#888888',
          stroke: el.stroke || undefined,
          strokeWidth: el.strokeWidth || 0,
        })
      );
    }
  }

  layer.draw();
  return {
    stage,
    destroy: () => {
      stage.destroy();
      container.remove();
    },
  };
}

function stageToDataURL(stage, { format, pixelRatio }) {
  if (format === 'jpeg') {
    // flatten onto white — JPEG has no alpha and Konva would render black
    const raw = stage.toCanvas({ pixelRatio });
    const canvas = document.createElement('canvas');
    canvas.width = raw.width;
    canvas.height = raw.height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(raw, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  }
  return stage.toDataURL({ mimeType: 'image/png', pixelRatio });
}

export function bannerFileName(banner, format) {
  const safe = (banner.name || 'banner').replace(/[^\w֐-׿-]+/g, '_');
  return `${safe}_${banner.width}x${banner.height}.${format === 'jpeg' ? 'jpg' : 'png'}`;
}

/** Render one banner → dataURL. options: { format: 'png'|'jpeg', pixelRatio: 1|2 } */
export async function renderBanner(banner, options) {
  const { stage, destroy } = await buildStage(banner);
  try {
    return stageToDataURL(stage, options);
  } finally {
    destroy();
  }
}

export function downloadDataURL(dataURL, filename) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportBanner(banner, options) {
  const dataURL = await renderBanner(banner, options);
  downloadDataURL(dataURL, bannerFileName(banner, options.format));
}

/** Export every banner into banners_export.zip. onProgress(done, total) */
export async function exportAllToZip(banners, options, onProgress) {
  const zip = new JSZip();
  let done = 0;
  for (const banner of banners) {
    const dataURL = await renderBanner(banner, options);
    zip.file(bannerFileName(banner, options.format), dataURL.split(',')[1], { base64: true });
    done += 1;
    if (onProgress) onProgress(done, banners.length);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  downloadDataURL(url, 'banners_export.zip');
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
