import React, { useState } from 'react';

const TYPE_ICONS = { text: '🅣', image: '🖼', shape: '▭' };

function layerName(el, index, elements) {
  const sameType = elements.filter((e) => e.type === el.type);
  const n = sameType.indexOf(el) + 1;
  const base = el.type === 'text' ? 'Text' : el.type === 'image' ? 'Image' : 'Shape';
  const role = el.role && !['shape', 'body', 'image'].includes(el.role) ? ` · ${el.role}` : '';
  return `${base} ${n}${role}`;
}

/**
 * Layer list, top-most element first. Elements array is bottom→top (paint
 * order), so the list renders it reversed; drag rows to change z-order.
 */
export default function LayersPanel({ elements, selectedId, onSelect, onReorder }) {
  const [dragIdx, setDragIdx] = useState(null); // index in the reversed list

  const reversed = [...elements].reverse();

  function moveTo(fromRevIdx, toRevIdx) {
    if (fromRevIdx === toRevIdx) return;
    const list = [...reversed];
    const [item] = list.splice(fromRevIdx, 1);
    list.splice(toRevIdx, 0, item);
    onReorder([...list].reverse());
  }

  return (
    <div className="flex h-full w-52 shrink-0 flex-col border-r border-[#333] bg-[#242424]">
      <div className="border-b border-[#333] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Layers
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {reversed.map((el, revIdx) => (
          <div
            key={el.id}
            draggable
            onDragStart={() => setDragIdx(revIdx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx != null) moveTo(dragIdx, revIdx);
              setDragIdx(null);
            }}
            onClick={() => onSelect(el.id)}
            className={`mb-0.5 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
              selectedId === el.id
                ? 'bg-[#7C5CFC]/25 text-white'
                : 'text-gray-300 hover:bg-white/5'
            }`}
            title="Drag to reorder"
          >
            <span className="text-[13px] opacity-70">{TYPE_ICONS[el.type] || '▭'}</span>
            <span className="min-w-0 flex-1 truncate">
              {layerName(el, revIdx, elements)}
            </span>
            {el.type === 'text' && (
              <span className="max-w-16 truncate text-[9px] text-gray-500" dir="rtl">
                {el.text}
              </span>
            )}
          </div>
        ))}
        {!elements.length && (
          <div className="px-2 py-6 text-center text-[11px] text-gray-600">No elements</div>
        )}
      </div>
    </div>
  );
}
