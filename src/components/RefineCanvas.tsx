"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KImage, Rect, Group } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { CropRect } from "@/lib/types";
import { outerRect, rotatePoint, withRotationAboutCenter } from "@/lib/cropGeometry";

interface Props {
  imageUrl: string;
  marginPx: number;
  rect: CropRect;
  rotate180: boolean;
  onRectChange: (r: CropRect) => void;
  onToggle180: () => void;
  onImageLoad?: (img: HTMLImageElement) => void;
  /** When false, this canvas ignores keyboard shortcuts (multi-pane screens). */
  keyboardActive?: boolean;
  /** Changing this value refits the view (pass the card id). */
  fitKey?: string | number;
}

const MASK_EXTENT = 100000;

/**
 * Viewfinder-style editor: the crop marks are fixed and axis-aligned, and the
 * scan is drawn transformed so the crop's export boundary fills the frame —
 * exactly what will be saved, including the 180° flip. Dragging, nudging and
 * rotating move the CARD under the static marks (inverse edits to the rect).
 */
export default function RefineCanvas({
  imageUrl,
  marginPx,
  rect,
  rotate180,
  onRectChange,
  onToggle180,
  onImageLoad,
  keyboardActive = true,
  fitKey,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.1 });

  const rectRef = useRef(rect);
  const flipRef = useRef(rotate180);
  const viewRef = useRef(view);
  useEffect(() => {
    rectRef.current = rect;
    flipRef.current = rotate180;
    viewRef.current = view;
  }, [rect, rotate180, view]);

  useEffect(() => {
    const el = new window.Image();
    el.onload = () => {
      setImg(el);
      onImageLoad?.(el);
    };
    el.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const outer = outerRect(rect, marginPx);
  const frameW = outer.w;
  const frameH = outer.h;

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = rectRef.current;
    const w = r.w + 2 * marginPx;
    const h = r.h + 2 * marginPx;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(cw / (w * 1.1), ch / (h * 1.1));
    setView({ scale, x: (cw - w * scale) / 2, y: (ch - h * scale) / 2 });
  }, [marginPx]);

  useEffect(() => {
    fitView();
  }, [fitView, img, fitKey, size]);

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

  /** Move the card's apparent position by (dx, dy) frame pixels. */
  const nudgeCard = useCallback(
    (dx: number, dy: number) => {
      const r = rectRef.current;
      const eff = r.rotation + (flipRef.current ? 180 : 0);
      const d = rotatePoint(dx, dy, eff);
      onRectChange({ ...r, x: r.x - d.x, y: r.y - d.y });
    },
    [onRectChange]
  );

  /** Rotate the card's apparent orientation by `deg` clockwise (marks fixed). */
  const rotateCard = useCallback(
    (deg: number) => {
      const r = rectRef.current;
      onRectChange(withRotationAboutCenter(r, r.rotation - deg));
    },
    [onRectChange]
  );

  useEffect(() => {
    if (!keyboardActive) return;
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
      if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) {
        fitView();
        return;
      }
      if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onToggle180();
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
        nudgeCard(...arrows[e.key]);
        return;
      }
      if (e.key === "[" || e.key === "]" || e.key === "{" || e.key === "}") {
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : 0.5;
        rotateCard(e.key === "]" || e.key === "}" ? step : -step);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keyboardActive, fitView, onToggle180, nudgeCard, rotateCard]);

  // Source -> frame transform, matching renderCrop: R(-θ)·(p − outerAnchor),
  // plus a 180° spin within the frame when flipped.
  const groupRotation = rotate180 ? 180 - rect.rotation : -rect.rotation;
  const anchorMapped = rotatePoint(outer.x, outer.y, groupRotation);
  const groupX = (rotate180 ? frameW : 0) - anchorMapped.x;
  const groupY = (rotate180 ? frameH : 0) - anchorMapped.y;

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
        onWheel={onWheel}
      >
        <Layer>
          <Group x={groupX} y={groupY} rotation={groupRotation}>
            {img && (
              <KImage
                image={img}
                draggable
                onMouseEnter={() => {
                  const el = stageRef.current?.container();
                  if (el) el.style.cursor = "grab";
                }}
                onMouseLeave={() => {
                  const el = stageRef.current?.container();
                  if (el) el.style.cursor = "";
                }}
                onDragEnd={(e) => {
                  // Drag delta is in source coordinates (group-local): the
                  // image moved by (dx, dy), so the crop moves the other way.
                  const dx = e.target.x();
                  const dy = e.target.y();
                  e.target.position({ x: 0, y: 0 });
                  const r = rectRef.current;
                  onRectChange({ ...r, x: r.x - dx, y: r.y - dy });
                }}
              />
            )}
          </Group>

          {/* mask everything outside the export frame */}
          <Rect x={-MASK_EXTENT} y={-MASK_EXTENT} width={2 * MASK_EXTENT} height={MASK_EXTENT} fill="#000" listening={false} />
          <Rect x={-MASK_EXTENT} y={frameH} width={2 * MASK_EXTENT} height={MASK_EXTENT} fill="#000" listening={false} />
          <Rect x={-MASK_EXTENT} y={0} width={MASK_EXTENT} height={frameH} fill="#000" listening={false} />
          <Rect x={frameW} y={0} width={MASK_EXTENT} height={frameH} fill="#000" listening={false} />

          {/* static crop marks: solid = export boundary, dashed = card edge */}
          <Rect
            x={0}
            y={0}
            width={frameW}
            height={frameH}
            stroke="rgba(245,158,11,0.95)"
            strokeWidth={1.5}
            strokeScaleEnabled={false}
            listening={false}
          />
          <Rect
            x={marginPx}
            y={marginPx}
            width={rect.w}
            height={rect.h}
            stroke="#22d3ee"
            strokeWidth={1.2}
            strokeScaleEnabled={false}
            dash={[6 * strokeScale, 4 * strokeScale]}
            listening={false}
          />
        </Layer>
      </Stage>
    </div>
  );
}
