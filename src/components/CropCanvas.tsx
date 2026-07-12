"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Stage, Layer, Image as KImage, Rect, Transformer, Label, Tag, Text } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { CropRect } from "@/lib/types";
import { outerRect, withRotationAboutCenter, cropCenter, anchorFromCenter } from "@/lib/cropGeometry";

export interface CropBox {
  key: string;
  rect: CropRect;
  label: number;
  rotate180?: boolean;
}

export interface CropCanvasHandle {
  fitView: () => void;
  /** Zoom/center the viewport onto a specific rect (source-image pixels). */
  fitToRect: (rect: CropRect, padding?: number) => void;
  /** Center of the current viewport in source-image pixels. */
  viewCenter: () => { x: number; y: number };
}

interface Props {
  imageUrl: string;
  marginPx: number;
  boxes: CropBox[];
  onBoxesChange: (next: CropBox[]) => void;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onToggle180?: (key: string) => void;
  onImageLoad?: (img: HTMLImageElement) => void;
  /** Reference view: zoom/pan and box selection only, no editing or keyboard. */
  readOnly?: boolean;
  /** When false, this canvas ignores keyboard shortcuts (multi-pane screens). */
  keyboardActive?: boolean;
  /** When false, skip the fit-whole-image on load (parent will call fitToRect). */
  autoFit?: boolean;
}

const LOUPE_SIZE = 176;
const LOUPE_ZOOM = 4;

