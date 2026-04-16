"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { clientPerspectiveWarp } from "@/lib/clientWarp";
import {
  pointInQuad,
  isQuadConvex,
  quadCentroid,
  rotateQuadAroundCentroid,
  isAxisAligned,
  euclideanDistance,
} from "@/lib/geometry";
import type { Quad, Point } from "@/lib/types";

// ── Constants ──────────────────────────────────────────────────────────────

const HANDLE_SIZE = 10;
const HIT_RADIUS = 24;
const ROTATE_HANDLE_OFFSET = 36;
const SETTLE_DURATION = 200;

// ── Types ──────────────────────────────────────────────────────────────────

type InteractionMode = "object" | "perspective";

type HandleKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";
type EdgeKey = "top" | "right" | "bottom" | "left";

type DragState =
  | { type: "move"; lastX: number; lastY: number }
  | { type: "scale"; key: HandleKey; anchor: Point }
  | { type: "rotate"; startAngle: number; centroid: Point }
  | { type: "corner"; key: HandleKey; offsetX: number; offsetY: number }
  | { type: "edge"; key: EdgeKey; perpX: number; perpY: number; fixedA: Point; fixedB: Point; movingA: Point; movingB: Point };

const OPPOSITE: Record<HandleKey, HandleKey> = {
  topLeft: "bottomRight",
  topRight: "bottomLeft",
  bottomRight: "topLeft",
  bottomLeft: "topRight",
};

const EDGES: Record<EdgeKey, { a: HandleKey; b: HandleKey; oppA: HandleKey; oppB: HandleKey }> = {
  top:    { a: "topLeft",    b: "topRight",    oppA: "bottomLeft",  oppB: "bottomRight" },
  right:  { a: "topRight",   b: "bottomRight", oppA: "topLeft",     oppB: "bottomLeft"  },
  bottom: { a: "bottomLeft", b: "bottomRight", oppA: "topLeft",     oppB: "topRight"    },
  left:   { a: "topLeft",    b: "bottomLeft",  oppA: "topRight",    oppB: "bottomRight" },
};

function scaleFromPoint(p: Point, origin: Point, factor: number): Point {
  return { x: origin.x + (p.x - origin.x) * factor, y: origin.y + (p.y - origin.y) * factor };
}

export type PlacementCanvasHandle = {
  enterPerspectiveMode: () => void;
  exitPerspectiveMode: () => void;
  setInitialRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  getCanvasHeight: () => number;
};

type Props = {
  wallUrl: string;
  paintingUrl: string;
  containerWidth: number;
  initialRect?: { x: number; y: number; width: number; height: number };
  onTransformChange: (quad: Quad, canvasWidth: number, canvasHeight: number) => void;
  onModeChange?: (mode: InteractionMode) => void;
};

// ── Image loader hook ──────────────────────────────────────────────────────

function useImage(url: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return;
    const image = new window.Image();
    image.onload = () => setImg(image);
    image.src = url;
  }, [url]);
  return img;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function angleBetween(center: Point, p: Point): number {
  return Math.atan2(p.y - center.y, p.x - center.x);
}

function quadFromRect(x: number, y: number, w: number, h: number): Quad {
  return {
    topLeft:     { x, y },
    topRight:    { x: x + w, y },
    bottomRight: { x: x + w, y: y + h },
    bottomLeft:  { x, y: y + h },
  };
}

function quadBBox(quad: Quad): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// ── Component ──────────────────────────────────────────────────────────────

