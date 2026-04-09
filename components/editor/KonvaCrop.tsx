"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Line, Shape } from "react-konva";
import Konva from "konva";
import { isQuadConvex } from "@/lib/geometry";
import type { Quad, Point } from "@/lib/types";

type CropMode = "rectangle" | "perspective";

type Props = {
  paintingUrl: string;
  containerWidth: number;
  mode: CropMode;
};

export type KonvaCropHandle = {
  getCropQuad: () => Quad | null;
  getDisplaySize: () => { w: number; h: number };
};

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

const CORNER_SIZE = 12;
const PAD = 24;

const KonvaCrop = forwardRef<KonvaCropHandle, Props>(function KonvaCrop(
  { paintingUrl, containerWidth, mode },
  ref,
) {
  const paintingImg = useImage(paintingUrl);
  const cropRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const dimRef = useRef<Konva.Shape>(null);

  // Perspective corner positions (display coords)
  const [perspQuad, setPerspQuad] = useState<Quad | null>(null);
  const cornerRefs = useRef<Record<string, Konva.Rect | null>>({
    topLeft: null, topRight: null, bottomRight: null, bottomLeft: null,
  });

  const stageHeight = paintingImg
    ? Math.round((paintingImg.naturalHeight / paintingImg.naturalWidth) * containerWidth)
    : Math.round(containerWidth * 0.75);

  // Initialize crop rect and perspective quad when image loads
  useEffect(() => {
    if (!paintingImg || !cropRef.current) return;
    const node = cropRef.current;
    node.setAttrs({
      x: PAD,
      y: PAD,
      width: containerWidth - PAD * 2,
      height: stageHeight - PAD * 2,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });
    if (trRef.current) {
      trRef.current.nodes([node]);
      trRef.current.getLayer()?.batchDraw();
    }
    // Init perspective quad
    setPerspQuad({
      topLeft: { x: PAD, y: PAD },
      topRight: { x: containerWidth - PAD, y: PAD },
      bottomRight: { x: containerWidth - PAD, y: stageHeight - PAD },
      bottomLeft: { x: PAD, y: stageHeight - PAD },
    });
  }, [paintingImg, containerWidth, stageHeight]);

  // Attach transformer when mode changes to rectangle
  useEffect(() => {
    if (mode === "rectangle" && trRef.current && cropRef.current) {
      trRef.current.nodes([cropRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [mode]);

  // Redraw dim overlay when crop rect changes
  const redrawDim = useCallback(() => {
    dimRef.current?.getLayer()?.batchDraw();
  }, []);

  // Perspective corner drag handler
  const onCornerDrag = useCallback((key: string) => {
    const node = cornerRefs.current[key];
    if (!node || !perspQuad) return;
    const newPoint = { x: node.x() + CORNER_SIZE / 2, y: node.y() + CORNER_SIZE / 2 };
    const newQuad = { ...perspQuad, [key]: newPoint };
    if (isQuadConvex(newQuad)) {
      setPerspQuad(newQuad);
    } else {
      // Revert to old position
      const old = perspQuad[key as keyof Quad];
      node.x(old.x - CORNER_SIZE / 2);
      node.y(old.y - CORNER_SIZE / 2);
    }
  }, [perspQuad]);

  useImperativeHandle(ref, () => ({
    getCropQuad(): Quad | null {
      if (mode === "rectangle") {
        const node = cropRef.current;
        if (!node) return null;
        const x = node.x();
        const y = node.y();
        const w = node.width() * node.scaleX();
        const h = node.height() * node.scaleY();
        const rot = (node.rotation() * Math.PI) / 180;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        // Konva rotates around origin (x, y), not center
        return {
          topLeft:     { x: x,                     y: y },
          topRight:    { x: x + w * cos,           y: y + w * sin },
          bottomRight: { x: x + w * cos - h * sin, y: y + w * sin + h * cos },
          bottomLeft:  { x: x - h * sin,           y: y + h * cos },
        };
      } else {
        return perspQuad;
      }
    },
    getDisplaySize() {
      return { w: containerWidth, h: stageHeight };
    },
  }));

  if (!paintingImg) {
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

  const isRect = mode === "rectangle";

  return (
    <div style={{ touchAction: "none" }}>
      <Stage width={containerWidth} height={stageHeight}>
        <Layer>
          {/* Painting image background */}
          <KonvaImage
            image={paintingImg}
            width={containerWidth}
            height={stageHeight}
          />

          {/* === Rectangle mode === */}
          {isRect && (
            <>
              {/* Dim overlay outside crop area */}
              <Shape
                ref={dimRef}
                sceneFunc={(ctx) => {
                  const node = cropRef.current;
                  if (!node) return;
                  const x = node.x();
                  const y = node.y();
                  const w = node.width() * node.scaleX();
                  const h = node.height() * node.scaleY();
                  const rot = (node.rotation() * Math.PI) / 180;
                  const cos = Math.cos(rot), sin = Math.sin(rot);

                  // Compute rotated corners (Konva rotates around node origin x,y)
                  const c0 = [x, y];
                  const c1 = [x + w * cos, y + w * sin];
                  const c2 = [x + w * cos - h * sin, y + w * sin + h * cos];
                  const c3 = [x - h * sin, y + h * cos];

                  // Outer rect (clockwise) + inner crop hole (counterclockwise) → evenodd fill
                  ctx.beginPath();
                  ctx.rect(0, 0, containerWidth, stageHeight);
                  ctx.moveTo(c3[0], c3[1]);
                  ctx.lineTo(c2[0], c2[1]);
                  ctx.lineTo(c1[0], c1[1]);
                  ctx.lineTo(c0[0], c0[1]);
                  ctx.closePath();

                  ctx.fillStyle = "rgba(0,0,0,0.45)";
                  ctx.fill("evenodd");
                }}
                listening={false}
              />

              {/* Crop rectangle — transparent, draggable */}
              <Rect
                ref={cropRef}
                x={PAD}
                y={PAD}
                width={containerWidth - PAD * 2}
                height={stageHeight - PAD * 2}
                fill="transparent"
                draggable
                onDragMove={redrawDim}
                onTransform={redrawDim}
              />

              {/* Transformer */}
              <Transformer
                ref={trRef}
                rotateEnabled
                keepRatio={false}
                anchorFill="white"
                anchorStroke="#4e6076"
                anchorSize={12}
                anchorCornerRadius={0}
                anchorStrokeWidth={1.5}
                borderStroke="white"
                borderStrokeWidth={1.5}
                rotateAnchorOffset={20}
                anchorStyleFunc={(anchor) => {
                  anchor.hitStrokeWidth(12);
                }}
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 40 || newBox.height < 40) return oldBox;
                  return newBox;
                }}
              />
            </>
          )}

          {/* === Perspective mode === */}
          {!isRect && perspQuad && (
            <>
              {/* Dim overlay outside quad */}
              <Shape
                sceneFunc={(ctx) => {
                  const q = perspQuad;
                  // Outer rect (clockwise) + inner quad hole (counterclockwise) → evenodd fill
                  ctx.beginPath();
                  ctx.rect(0, 0, containerWidth, stageHeight);
                  ctx.moveTo(q.bottomLeft.x, q.bottomLeft.y);
                  ctx.lineTo(q.bottomRight.x, q.bottomRight.y);
                  ctx.lineTo(q.topRight.x, q.topRight.y);
                  ctx.lineTo(q.topLeft.x, q.topLeft.y);
                  ctx.closePath();

                  ctx.fillStyle = "rgba(0,0,0,0.45)";
                  ctx.fill("evenodd");
                }}
                listening={false}
              />

              {/* Quad outline */}
              <Line
                points={[
                  perspQuad.topLeft.x, perspQuad.topLeft.y,
                  perspQuad.topRight.x, perspQuad.topRight.y,
                  perspQuad.bottomRight.x, perspQuad.bottomRight.y,
                  perspQuad.bottomLeft.x, perspQuad.bottomLeft.y,
                ]}
                closed
                stroke="white"
                strokeWidth={1.5}
                listening={false}
              />

              {/* Corner handles */}
              {(["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map((key) => {
                const p = perspQuad[key];
                return (
                  <Rect
                    key={key}
                    ref={(node) => { cornerRefs.current[key] = node; }}
                    x={p.x - CORNER_SIZE / 2}
                    y={p.y - CORNER_SIZE / 2}
                    width={CORNER_SIZE}
                    height={CORNER_SIZE}
                    fill="white"
                    stroke="#4e6076"
                    strokeWidth={1.5}
                    hitFunc={(ctx, shape) => {
                      const pad = 12;
                      ctx.beginPath();
                      ctx.rect(-pad, -pad, CORNER_SIZE + pad * 2, CORNER_SIZE + pad * 2);
                      ctx.closePath();
                      ctx.fillStrokeShape(shape);
                    }}
                    draggable
                    dragBoundFunc={(pos) => ({
                      x: Math.max(-CORNER_SIZE / 2, Math.min(containerWidth - CORNER_SIZE / 2, pos.x)),
                      y: Math.max(-CORNER_SIZE / 2, Math.min(stageHeight - CORNER_SIZE / 2, pos.y)),
                    })}
                    onDragMove={() => onCornerDrag(key)}
                  />
                );
              })}
            </>
          )}
        </Layer>
      </Stage>
    </div>
  );
});

export default KonvaCrop;
