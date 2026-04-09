"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Stage, Layer, Image as KonvaImage, Transformer } from "react-konva";
import Konva from "konva";

type Props = {
  wallUrl: string;
  paintingUrl: string;
  containerWidth: number;
  hidePainting?: boolean;
  onTransformChange: (x: number, y: number, width: number, height: number, rotation: number, canvasWidth: number, canvasHeight: number) => void;
};

export type KonvaPlacementHandle = {
  resizePainting: (width: number, height: number) => void;
  getStageHeight: () => number;
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

const KonvaPlacement = forwardRef<KonvaPlacementHandle, Props>(function KonvaPlacement(
  { wallUrl, paintingUrl, containerWidth, hidePainting, onTransformChange },
  ref,
) {
  const wallImg = useImage(wallUrl);
  const paintingImg = useImage(paintingUrl);
  const paintingRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const stageHeight = wallImg
    ? Math.round((wallImg.naturalHeight / wallImg.naturalWidth) * containerWidth)
    : Math.round(containerWidth * 0.75);

  // Initial painting size: 40% of stage width centered
  const initW = containerWidth * 0.4;
  const initH = paintingImg
    ? Math.round((paintingImg.naturalHeight / paintingImg.naturalWidth) * initW)
    : initW;
  const initX = (containerWidth - initW) / 2;
  const initY = (stageHeight - initH) / 2;

  useEffect(() => {
    if (trRef.current && paintingRef.current) {
      trRef.current.nodes([paintingRef.current]);
      trRef.current.getLayer()?.batchDraw();
      // Emit initial placement so state.placement is never null
      emitChange();
    }
  }, [paintingImg]);

  // Toggle painting + transformer visibility for calibration
  useEffect(() => {
    const painting = paintingRef.current;
    const tr = trRef.current;
    if (!painting || !tr) return;
    painting.visible(!hidePainting);
    tr.visible(!hidePainting);
    tr.getLayer()?.batchDraw();
  }, [hidePainting]);

  const emitChange = () => {
    const node = paintingRef.current;
    if (!node) return;
    console.log("[Konva] emitChange", {
      x: node.x(), y: node.y(),
      w: node.width() * node.scaleX(),
      h: node.height() * node.scaleY(),
      rot: node.rotation(),
      canvasWidth: containerWidth,
      canvasHeight: stageHeight,
    });
    onTransformChange(
      node.x(),
      node.y(),
      node.width() * node.scaleX(),
      node.height() * node.scaleY(),
      node.rotation(),
      containerWidth,
      stageHeight,
    );
  };

  useImperativeHandle(ref, () => ({
    getStageHeight() {
      return stageHeight;
    },
    resizePainting(newW: number, newH: number) {
      const node = paintingRef.current;
      if (!node) return;
      const oldW = node.width() * node.scaleX();
      const oldH = node.height() * node.scaleY();
      const cx = node.x() + oldW / 2;
      const cy = node.y() + oldH / 2;
      console.log("[KonvaPlacement] resizePainting", {
        oldSize: { w: oldW, h: oldH },
        newSize: { w: newW, h: newH },
        center: { cx, cy },
        stageSize: { w: containerWidth, h: stageHeight },
      });
      node.scaleX(newW / node.width());
      node.scaleY(newH / node.height());
      node.x(cx - newW / 2);
      node.y(cy - newH / 2);
      trRef.current?.getLayer()?.batchDraw();
      emitChange();
    },
  }));

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
    <div style={{ touchAction: "pan-y" }}>
    <Stage width={containerWidth} height={stageHeight}>
      <Layer>
        <KonvaImage
          image={wallImg}
          width={containerWidth}
          height={stageHeight}
        />
        <KonvaImage
          ref={paintingRef}
          image={paintingImg}
          x={initX}
          y={initY}
          width={initW}
          height={initH}
          draggable
          onDragEnd={emitChange}
          onTransformEnd={emitChange}
        />
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio
          anchorFill="rgba(160,165,160,0.9)"
          anchorStroke="rgba(160,165,160,0.9)"
          anchorSize={8}
          anchorCornerRadius={0}
          anchorStrokeWidth={1}
          borderStroke="rgba(160,165,160,0.7)"
          borderStrokeWidth={1}
          rotateAnchorOffset={20}
          anchorStyleFunc={(anchor) => {
            anchor.hitStrokeWidth(20);
          }}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox;
            return newBox;
          }}
        />
      </Layer>
    </Stage>
    </div>
  );
});

export default KonvaPlacement;