const PlacementCanvas = forwardRef<PlacementCanvasHandle, Props>(function PlacementCanvas(
  { wallUrl, paintingUrl, containerWidth, initialRect, onTransformChange, onModeChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wallImg = useImage(wallUrl);
  const paintingImg = useImage(paintingUrl);
  const initializedRef = useRef(false);

  const stageHeight = wallImg
    ? Math.round((wallImg.naturalHeight / wallImg.naturalWidth) * containerWidth)
    : Math.round(containerWidth * 0.75);

  const [quad, setQuad] = useState<Quad | null>(null);
  const [mode, setMode] = useState<InteractionMode>("object");
  const draggingRef = useRef<DragState | null>(null);
  const rafRef = useRef<number>(0);

  // Settle animation
  const [settleProgress, setSettleProgress] = useState(1); // 1 = fully settled
  const settleStartRef = useRef<number>(0);
  const settleRafRef = useRef<number>(0);

  // Painting ImageData for warp
  const [paintingData, setPaintingData] = useState<ImageData | null>(null);

  // Resize tracking
  const prevContainerWidthRef = useRef<number>(0);
  const prevStageHeightRef = useRef<number>(0);

  // ── Extract painting ImageData ─────────────────────────────────────────

  useEffect(() => {
    if (!paintingImg) return;
    const oc = document.createElement("canvas");
    oc.width = paintingImg.naturalWidth;
    oc.height = paintingImg.naturalHeight;
    oc.getContext("2d")!.drawImage(paintingImg, 0, 0);
    setPaintingData(oc.getContext("2d")!.getImageData(0, 0, oc.width, oc.height));
  }, [paintingImg]);

  // ── Initialize quad on first paint load ───────────────────────────────

  useEffect(() => {
    if (!paintingImg || initializedRef.current) return;
    initializedRef.current = true;

    let q: Quad;
    if (initialRect) {
      q = quadFromRect(initialRect.x, initialRect.y, initialRect.width, initialRect.height);
    } else {
      const w = containerWidth * 0.4;
      const h = Math.round((paintingImg.naturalHeight / paintingImg.naturalWidth) * w);
      const x = (containerWidth - w) / 2;
      const y = (stageHeight - h) / 2;
      q = quadFromRect(x, y, w, h);
    }
    setQuad(q);
    onTransformChange(q, containerWidth, stageHeight);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintingImg]);

  // ── Handle frame swap: preserve visual size ───────────────────────────

  useEffect(() => {
    if (!paintingImg || !initializedRef.current || !quad) return;
    // paintingImg changed (frame swap) — quad stays the same, just redraw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintingImg]);

  // ── Canvas resize: rescale quad ────────────────────────────────────────

  useEffect(() => {
    if (!containerWidth || !wallImg) return;
    const newH = Math.round((wallImg.naturalHeight / wallImg.naturalWidth) * containerWidth);
    if (
      prevContainerWidthRef.current > 0 &&
      (prevContainerWidthRef.current !== containerWidth || prevStageHeightRef.current !== newH)
    ) {
      const sx = containerWidth / prevContainerWidthRef.current;
      const sy = newH / prevStageHeightRef.current;
      setQuad((prev) => {
        if (!prev) return prev;
        const scaled: Quad = {
          topLeft:     { x: prev.topLeft.x * sx,     y: prev.topLeft.y * sy },
          topRight:    { x: prev.topRight.x * sx,    y: prev.topRight.y * sy },
          bottomRight: { x: prev.bottomRight.x * sx, y: prev.bottomRight.y * sy },
          bottomLeft:  { x: prev.bottomLeft.x * sx,  y: prev.bottomLeft.y * sy },
        };
        onTransformChange(scaled, containerWidth, newH);
        return scaled;
      });
    }
    prevContainerWidthRef.current = containerWidth;
    prevStageHeightRef.current = newH;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerWidth, wallImg]);

  // ── Draw ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wallImg || !containerWidth || !stageHeight) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = stageHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${stageHeight}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, containerWidth, stageHeight);
    ctx.drawImage(wallImg, 0, 0, containerWidth, stageHeight);

    if (!quad) return;

    // Draw painting
    if (paintingImg) {
      if (isAxisAligned(quad)) {
        // Fast path: plain drawImage for axis-aligned quads
        const { minX, minY, maxX, maxY } = quadBBox(quad);
        ctx.drawImage(paintingImg, minX, minY, maxX - minX, maxY - minY);
      } else if (paintingData) {
        const { imageData, x, y } = clientPerspectiveWarp(paintingData, quad, containerWidth, stageHeight);
        const oc = document.createElement("canvas");
        oc.width = imageData.width;
        oc.height = imageData.height;
        oc.getContext("2d")!.putImageData(imageData, 0, 0);
        ctx.drawImage(oc, x, y);
      }
    }

    const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = quad;

    if (mode === "perspective") {
      const alpha = settleProgress < 1 ? settleProgress : 1;
      ctx.globalAlpha = alpha;

      // Quad outline
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.strokeStyle = "rgba(160,165,160,0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Corner handles
      for (const key of ["topLeft", "topRight", "bottomRight", "bottomLeft"] as HandleKey[]) {
        const p = quad[key];
        ctx.fillStyle = "rgba(160,165,160,0.9)";
        ctx.fillRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      }
      ctx.globalAlpha = 1;
    } else {
      // Object mode: quad-aligned border + corner scale handles + rotate handle
      const alpha = settleProgress < 1 ? 1 - settleProgress : 1;
      ctx.globalAlpha = alpha;

      // Border follows quad edges (already drawn as faint outline above — draw again dashed)
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.strokeStyle = "rgba(160,165,160,0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Corner scale handles at quad corners
      ctx.fillStyle = "rgba(160,165,160,0.9)";
      for (const corner of [tl, tr, br, bl]) {
        ctx.fillRect(corner.x - HANDLE_SIZE / 2, corner.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      }

      // Edge midpoint handles
      const edgeMids = [
        { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 },
        { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 },
        { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 },
        { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 },
      ];
      for (const m of edgeMids) {
        ctx.fillRect(m.x - HANDLE_SIZE / 2, m.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      }

      // Rotate handle: above midpoint of top edge
      const topMidX = (tl.x + tr.x) / 2;
      const topMidY = (tl.y + tr.y) / 2;
      // Direction perpendicular to top edge, pointing outward
      const topEdgeDx = tr.x - tl.x;
      const topEdgeDy = tr.y - tl.y;
      const topEdgeLen = Math.sqrt(topEdgeDx * topEdgeDx + topEdgeDy * topEdgeDy) || 1;
      const perpX =  topEdgeDy / topEdgeLen;
      const perpY = -topEdgeDx / topEdgeLen;
      const rotateX = topMidX + perpX * ROTATE_HANDLE_OFFSET;
      const rotateY = topMidY + perpY * ROTATE_HANDLE_OFFSET;

      ctx.beginPath();
      ctx.moveTo(topMidX, topMidY);
      ctx.lineTo(rotateX, rotateY);
      ctx.strokeStyle = "rgba(160,165,160,0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rotateX, rotateY, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(160,165,160,0.9)";
      ctx.fill();

      ctx.globalAlpha = 1;
    }
  }, [quad, mode, wallImg, paintingImg, paintingData, containerWidth, stageHeight, settleProgress]);

  // ── Imperative handle ──────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    getCanvasHeight() { return stageHeight; },
    enterPerspectiveMode() {
      setMode("perspective");
      onModeChange?.("perspective");
    },
    exitPerspectiveMode() {
      // Soft settle: perspective handles fade out, bbox fades in
      cancelAnimationFrame(settleRafRef.current);
      settleStartRef.current = performance.now();
      setSettleProgress(0);
      const animate = (now: number) => {
        const t = Math.min((now - settleStartRef.current) / SETTLE_DURATION, 1);
        const eased = 1 - (1 - t) * (1 - t); // ease-out quad
        setSettleProgress(eased);
        if (t < 1) settleRafRef.current = requestAnimationFrame(animate);
      };
      settleRafRef.current = requestAnimationFrame(animate);
      setMode("object");
      onModeChange?.("object");
    },
    setInitialRect(rect) {
      const q = quadFromRect(rect.x, rect.y, rect.width, rect.height);
      initializedRef.current = true;
      setQuad(q);
      onTransformChange(q, containerWidth, stageHeight);
    },
  }));

  // ── Pointer event helpers ──────────────────────────────────────────────

  const getPos = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const updateCursor = (pos: Point) => {
    const canvas = canvasRef.current;
    if (!canvas || !quad) { return; }

    if (mode === "object") {
      const handles = getObjectHandles(quad);
      const rotateH = handles.find(h => h.key === "rotate")!;
      if (euclideanDistance(pos, { x: rotateH.x, y: rotateH.y }) <= HIT_RADIUS) {
        canvas.style.cursor = "grab";
        return;
      }
      const scaleHandles = handles.filter(h => h.key !== "rotate");
      for (const h of scaleHandles) {
        if (Math.abs(pos.x - h.x) <= HIT_RADIUS && Math.abs(pos.y - h.y) <= HIT_RADIUS) {
          canvas.style.cursor = "crosshair";
          return;
        }
      }
      canvas.style.cursor = pointInQuad(pos, quad) ? "move" : "default";
    } else {
      // Perspective mode
      for (const key of ["topLeft", "topRight", "bottomRight", "bottomLeft"] as HandleKey[]) {
        const p = quad[key];
        if (Math.abs(pos.x - p.x) <= HIT_RADIUS && Math.abs(pos.y - p.y) <= HIT_RADIUS) {
          canvas.style.cursor = "crosshair";
          return;
        }
      }
      canvas.style.cursor = pointInQuad(pos, quad) ? "move" : "default";
    }
  };

  const getObjectHandles = (q: Quad): { key: string; x: number; y: number }[] => {
    const topMidX = (q.topLeft.x + q.topRight.x) / 2;
    const topMidY = (q.topLeft.y + q.topRight.y) / 2;
    const topEdgeDx = q.topRight.x - q.topLeft.x;
    const topEdgeDy = q.topRight.y - q.topLeft.y;
    const topEdgeLen = Math.sqrt(topEdgeDx * topEdgeDx + topEdgeDy * topEdgeDy) || 1;
    const perpX =  topEdgeDy / topEdgeLen;
    const perpY = -topEdgeDx / topEdgeLen;
    return [
      // Corner scale handles
      { key: "topLeft",     x: q.topLeft.x,     y: q.topLeft.y },
      { key: "topRight",    x: q.topRight.x,    y: q.topRight.y },
      { key: "bottomRight", x: q.bottomRight.x, y: q.bottomRight.y },
      { key: "bottomLeft",  x: q.bottomLeft.x,  y: q.bottomLeft.y },
      // Edge midpoint handles
      { key: "top",    x: (q.topLeft.x    + q.topRight.x)    / 2, y: (q.topLeft.y    + q.topRight.y)    / 2 },
      { key: "right",  x: (q.topRight.x   + q.bottomRight.x) / 2, y: (q.topRight.y   + q.bottomRight.y) / 2 },
      { key: "bottom", x: (q.bottomLeft.x + q.bottomRight.x) / 2, y: (q.bottomLeft.y + q.bottomRight.y) / 2 },
      { key: "left",   x: (q.topLeft.x    + q.bottomLeft.x)  / 2, y: (q.topLeft.y    + q.bottomLeft.y)  / 2 },
      // Rotate handle
      { key: "rotate", x: topMidX + perpX * ROTATE_HANDLE_OFFSET, y: topMidY + perpY * ROTATE_HANDLE_OFFSET },
    ];
  };

  // ── Pointer down ───────────────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent) => {
    if (!quad) return;
    const pos = getPos(e);

    if (mode === "object") {
      const handles = getObjectHandles(quad);
      const rotateH = handles.find(h => h.key === "rotate")!;

      // 1. Rotate handle
      if (euclideanDistance(pos, { x: rotateH.x, y: rotateH.y }) <= HIT_RADIUS) {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
        const c = quadCentroid(quad);
        draggingRef.current = { type: "rotate", startAngle: angleBetween(c, pos), centroid: c };
        return;
      }

      // 2. Edge midpoint handles
      const edgeHandles = handles.filter(h => h.key in EDGES);
      for (const h of edgeHandles) {
        if (Math.abs(pos.x - h.x) <= HIT_RADIUS && Math.abs(pos.y - h.y) <= HIT_RADIUS) {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const eKey = h.key as EdgeKey;
          const ed = EDGES[eKey];
          const edgeDx = quad[ed.b].x - quad[ed.a].x;
          const edgeDy = quad[ed.b].y - quad[ed.a].y;
          const len = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;
          draggingRef.current = {
            type: "edge", key: eKey,
            perpX:  edgeDy / len,
            perpY: -edgeDx / len,
            fixedA: quad[ed.oppA], fixedB: quad[ed.oppB],
            movingA: quad[ed.a],   movingB: quad[ed.b],
          };
          return;
        }
      }

      // 3. Scale handles (quad corners)
      const scaleHandles = handles.filter(h => !(h.key in EDGES) && h.key !== "rotate");
      for (const h of scaleHandles) {
        if (Math.abs(pos.x - h.x) <= HIT_RADIUS && Math.abs(pos.y - h.y) <= HIT_RADIUS) {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const key = h.key as HandleKey;
          draggingRef.current = { type: "scale", key, anchor: quad[OPPOSITE[key]] };
          return;
        }
      }

      // 3. Move (inside quad)
      if (pointInQuad(pos, quad)) {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        draggingRef.current = { type: "move", lastX: pos.x, lastY: pos.y };
      }
    } else {
      // Perspective mode
      for (const key of ["topLeft", "topRight", "bottomRight", "bottomLeft"] as HandleKey[]) {
        const p = quad[key];
        if (Math.abs(pos.x - p.x) <= HIT_RADIUS && Math.abs(pos.y - p.y) <= HIT_RADIUS) {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          draggingRef.current = { type: "corner", key, offsetX: pos.x - p.x, offsetY: pos.y - p.y };
          return;
        }
      }
      if (pointInQuad(pos, quad)) {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        draggingRef.current = { type: "move", lastX: pos.x, lastY: pos.y };
      }
    }
  };

  // ── Pointer move ───────────────────────────────────────────────────────

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) {
      updateCursor(getPos(e));
      return;
    }
    if (!quad) return;
    e.preventDefault();
    const pos = getPos(e);
    const drag = draggingRef.current;
    let newQuad: Quad;

    if (drag.type === "move") {
      const dx = pos.x - drag.lastX;
      const dy = pos.y - drag.lastY;
      newQuad = {
        topLeft:     { x: quad.topLeft.x + dx,     y: quad.topLeft.y + dy },
        topRight:    { x: quad.topRight.x + dx,    y: quad.topRight.y + dy },
        bottomRight: { x: quad.bottomRight.x + dx, y: quad.bottomRight.y + dy },
        bottomLeft:  { x: quad.bottomLeft.x + dx,  y: quad.bottomLeft.y + dy },
      };
      draggingRef.current = { type: "move", lastX: pos.x, lastY: pos.y };
    } else if (drag.type === "scale") {
      const { key, anchor } = drag;
      const origDist = euclideanDistance(anchor, quad[key]);
      if (origDist === 0) return;
      const newDist = euclideanDistance(anchor, pos);
      if (newDist < 20) return;
      const factor = newDist / origDist;
      newQuad = {
        topLeft:     scaleFromPoint(quad.topLeft,     anchor, factor),
        topRight:    scaleFromPoint(quad.topRight,    anchor, factor),
        bottomRight: scaleFromPoint(quad.bottomRight, anchor, factor),
        bottomLeft:  scaleFromPoint(quad.bottomLeft,  anchor, factor),
      };
    } else if (drag.type === "edge") {
      const { key: eKey, perpX, perpY, fixedA, fixedB, movingA, movingB } = drag;
      const midX = (movingA.x + movingB.x) / 2;
      const midY = (movingA.y + movingB.y) / 2;
      const dot = (pos.x - midX) * perpX + (pos.y - midY) * perpY;
      const newA = { x: movingA.x + dot * perpX, y: movingA.y + dot * perpY };
      const newB = { x: movingB.x + dot * perpX, y: movingB.y + dot * perpY };
      if (euclideanDistance(newA, fixedA) < 20) return;
      const ed = EDGES[eKey];
      const corners = {
        [ed.oppA]: fixedA,
        [ed.oppB]: fixedB,
        [ed.a]:    newA,
        [ed.b]:    newB,
      } as Record<HandleKey, Point>;
      newQuad = {
        topLeft:     corners.topLeft,
        topRight:    corners.topRight,
        bottomRight: corners.bottomRight,
        bottomLeft:  corners.bottomLeft,
      };
      if (!isQuadConvex(newQuad)) return;
    } else if (drag.type === "rotate") {
      const c = quadCentroid(quad);
      const currentAngle = angleBetween(c, pos);
      const deltaRad = currentAngle - drag.startAngle;
      const deltaDeg = (deltaRad * 180) / Math.PI;
      newQuad = rotateQuadAroundCentroid(quad, deltaDeg);
      draggingRef.current = { ...drag, startAngle: currentAngle, centroid: c };
    } else {
      // corner drag
      const newCorner = {
        x: Math.max(0, Math.min(containerWidth, pos.x - drag.offsetX)),
        y: Math.max(0, Math.min(stageHeight, pos.y - drag.offsetY)),
      };
      newQuad = { ...quad, [drag.key]: newCorner };
      if (!isQuadConvex(newQuad)) return;
    }

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setQuad(newQuad));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quad, containerWidth, stageHeight]);

  // ── Pointer up ─────────────────────────────────────────────────────────

  const onPointerUp = useCallback(() => {
    draggingRef.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "default";
    if (quad) onTransformChange(quad, containerWidth, stageHeight);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quad, containerWidth, stageHeight]);

  // ── Loading state ──────────────────────────────────────────────────────

  if (!wallImg || !paintingImg) {
    return (
      <div
        className="w-full flex items-center justify-center"
        style={{ height: stageHeight, backgroundColor: "var(--surface-container-low)" }}
      >
        <span className="text-xs tracking-widest uppercase" style={{ color: "var(--outline-variant)" }}>
          Loading...
        </span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", touchAction: "none", cursor: "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
});

export default PlacementCanvas;
