import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Ellipse, Text, Image as KImage, Group, Transformer } from 'react-konva';

const FONT_STACK_SUFFIX = ", 'Assistant', 'Heebo', Arial, sans-serif";

function useHtmlImage(src) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  return image;
}

function konvaFontStyle(el) {
  const parts = [];
  if (el.italic) parts.push('italic');
  if (el.fontWeight && el.fontWeight !== 'normal') {
    parts.push(el.fontWeight === 'bold' ? 'bold' : String(el.fontWeight));
  }
  return parts.join(' ') || 'normal';
}

function ImageNode({ el, common }) {
  const image = useHtmlImage(el.src);
  if (image) {
    return <KImage {...common} image={image} width={el.width} height={el.height} />;
  }
  // placeholder frame for unlinked IDML images
  return (
    <Group {...common}>
      <Rect
        width={el.width}
        height={el.height}
        fill={el.fill || '#3a3a3a'}
        stroke="#666"
        strokeWidth={1}
        dash={[6, 4]}
      />
      <Text
        width={el.width}
        height={el.height}
        text={`🖼 ${el.role === 'logo' ? 'Logo' : 'Image'}${el.linkName ? `\n${el.linkName}` : ''}`}
        fontSize={Math.max(8, Math.min(13, el.height / 4))}
        fontFamily={`Rubik${FONT_STACK_SUFFIX}`}
        fill="#aaa"
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  );
}

