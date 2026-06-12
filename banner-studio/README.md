# Banner Studio — IDML Resize & Edit System

A production-ready React single-page application that adapts Adobe InDesign banner layouts
to any set of target sizes using Claude AI, lets you fine-tune the results in a Canva-like
visual editor, and exports the finished banners as PNG/JPEG **or as an InDesign IDML file**.

Runs **entirely in the browser** — no backend. Your Anthropic API key is stored in
`localStorage` and sent only to the Anthropic API.

## Workflow

1. **Upload IDML** — the file is unzipped (JSZip) and its spreads, page items, stories,
   colors and transforms are parsed into clean JSON masters. Multiple masters are shown as
   a thumbnail grid; pick which ones to use as sources.
2. **Set target sizes** — manual table, one-click GDN presets (300×250, 728×90, 160×600, …),
   or `.xlsx`/`.csv` upload (columns: `name`, `width`, `height`) with preview before confirm.
3. **Generate adaptations** — each size is assigned the master with the closest aspect ratio
   (overridable per size). Claude (`claude-sonnet-4-6`) produces a precise layout per size;
   calls run in batches of 3 with a live progress bar. If a call fails (or no key is set),
   a deterministic geometric fallback is used and the size is flagged with a per-size retry.
4. **Edit** — Konva-based editor with one tab per size: drag, resize (transform handles),
   double-click inline text editing (RTL/Hebrew aware), image replacement, right-click
   "Set as background", layer list with drag-to-reorder z-order, properties panel
   (position/size/font/color/weight/align/opacity), Delete key, Ctrl+Z / Ctrl+Y undo/redo
   with a per-banner history stack, zoom controls.
5. **Export** —
   - PNG (transparent) or JPEG (white background), at 1× or 2× resolution
   - per-banner download or "Export all" bundled into `banners_export.zip`
   - **InDesign export**: download `banners_export.idml` with one page per banner —
     text frames remain fully editable in InDesign (images come in as placeholder frames
     to relink, since browser uploads carry no file paths)

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
node scripts/smoke-test.mjs   # module smoke tests (needs: npm i --no-save linkedom)
```

## Project structure

```
src/
  App.jsx                    state machine, API-key handling, undo/redo history
  modules/
    idmlParser.js            IDML (ZIP+XML) → JSON masters
    aiAdapter.js             Claude API calls, batching, fallback scaling, clamping
    exportModule.js          offscreen Konva rendering → PNG/JPEG/ZIP
    idmlWriter.js            JSON banners → IDML package (InDesign download)
  components/
    UploadStep.jsx           dropzone + master selection grid
    SizeInput.jsx            manual table / GDN presets / Excel upload
    GenerateStep.jsx         master assignment, progress, per-size retry
    EditorWorkspace.jsx      tabs, toolbar, export bar
    CanvasEditor.jsx         react-konva stage, transformer, inline text editor
    LayersPanel.jsx          z-order list with drag reorder
    PropertiesPanel.jsx      selected-element properties
    Header.jsx / Stepper.jsx / ApiKeyModal.jsx
```

## Notes

- IDML coordinates are points; 1pt is treated as 1px (72 DPI).
- Hebrew/RTL: text renders with `direction: rtl` and an Assistant/Heebo font stack;
  missing fonts fall back to sans-serif with a notice in the editor toolbar.
- The Anthropic API is called directly from the browser with the
  `anthropic-dangerous-direct-browser-access` CORS header.
