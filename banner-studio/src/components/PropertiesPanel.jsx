import React from 'react';

const FONT_OPTIONS = ['Assistant', 'Heebo', 'Rubik', 'Arial', 'Georgia', 'Tahoma'];
const WEIGHT_OPTIONS = [
  { value: '300', label: 'Light' },
  { value: 'normal', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'SemiBold' },
  { value: 'bold', label: 'Bold' },
  { value: '800', label: 'ExtraBold' },
];

function NumberField({ label, value, onCommit, min = -9999, step = 1 }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      <input
        type="number"
        value={Math.round((value ?? 0) * 100) / 100}
        min={min}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onCommit(v);
        }}
        className="w-full rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#F0F0F0] outline-none focus:border-[#7C5CFC]"
      />
    </label>
  );
}

export default function PropertiesPanel({ element, banner, onPatch, onDelete, onReplaceImage }) {
  if (!element) {
    return (
      <div className="flex h-full w-60 shrink-0 flex-col border-l border-[#333] bg-[#242424]">
        <div className="border-b border-[#333] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Properties
        </div>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[11px] leading-relaxed text-gray-600">
          Select an element on the canvas
          <br />
          to edit its properties
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-l border-[#333] bg-[#242424]">
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {element.type === 'text' ? 'Text' : element.type === 'image' ? 'Image' : 'Shape'}
        </span>
        <button
          onClick={onDelete}
          className="text-[11px] text-gray-500 hover:text-red-400"
          title="Delete element (Del)"
        >
          🗑 Delete
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* position & size */}
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={element.x} onCommit={(v) => onPatch({ x: v })} />
          <NumberField label="Y" value={element.y} onCommit={(v) => onPatch({ y: v })} />
          <NumberField
            label="Width"
            value={element.width}
            min={4}
            onCommit={(v) => onPatch({ width: Math.max(4, v) })}
          />
          <NumberField
            label="Height"
            value={element.height}
            min={4}
            onCommit={(v) => onPatch({ height: Math.max(4, v) })}
          />
        </div>

        {/* text properties */}
        {element.type === 'text' && (
          <>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">Content</span>
              <textarea
                dir="rtl"
                rows={3}
                value={element.text || ''}
                onChange={(e) => onPatch({ text: e.target.value })}
                className="mt-1 w-full rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#F0F0F0] outline-none focus:border-[#7C5CFC]"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-gray-500">Font</span>
                <select
                  value={element.fontFamily || 'Assistant'}
                  onChange={(e) => onPatch({ fontFamily: e.target.value })}
                  className="rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#F0F0F0] outline-none focus:border-[#7C5CFC]"
                >
                  {[...new Set([element.fontFamily || 'Assistant', ...FONT_OPTIONS])].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="Size"
                value={element.fontSize}
                min={6}
                onCommit={(v) => onPatch({ fontSize: Math.max(6, v) })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-gray-500">Weight</span>
                <select
                  value={String(element.fontWeight || 'normal')}
                  onChange={(e) => onPatch({ fontWeight: e.target.value })}
                  className="rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#F0F0F0] outline-none focus:border-[#7C5CFC]"
                >
                  {WEIGHT_OPTIONS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-gray-500">Color</span>
                <input
                  type="color"
                  value={element.color || '#000000'}
                  onChange={(e) => onPatch({ color: e.target.value })}
                  className="h-[30px] w-full cursor-pointer rounded-md"
                />
              </label>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wide text-gray-500">Align</span>
              <div className="mt-1 flex rounded-md border border-[#333] bg-[#1a1a1a] p-0.5">
                {[
                  { v: 'left', icon: '⬅' },
                  { v: 'center', icon: '↔' },
                  { v: 'right', icon: '➡' },
                ].map(({ v, icon }) => (
                  <button
                    key={v}
                    onClick={() => onPatch({ align: v })}
                    title={v}
                    className={`flex-1 rounded px-2 py-1 text-xs ${
                      (element.align || 'right') === v
                        ? 'bg-[#7C5CFC] text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* shape fill */}
        {element.type === 'shape' && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Fill color</span>
            <input
              type="color"
              value={element.fill || '#888888'}
              onChange={(e) => onPatch({ fill: e.target.value })}
              className="h-[30px] w-full cursor-pointer rounded-md"
            />
          </label>
        )}

        {/* image */}
        {element.type === 'image' && (
          <div className="space-y-2">
            <button
              onClick={onReplaceImage}
              className="w-full rounded-md border border-[#7C5CFC] px-3 py-2 text-xs font-medium text-[#b9a7ff] hover:bg-[#7C5CFC]/10"
            >
              📂 Replace image…
            </button>
            {element.linkName && (
              <div className="truncate text-[10px] text-gray-500" title={element.linkName}>
                Original link: {element.linkName}
              </div>
            )}
            {!element.src && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">
                IDML stores images as links — upload the image file to display it.
              </div>
            )}
          </div>
        )}

        {/* opacity — all elements */}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">
            Opacity — {Math.round((element.opacity ?? 1) * 100)}%
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={element.opacity ?? 1}
            onChange={(e) => onPatch({ opacity: parseFloat(e.target.value) })}
            className="mt-1 w-full"
          />
        </label>

        {/* role info */}
        <div className="rounded-md bg-[#1a1a1a] px-2 py-1.5 text-[10px] text-gray-500">
          Role: <span className="text-gray-300">{element.role || '—'}</span>
          {banner && (
            <>
              {' · '}Canvas: {banner.width}×{banner.height}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
