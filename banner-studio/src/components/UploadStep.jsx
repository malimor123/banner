import React, { useRef, useState } from 'react';
import { parseIDML } from '../modules/idmlParser.js';

/** Tiny schematic preview of a master layout, drawn with positioned divs. */
function MasterThumb({ master }) {
  const maxW = 220;
  const maxH = 130;
  const scale = Math.min(maxW / master.width, maxH / master.height);
  const w = master.width * scale;
  const h = master.height * scale;
  return (
    <div className="flex h-[140px] items-center justify-center">
      <div
        className="relative overflow-hidden rounded-sm bg-white/90 shadow"
        style={{ width: w, height: h }}
      >
        {master.elements.map((el) => (
          <div
            key={el.id}
            className="absolute"
            style={{
              left: el.x * scale,
              top: el.y * scale,
              width: Math.max(2, el.width * scale),
              height: Math.max(2, el.height * scale),
              background:
                el.type === 'text'
                  ? 'transparent'
                  : el.fill || (el.type === 'image' ? '#9ca3af' : '#d1d5db'),
              outline: el.type === 'image' ? '1px dashed #6b7280' : 'none',
              fontSize: Math.max(4, (el.fontSize || 12) * scale),
              color: el.color || '#111',
              direction: 'rtl',
              overflow: 'hidden',
              lineHeight: 1.1,
              textAlign: el.align || 'right',
            }}
          >
            {el.type === 'text' ? el.text : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UploadStep({ onParsed, masters, selectedMasterIds, onToggleMaster, onContinue }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    if (!/\.idml$/i.test(file.name)) {
      setError('Please choose an .idml file (InDesign: File → Export → IDML).');
      return;
    }
    setError(null);
    setParsing(true);
    try {
      const { masters: parsed } = await parseIDML(file);
      onParsed(file.name, parsed);
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center overflow-y-auto p-8">
      {!masters.length ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={`mt-16 flex w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 transition-colors ${
            dragOver ? 'border-[#7C5CFC] bg-[#7C5CFC]/10' : 'border-[#3a3a3a] bg-[#242424]'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".idml"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7C5CFC]/15 text-3xl">
            📄
          </div>
          {parsing ? (
            <>
              <div className="text-sm font-medium text-[#F0F0F0]">Parsing IDML…</div>
              <div className="mt-2 h-1 w-40 overflow-hidden rounded bg-[#333]">
                <div className="h-full w-1/2 animate-pulse bg-[#7C5CFC]" />
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-[#F0F0F0]">
                Drop your IDML file here, or click to browse
              </div>
              <div className="mt-1.5 text-xs text-gray-500">
                Adobe InDesign → File → Export → IDML
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="w-full">
          <h2 className="mb-1 text-lg font-semibold text-[#F0F0F0]">
            Found {masters.length} master{masters.length > 1 ? 's' : ''}
          </h2>
          <p className="mb-6 text-xs text-gray-400">
            Select which masters to use as sources. Each target size will automatically use the
            master with the closest aspect ratio (you can override per size in the next steps).
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {masters.map((m) => {
              const selected = selectedMasterIds.includes(m.masterId);
              return (
                <button
                  key={m.masterId}
                  onClick={() => onToggleMaster(m.masterId)}
                  className={`rounded-xl border-2 bg-[#242424] p-3 text-left transition-colors ${
                    selected ? 'border-[#7C5CFC]' : 'border-[#333] hover:border-[#555]'
                  }`}
                >
                  <MasterThumb master={m} />
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-[#F0F0F0]">{m.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {m.elements.length} elements
                      </div>
                    </div>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        selected ? 'bg-[#7C5CFC] text-white' : 'bg-[#3a3a3a] text-gray-500'
                      }`}
                    >
                      {selected ? '✓' : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-8 flex justify-end">
            <button
              disabled={!selectedMasterIds.length}
              onClick={onContinue}
              className="rounded-lg bg-[#7C5CFC] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#6a4ce0] disabled:opacity-40"
            >
              Continue → Set sizes
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