const CropCanvas = forwardRef<CropCanvasHandle, Props>(function CropCanvas(
  {
    imageUrl,
    marginPx,
    boxes,
    onBoxesChange,
    selectedKey,
    onSelect,
    onToggle180,
    onImageLoad,
    readOnly = false,
    keyboardActive = true,
    autoFit = true,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const rectRefs = useRef<Map<string, Konva.Rect>>(new Map());
  const loupeRef = useRef<HTMLCanvasElement>(null);

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.1 });
  const [loupe, setLoupe] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(
    null
  );

  const boxesRef = useRef(boxes);
  const selectedRef = useRef(selectedKey);
  const viewRef = useRef(view);
  useEffect(() => {
    boxesRef.current = boxes;
    selectedRef.current = selectedKey;
    viewRef.current = view;
  }, [boxes, selectedKey, view]);

  // ---- image loading ----
  useEffect(() => {
    const el = new window.Image();
    el.onload = () => {
      setImg(el);
      onImageLoad?.(el);
    };
    el.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // ---- container sizing ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback(() => {
    if (!img) return;
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight) * 0.97;
    setView({
      scale,
      x: (cw - img.naturalWidth * scale) / 2,
      y: (ch - img.naturalHeight * scale) / 2,
    });
  }, [img]);

  useEffect(() => {
    if (autoFit) fitView();
  }, [fitView, autoFit]);

  const fitToRect = useCallback((rect: CropRect, padding = 0.25) => {
    const el = containerRef.current;
    if (!el) return;
    // Axis-aligned bounds of the (possibly rotated) rect.
    const corners = [
      { x: 0, y: 0 },
      { x: rect.w, y: 0 },
      { x: 0, y: rect.h },
      { x: rect.w, y: rect.h },
    ].map((c) => {
      const r = (rect.rotation * Math.PI) / 180;
      return {
        x: rect.x + c.x * Math.cos(r) - c.y * Math.sin(r),
        y: rect.y + c.x * Math.sin(r) + c.y * Math.cos(r),
      };
    });
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const bw = (maxX - minX) * (1 + padding * 2);
    const bh = (maxY - minY) * (1 + padding * 2);
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(8, Math.max(0.02, Math.min(cw / bw, ch / bh)));
    setView({
      scale,
      x: cw / 2 - ((minX + maxX) / 2) * scale,
      y: ch / 2 - ((minY + maxY) / 2) * scale,
    });
  }, []);

  useImperativeHandle(ref, () => ({
    fitView,
    fitToRect,
    viewCenter: () => {
      const v = viewRef.current;
      const el = containerRef.current;
      const cw = el?.clientWidth ?? 800;
      const ch = el?.clientHeight ?? 600;
      return { x: (cw / 2 - v.x) / v.scale, y: (ch / 2 - v.y) / v.scale };
    },
  }));

  // ---- transformer attachment ----
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedKey ? rectRefs.current.get(selectedKey) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedKey, boxes]);

  // ---- zoom ----
  const onWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const old = viewRef.current;
    const factor = Math.exp(-e.evt.deltaY * 0.0015);
    const scale = Math.min(8, Math.max(0.02, old.scale * factor));
    const mx = (pointer.x - old.x) / old.scale;
    const my = (pointer.y - old.y) / old.scale;
    setView({ scale, x: pointer.x - mx * scale, y: pointer.y - my * scale });
  }, []);

  // ---- box updates ----
  const updateBox = useCallback(
    (key: string, rect: CropRect) => {
      onBoxesChange(
        boxesRef.current.map((b) => (b.key === key ? { ...b, rect } : b))
      );
    },
    [onBoxesChange]
  );

  const showLoupeAtPointer = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const v = viewRef.current;
    setLoupe({
      sx: (pointer.x - v.x) / v.scale,
      sy: (pointer.y - v.y) / v.scale,
      cx: pointer.x,
      cy: pointer.y,
    });
  }, []);

  // ---- loupe rendering ----
  useEffect(() => {
    const canvas = loupeRef.current;
    if (!canvas || !loupe || !img) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    const srcSize = LOUPE_SIZE / LOUPE_ZOOM;
    ctx.drawImage(
      img,
      loupe.sx - srcSize / 2,
      loupe.sy - srcSize / 2,
      srcSize,
      srcSize,
      0,
      0,
      LOUPE_SIZE,
      LOUPE_SIZE
    );
    ctx.strokeStyle = "rgba(34, 211, 238, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LOUPE_SIZE / 2, 0);
    ctx.lineTo(LOUPE_SIZE / 2, LOUPE_SIZE);
    ctx.moveTo(0, LOUPE_SIZE / 2);
    ctx.lineTo(LOUPE_SIZE, LOUPE_SIZE / 2);
    ctx.stroke();
  }, [loupe, img]);

  // ---- keyboard ----
  useEffect(() => {
    if (readOnly || !keyboardActive) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
      const current = boxesRef.current;
      const sel = selectedRef.current;
      const selBox = current.find((b) => b.key === sel);

      if (e.key === "Tab") {
        e.preventDefault();
        if (current.length === 0) return;
        const idx = current.findIndex((b) => b.key === sel);
        const next = current[(idx + (e.shiftKey ? current.length - 1 : 1)) % current.length];
        onSelect(next.key);
        return;
      }
      if (e.key === "Escape") {
        onSelect(null);
        return;
      }
      if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) {
        fitView();
        return;
      }
      if (!selBox) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onBoxesChange(current.filter((b) => b.key !== sel));
        onSelect(null);
        return;
      }
      if (e.key.toLowerCase() === "r" && onToggle180 && sel) {
        e.preventDefault();
        onToggle180(sel);
        return;
      }
      const nudge = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-nudge, 0],
        ArrowRight: [nudge, 0],
        ArrowUp: [0, -nudge],
        ArrowDown: [0, nudge],
      };
      if (e.key in arrows) {
        e.preventDefault();
        const [dx, dy] = arrows[e.key];
        updateBox(selBox.key, { ...selBox.rect, x: selBox.rect.x + dx, y: selBox.rect.y + dy });
        return;
      }
      if (e.key === "[" || e.key === "]" || e.key === "{" || e.key === "}") {
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : 0.5;
        const dir = e.key === "]" || e.key === "}" ? 1 : -1;
        updateBox(
          selBox.key,
          withRotationAboutCenter(selBox.rect, selBox.rect.rotation + dir * step)
        );
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onBoxesChange, onSelect, onToggle180, updateBox, fitView, readOnly, keyboardActive]);

  const strokeScale = 1 / view.scale;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable
        onWheel={onWheel}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }
        }}
        onMouseDown={(e) => {
          // Deselect when clicking the bare stage or the scan image.
          if (e.target === stageRef.current || e.target.name() === "scan") onSelect(null);
        }}
      >
        <Layer>
          {img && <KImage image={img} name="scan" />}

          {/* outer export boundaries (margin included) */}
          {boxes.map((b) => {
            const o = outerRect(b.rect, marginPx);
            return (
              <Rect
                key={`outer-${b.key}`}
                x={o.x}
                y={o.y}
                width={o.w}
                height={o.h}
                rotation={o.rotation}
                stroke={b.key === selectedKey ? "rgba(245,158,11,0.95)" : "rgba(255,255,255,0.35)"}
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                listening={false}
              />
            );
          })}

          {/* inner guides: align these to the physical card edges */}
          {boxes.map((b) => (
            <Rect
              key={`inner-${b.key}`}
              ref={(node) => {
                if (node) rectRefs.current.set(b.key, node);
                else rectRefs.current.delete(b.key);
              }}
              x={b.rect.x}
              y={b.rect.y}
              width={b.rect.w}
              height={b.rect.h}
              rotation={b.rect.rotation}
              fill="rgba(0,0,0,0.001)"
              stroke={b.key === selectedKey ? "#22d3ee" : "rgba(34,211,238,0.55)"}
              strokeWidth={1.2}
              strokeScaleEnabled={false}
              dash={[6 * strokeScale, 4 * strokeScale]}
              draggable={!readOnly}
              onClick={() => onSelect(b.key)}
              onTap={() => onSelect(b.key)}
              onMouseDown={() => onSelect(b.key)}
              onDragMove={(e) => {
                updateBox(b.key, { ...b.rect, x: e.target.x(), y: e.target.y() });
                showLoupeAtPointer();
              }}
              onDragEnd={(e) => {
                updateBox(b.key, { ...b.rect, x: e.target.x(), y: e.target.y() });
                setLoupe(null);
              }}
              onTransform={(e) => {
                // Rotation-only transformer: size never changes.
                const node = e.target as Konva.Rect;
                node.scaleX(1);
                node.scaleY(1);
                updateBox(b.key, {
                  ...b.rect,
                  x: node.x(),
                  y: node.y(),
                  rotation: node.rotation(),
                });
                showLoupeAtPointer();
              }}
              onTransformEnd={(e) => {
                const node = e.target as Konva.Rect;
                node.scaleX(1);
                node.scaleY(1);
                updateBox(b.key, {
                  ...b.rect,
                  x: node.x(),
                  y: node.y(),
                  rotation: node.rotation(),
                });
                setLoupe(null);
              }}
            />
          ))}

          {/* number badges */}
          {boxes.map((b) => {
            const c = cropCenter(b.rect);
            const badge = anchorFromCenter(c.x, c.y, 0, 0, 0);
            return (
              <Label
                key={`label-${b.key}`}
                x={badge.x}
                y={badge.y}
                scaleX={strokeScale}
                scaleY={strokeScale}
                listening={false}
                offsetX={14}
                offsetY={14}
              >
                <Tag
                  fill={b.key === selectedKey ? "#22d3ee" : "rgba(0,0,0,0.75)"}
                  stroke={b.key === selectedKey ? "#22d3ee" : "rgba(34,211,238,0.7)"}
                  strokeWidth={1}
                  cornerRadius={14}
                />
                <Text
                  text={`${b.label}${b.rotate180 ? " ⤾180°" : ""}`}
                  fontSize={16}
                  fontStyle="bold"
                  fill={b.key === selectedKey ? "#000" : "#e5e7eb"}
                  padding={7}
                />
              </Label>
            );
          })}

          {/* rotation-only: cards are all standard index size, no resizing */}
          {!readOnly && (
            <Transformer
              ref={trRef}
              rotateEnabled
              resizeEnabled={false}
              enabledAnchors={[]}
              rotationSnaps={[0, 90, 180, 270]}
              rotationSnapTolerance={3}
              ignoreStroke
              anchorSize={11}
              anchorCornerRadius={5}
              anchorStroke="#22d3ee"
              anchorFill="#0e7490"
              borderEnabled={false}
              flipEnabled={false}
            />
          )}
        </Layer>
      </Stage>

      {/* corner magnifier loupe */}
      {loupe && (
        <canvas
          ref={loupeRef}
          width={LOUPE_SIZE}
          height={LOUPE_SIZE}
          className="pointer-events-none absolute rounded-full border-2 border-cyan-400/80 shadow-lg shadow-black"
          style={{
            left: Math.min(loupe.cx + 24, size.w - LOUPE_SIZE - 8),
            top: Math.max(8, loupe.cy - LOUPE_SIZE - 24 < 8 ? loupe.cy + 24 : loupe.cy - LOUPE_SIZE - 24),
          }}
        />
      )}
    </div>
  );
});

export default CropCanvas;
