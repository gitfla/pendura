"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Transformer } from "react-konva";
import Konva from "konva";

type Props = {
  wallUrl: string;
  paintingUrl: string;
  containerWidth: number;
  onTransformChange: (x: number, y: number, width: number, height: number, rotation: number, canvasWidth: number, canvasHeight: number) => void;
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

export default function KonvaPlacement({
  wallUrl,
  paintingUrl,
  containerWidth,
  onTransformChange,
}: Props) {
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
    }
  }, [paintingImg]);

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
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox;
            return newBox;
          }}
        />
      </Layer>
    </Stage>
  );
}
