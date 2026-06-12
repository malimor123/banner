import React, { useEffect, useMemo, useRef, useState } from 'react';
import CanvasEditor from './CanvasEditor.jsx';
import LayersPanel from './LayersPanel.jsx';
import PropertiesPanel from './PropertiesPanel.jsx';
import { exportBanner, exportAllToZip } from '../modules/exportModule.js';
import { exportIDML } from '../modules/idmlWriter.js';

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

function fitZoom(banner, viewportW, viewportH) {
  const z = Math.min(viewportW / banner.width, viewportH / banner.height, 1);
  return Math.max(0.1, Math.floor(z * 100) / 100);
}

function fontAvailable(family) {
  try {
    return document.fonts.check(`16px "${family}"`);
  } catch {
    return true;
  }
}

export default function EditorWorkspace({
  banners,
  activeBannerId,
  onSelectBanner,
  onUpdateElements, // (bannerId, elements, commit)
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) {
  const banner = banners.find((b) => b.id === activeBannerId) || banners[0];
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [exportFormat, setExportFormat] = useState('png');
  const [exportScale, setExportScale] = useState(1);
  const [exporting, setExporting] = useState(null); // string status
  const viewportRef = useRef(null);
  const imageReplaceTarget = useRef(null);
  const fileInputRef = useRef(null);

  // fit zoom whenever the active banner changes
  useEffect(() => {
    if (!banner || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    setZoom(fitZoom(banner, rect.width - 64, rect.height - 64));
    setSelectedId(null);
  }, [activeBannerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard shortcuts: delete / undo / redo
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && banner) {
        e.preventDefault();
        onUpdateElements(
          banner.id,
          banner.elements.filter((el) => el.id !== selectedId),
          true
        );
        setSelectedId(null);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo(banner.id);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault();
        onRedo(banner.id);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, banner, onUpdateElements, onUndo, onRedo]);

  const selectedEl = banner?.elements.find((el) => el.id === selectedId) || null;

  const missingFonts = useMemo(() => {
    if (!banner) return [];
    const families = [...new Set(banner.elements.filter((e) => e.type === 'text').map((e) => e.fontFamily))];
    return families.filter((f) => f && !fontAvailable(f));
  }, [banner]);

  if (!banner) return null;

  function patchSelected(patch) {
    onUpdateElements(
      banner.id,
      banner.elements.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)),
      true
    );
  }

  function requestImageReplace(elementId) {
    imageReplaceTarget.current = elementId;
    fileInputRef.current?.click();
  }

  function handleImageFile(file) {
    const targetId = imageReplaceTarget.current;
    imageReplaceTarget.current = null;
    if (!file || !targetId) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUpdateElements(
        banner.id,
        banner.elements.map((el) => (el.id === targetId ? { ...el, src: reader.result } : el)),
        true
      );
    };
    reader.readAsDataURL(file);
  }

  async function handleExportCurrent() {
    setExporting('Exporting…');
    try {
      await exportBanner(banner, { format: exportFormat, pixelRatio: exportScale });
    } finally {
      setExporting(null);
    }
  }

  async function handleExportAll() {
    setExporting('Exporting 0/' + banners.length);
    try {
      await exportAllToZip(banners, { format: exportFormat, pixelRatio: exportScale }, (done, total) =>
        setExporting(`Exporting ${done}/${total}`)
      );
    } finally {
      setExporting(null);
    }
  }

  async function handleExportIDML() {
    setExporting('Building IDML…');
    try {
      await exportIDML(banners);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <LayersPanel
          elements={banner.elements}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReorder={(els) => onUpdateElements(banner.id, els, true)}
        />

        {/* center canvas */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* toolbar */}
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#333] bg-[#1f1f1f] px-3 text-xs">
            <button
              disabled={!canUndo(banner.id)}
              onClick={() => onUndo(banner.id)}
              className="rounded border border-[#333] px-2 py-1 text-gray-300 hover:border-[#7C5CFC] disabled:opacity-30"
              title="Undo (Ctrl+Z)"
            >
              ↶ Undo
            </button>
            <button
              disabled={!canRedo(banner.id)}
              onClick={() => onRedo(banner.id)}
              className="rounded border border-[#333] px-2 py-1 text-gray-300 hover:border-[#7C5CFC] disabled:opacity-30"
              title="Redo (Ctrl+Y)"
            >
              ↷ Redo
            </button>
            <div className="mx-2 h-4 w-px bg-[#333]" />
            <span className="text-gray-500">Zoom</span>
            <select
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="rounded border border-[#333] bg-[#1a1a1a] px-1.5 py-1 text-gray-200 outline-none"
            >
              {[...new Set([zoom, ...ZOOM_LEVELS])]
                .sort((a, b) => a - b)
                .map((z) => (
                  <option key={z} value={z}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
            </select>
            <div className="min-w-0 flex-1" />
            {banner.error && (
              <span className="truncate text-amber-400" title={banner.error}>
                ⚠ {banner.error}
              </span>
            )}
            {missingFonts.length > 0 && (
              <span
                className="truncate text-amber-400"
                title={`Missing fonts: ${missingFonts.join(', ')} — rendering with fallback sans-serif`}
              >
                ⚠ font fallback: {missingFonts.join(', ')}
              </span>
            )}
            <span className="text-gray-500">
              {banner.width} × {banner.height}px
            </span>
          </div>

          {/* canvas viewport */}
          <div
            ref={viewportRef}
            className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#1a1a1a] p-8"
          >
            <div className="m-auto">
              <CanvasEditor
                banner={banner}
                zoom={zoom}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChangeElements={(els, commit) => onUpdateElements(banner.id, els, commit)}
                onRequestImageReplace={requestImageReplace}
              />
            </div>
          </div>
        </div>

        <PropertiesPanel
          element={selectedEl}
          banner={banner}
          onPatch={patchSelected}
          onDelete={() => {
            onUpdateElements(
              banner.id,
              banner.elements.filter((el) => el.id !== selectedId),
              true
            );
            setSelectedId(null);
          }}
          onReplaceImage={() => requestImageReplace(selectedId)}
        />
      </div>

      {/* size tabs + export bar */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-t border-[#333] bg-[#242424] px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {banners.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelectBanner(b.id)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs whitespace-nowrap ${
                b.id === banner.id
                  ? 'bg-[#7C5CFC] font-semibold text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
              title={b.name}
            >
              {b.width}×{b.height}
              {b.error && <span className="ml-1 text-amber-300">•</span>}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-l border-[#333] pl-3 text-xs">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            className="rounded border border-[#333] bg-[#1a1a1a] px-1.5 py-1.5 text-gray-200 outline-none"
            title="Format"
          >
            <option value="png">PNG (transparent)</option>
            <option value="jpeg">JPEG (white bg)</option>
          </select>
          <select
            value={exportScale}
            onChange={(e) => setExportScale(parseInt(e.target.value, 10))}
            className="rounded border border-[#333] bg-[#1a1a1a] px-1.5 py-1.5 text-gray-200 outline-none"
            title="Resolution"
          >
            <option value="1">1× screen</option>
            <option value="2">2× retina</option>
          </select>
          <button
            disabled={!!exporting}
            onClick={handleExportCurrent}
            className="rounded-md border border-[#7C5CFC] px-3 py-1.5 font-medium text-[#b9a7ff] hover:bg-[#7C5CFC]/10 disabled:opacity-40"
          >
            Export this
          </button>
          <button
            disabled={!!exporting}
            onClick={handleExportAll}
            className="rounded-md bg-[#7C5CFC] px-3 py-1.5 font-semibold text-white hover:bg-[#6a4ce0] disabled:opacity-40"
          >
            {exporting || 'Export all (ZIP)'}
          </button>
          <button
            disabled={!!exporting}
            onClick={handleExportIDML}
            title="Download an InDesign IDML file containing all banners (one page per size)"
            className="rounded-md border border-[#333] px-3 py-1.5 font-medium text-gray-200 hover:border-[#7C5CFC] disabled:opacity-40"
          >
            ⬇ InDesign (IDML)
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleImageFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
