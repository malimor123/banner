import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

const GDN_PRESETS = [
  { name: 'Medium Rectangle', width: 300, height: 250 },
  { name: 'Leaderboard', width: 728, height: 90 },
  { name: 'Wide Skyscraper', width: 160, height: 600 },
  { name: 'Half Page', width: 300, height: 600 },
  { name: 'Mobile Banner', width: 320, height: 50 },
  { name: 'Large Mobile', width: 320, height: 100 },
  { name: 'Banner', width: 468, height: 60 },
  { name: 'Square', width: 250, height: 250 },
  { name: 'Small Square', width: 200, height: 200 },
  { name: 'Large Leaderboard', width: 970, height: 90 },
  { name: 'Billboard', width: 970, height: 250 },
];

let sizeSeq = 0;
function newSize(partial = {}) {
  sizeSeq += 1;
  return { id: `size_${Date.now()}_${sizeSeq}`, name: '', width: '', height: '', ...partial };
}

function parseSheetRows(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h.startsWith('name'));
  const widthIdx = header.findIndex((h) => h.startsWith('width'));
  const heightIdx = header.findIndex((h) => h.startsWith('height'));
  if (widthIdx === -1 || heightIdx === -1) return [];
  const out = [];
  for (const row of rows.slice(1)) {
    const width = parseInt(row[widthIdx], 10);
    const height = parseInt(row[heightIdx], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    const name = nameIdx >= 0 ? String(row[nameIdx] ?? '').trim() : '';
    out.push(newSize({ name: name || `${width}x${height}`, width, height }));
  }
  return out;
}

export default function SizeInput({ sizes, onChange, onContinue }) {
  const [mode, setMode] = useState('manual'); // 'manual' | 'excel'
  const [preview, setPreview] = useState(null); // parsed-but-unconfirmed excel rows
  const [excelError, setExcelError] = useState(null);
  const fileRef = useRef(null);

  const validSizes = sizes.filter(
    (s) => Number(s.width) > 0 && Number(s.height) > 0
  );

  function update(id, field, value) {
    onChange(sizes.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  function loadPresets() {
    const existing = new Set(sizes.map((s) => `${s.width}x${s.height}`));
    const added = GDN_PRESETS.filter((p) => !existing.has(`${p.width}x${p.height}`)).map((p) =>
      newSize(p)
    );
    onChange([...sizes.filter((s) => s.width || s.height || s.name), ...added]);
  }

  async function handleExcel(file) {
    if (!file) return;
    setExcelError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      const parsed = parseSheetRows(rows);
      if (!parsed.length) {
        setExcelError(
          'No valid rows found. Expected columns: name, width, height (first row = header).'
        );
        return;
      }
      setPreview(parsed);
    } catch {
      setExcelError('Could not read this file. Please upload a valid .xlsx or .csv.');
    }
  }

  const tableRows = preview || sizes;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto p-8">
      <h2 className="mb-1 text-lg font-semibold text-[#F0F0F0]">Target sizes</h2>
      <p className="mb-5 text-xs text-gray-400">
        Define every size you need. Each size becomes an AI-adapted, editable banner.
      </p>

      <div className="mb-5 flex items-center gap-2">
        <div className="flex rounded-lg border border-[#333] bg-[#242424] p-0.5">
          {['manual', 'excel'].map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setPreview(null);
                setExcelError(null);
              }}
              className={`rounded-md px-4 py-1.5 text-xs font-medium capitalize ${
                mode === m ? 'bg-[#7C5CFC] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {m === 'manual' ? 'Manual entry' : 'Excel upload'}
            </button>
          ))}
        </div>
        {mode === 'manual' && (
          <>
            <button
              onClick={loadPresets}
              className="rounded-lg border border-[#333] px-3 py-1.5 text-xs text-gray-300 hover:border-[#7C5CFC]"
            >
              ⚡ Load GDN presets
            </button>
            <button
              onClick={() => onChange([...sizes, newSize()])}
              className="rounded-lg border border-[#333] px-3 py-1.5 text-xs text-gray-300 hover:border-[#7C5CFC]"
            >
              + Add size
            </button>
          </>
        )}
        {mode === 'excel' && (
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-[#333] px-3 py-1.5 text-xs text-gray-300 hover:border-[#7C5CFC]"
          >
            📂 Choose .xlsx / .csv
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            handleExcel(e.target.files[0]);
            e.target.value = '';
          }}
        />
      </div>

      {excelError && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
          {excelError}
        </div>
      )}

      {preview && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-[#7C5CFC]/40 bg-[#7C5CFC]/10 px-4 py-2.5 text-xs text-gray-200">
          <span>
            Preview: {preview.length} sizes parsed from file. Confirm to use them.
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-200">
              Discard
            </button>
            <button
              onClick={() => {
                onChange(preview);
                setPreview(null);
                setMode('manual');
              }}
              className="rounded bg-[#7C5CFC] px-3 py-1 font-semibold text-white"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[#333]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#242424] text-gray-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="w-28 px-4 py-2.5 font-medium">Width (px)</th>
              <th className="w-28 px-4 py-2.5 font-medium">Height (px)</th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {tableRows.map((s) => (
              <tr key={s.id} className="border-t border-[#2c2c2c] bg-[#1f1f1f]">
                <td className="px-2 py-1.5">
                  <input
                    value={s.name}
                    disabled={!!preview}
                    onChange={(e) => update(s.id, 'name', e.target.value)}
                    placeholder="e.g. Leaderboard"
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[#F0F0F0] outline-none focus:border-[#7C5CFC] focus:bg-[#1a1a1a]"
                  />
                </td>
                {['width', 'height'].map((f) => (
                  <td key={f} className="px-2 py-1.5">
                    <input
                      type="number"
                      min="1"
                      value={s[f]}
                      disabled={!!preview}
                      onChange={(e) => update(s.id, f, e.target.value)}
                      placeholder="0"
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[#F0F0F0] outline-none focus:border-[#7C5CFC] focus:bg-[#1a1a1a]"
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center">
                  {!preview && (
                    <button
                      onClick={() => onChange(sizes.filter((x) => x.id !== s.id))}
                      className="text-gray-600 hover:text-red-400"
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!tableRows.length && (
              <tr>
                <td colSpan="4" className="bg-[#1f1f1f] px-4 py-8 text-center text-gray-600">
                  No sizes yet — add rows manually, load GDN presets, or upload an Excel file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {validSizes.length} valid size{validSizes.length === 1 ? '' : 's'}
        </div>
        <button
          disabled={!validSizes.length || !!preview}
          onClick={onContinue}
          className="rounded-lg bg-[#7C5CFC] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#6a4ce0] disabled:opacity-40"
        >
          Continue → Generate
        </button>
      </div>
    </div>
  );
}

export { GDN_PRESETS, newSize };