export default function CanvasEditor({
  banner,
  zoom,
  selectedId,
  onSelect,
  onChangeElements, // (elements, commit) — commit=true pushes a history entry
  onRequestImageReplace,
}) {
  const stageRef = useRef(null);
  const trRef = useRef(null);
  const nodeRefs = useRef({});
  const containerRef = useRef(null);
  const [editingText, setEditingText] = useState(null); // { id, value }
  const [contextMenu, setContextMenu] = useState(null); // { x, y, id }

  const elements = banner.elements;

  // attach transformer to the selected node
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? nodeRefs.current[selectedId] : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, elements, zoom]);

  function patchElement(id, patch, commit = true) {
    onChangeElements(
      elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
      commit
    );
  }

  function handleDragEnd(el, e) {
    patchElement(el.id, { x: e.target.x(), y: e.target.y() });
  }

  function handleTransformEnd(el, e) {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const patch = {
      x: node.x(),
      y: node.y(),
      width: Math.max(4, el.width * scaleX),
      height: Math.max(4, el.height * scaleY),
    };
    if (el.type === 'text') {
      // scaling a text frame scales the type proportionally to the smaller axis
      const f = Math.min(scaleX, scaleY);
      patch.fontSize = Math.max(6, (el.fontSize || 12) * f);
    }
    patchElement(el.id, patch);
  }

  function openTextEditor(el) {
    setEditingText({ id: el.id, value: el.text || '' });
  }

  function commitTextEditor() {
    if (!editingText) return;
    patchElement(editingText.id, { text: editingText.value });
    setEditingText(null);
  }

  function setAsBackground(id) {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const updated = {
      ...el,
      x: 0,
      y: 0,
      width: banner.width,
      height: banner.height,
      role: 'background',
    };
    // move to the bottom of the z-order
    onChangeElements([updated, ...elements.filter((e) => e.id !== id)], true);
    setContextMenu(null);
  }

  const editingEl = editingText ? elements.find((e) => e.id === editingText.id) : null;

  const stageW = banner.width * zoom;
  const stageH = banner.height * zoom;

  const selectedEl = useMemo(
    () => elements.find((e) => e.id === selectedId),
    [elements, selectedId]
  );

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ width: stageW, height: stageH }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        scaleX={zoom}
        scaleY={zoom}
        className="checkerboard rounded shadow-2xl"
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) {
            onSelect(null);
            setContextMenu(null);
          }
        }}
      >
        <Layer>
          {elements.map((el) => {
            const common = {
              x: el.x,
              y: el.y,
              opacity: el.opacity ?? 1,
              draggable: true,
              ref: (node) => {
                if (node) nodeRefs.current[el.id] = node;
                else delete nodeRefs.current[el.id];
              },
              onClick: (e) => {
                onSelect(el.id);
                if (e.evt.button === 2) return;
                setContextMenu(null);
              },
              onTap: () => onSelect(el.id),
              onDragStart: () => onSelect(el.id),
              onDragEnd: (e) => handleDragEnd(el, e),
              onTransformEnd: (e) => handleTransformEnd(el, e),
              onContextMenu: (e) => {
                e.evt.preventDefault();
                onSelect(el.id);
                const rect = containerRef.current.getBoundingClientRect();
                setContextMenu({
                  x: e.evt.clientX - rect.left,
                  y: e.evt.clientY - rect.top,
                  id: el.id,
                });
              },
            };

            if (el.type === 'text') {
              if (editingText && editingText.id === el.id) return null; // textarea overlay replaces it
              return (
                <Text
                  key={el.id}
                  {...common}
                  width={el.width}
                  height={el.height}
                  text={el.text || ' '}
                  fontSize={el.fontSize || 14}
                  fontFamily={`${el.fontFamily || 'Assistant'}${FONT_STACK_SUFFIX}`}
                  fontStyle={konvaFontStyle(el)}
                  fill={el.color || '#000'}
                  align={el.align === 'justify' ? 'justify' : el.align || 'right'}
                  direction="rtl"
                  wrap="word"
                  verticalAlign="middle"
                  onDblClick={() => openTextEditor(el)}
                  onDblTap={() => openTextEditor(el)}
                />
              );
            }
            if (el.type === 'image') {
              return <ImageNode key={el.id} el={el} common={common} />;
            }
            if (el.shape === 'ellipse') {
              return (
                <Ellipse
                  key={el.id}
                  {...common}
                  x={el.x + el.width / 2}
                  y={el.y + el.height / 2}
                  radiusX={el.width / 2}
                  radiusY={el.height / 2}
                  fill={el.fill || '#888'}
                  stroke={el.stroke || undefined}
                  strokeWidth={el.strokeWidth || 0}
                  onDragEnd={(e) =>
                    patchElement(el.id, {
                      x: e.target.x() - el.width / 2,
                      y: e.target.y() - el.height / 2,
                    })
                  }
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const sX = node.scaleX();
                    const sY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    const w = Math.max(4, el.width * sX);
                    const h = Math.max(4, el.height * sY);
                    patchElement(el.id, {
                      width: w,
                      height: h,
                      x: node.x() - w / 2,
                      y: node.y() - h / 2,
                    });
                  }}
                />
              );
            }
            return (
              <Rect
                key={el.id}
                {...common}
                width={el.width}
                height={el.height}
                fill={el.fill || '#888'}
                stroke={el.stroke || undefined}
                strokeWidth={el.strokeWidth || 0}
              />
            );
          })}
          <Transformer
            ref={trRef}
            keepRatio={selectedEl?.type === 'image'}
            rotateEnabled={false}
            anchorFill="#7C5CFC"
            anchorStroke="#fff"
            anchorSize={7}
            borderStroke="#7C5CFC"
            ignoreStroke
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 4 || newBox.height < 4 ? oldBox : newBox
            }
          />
        </Layer>
      </Stage>

      {/* inline text editor overlay */}
      {editingText && editingEl && (
        <textarea
          autoFocus
          value={editingText.value}
          onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
          onBlur={commitTextEditor}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditingText(null);
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitTextEditor();
            e.stopPropagation();
          }}
          dir="rtl"
          style={{
            position: 'absolute',
            left: editingEl.x * zoom,
            top: editingEl.y * zoom,
            width: editingEl.width * zoom,
            height: editingEl.height * zoom,
            fontSize: (editingEl.fontSize || 14) * zoom,
            fontFamily: `${editingEl.fontFamily || 'Assistant'}${FONT_STACK_SUFFIX}`,
            fontWeight: editingEl.fontWeight === 'bold' ? 700 : Number(editingEl.fontWeight) || 400,
            color: editingEl.color || '#000',
            textAlign: editingEl.align || 'right',
            lineHeight: 1.1,
            background: 'rgba(255,255,255,0.85)',
            border: '1.5px solid #7C5CFC',
            outline: 'none',
            resize: 'none',
            padding: 0,
            overflow: 'hidden',
            zIndex: 30,
          }}
        />
      )}

      {/* right-click context menu */}
      {contextMenu && (
        <div
          className="absolute z-40 w-44 rounded-lg border border-[#333] bg-[#2a2a2a] p-1 text-xs shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            className="block w-full rounded-md px-3 py-2 text-left text-gray-200 hover:bg-[#7C5CFC]/20"
            onClick={() => setAsBackground(contextMenu.id)}
          >
            Set as background
          </button>
          {elements.find((e) => e.id === contextMenu.id)?.type === 'image' && (
            <button
              className="block w-full rounded-md px-3 py-2 text-left text-gray-200 hover:bg-[#7C5CFC]/20"
              onClick={() => {
                onRequestImageReplace(contextMenu.id);
                setContextMenu(null);
              }}
            >
              Replace image…
            </button>
          )}
          <button
            className="block w-full rounded-md px-3 py-2 text-left text-red-400 hover:bg-red-500/10"
            onClick={() => {
              onChangeElements(
                elements.filter((e) => e.id !== contextMenu.id),
                true
              );
              onSelect(null);
              setContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
