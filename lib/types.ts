export type Point = { x: number; y: number };

export type Quad = {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
};

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlacementState = {
  mode: "basic" | "perspective";
  quad: Quad;
  rotationDeg: number;
  // Canvas display dimensions when the quad was recorded — needed to scale to natural image coords
  canvasWidth: number;
  canvasHeight: number;
};

export type CalibrationState = {
  pointA: Point;
  pointB: Point;
  realDistance: number;
  unit: "cm" | "in";
  pxPerUnit: number;
};

export type PaintingDimensions = {
  width: number;
  height: number;
  unit: "cm" | "in";
};

export type FrameStyle = "none" | "white" | "black" | "wood";

export type ProjectState = {
  wallImage: File | null;
  wallPreviewUrl: string | null;
  paintingImage: File | null;
  paintingPreviewUrl: string | null;
  croppedPaintingBlob: Blob | null;
  croppedPaintingUrl: string | null;
  cropRect: CropRect | null;
  placement: PlacementState | null;
  calibration: CalibrationState | null;
  paintingDimensions: PaintingDimensions | null;
  frameStyle: FrameStyle;
  framedPaintingBlob: Blob | null;
  framedPaintingUrl: string | null;
};

export type Step =
  | "wall"
  | "painting"
  | "crop"
  | "placement"
  | "perspective"
  | "render";

export const STEPS: Step[] = [
  "wall",
  "painting",
  "crop",
  "placement",
  "perspective",
  "render",
];

export const STEP_INDEX: Record<Step, number> = {
  wall: 0,
  painting: 1,
  crop: 2,
  placement: 3,
  perspective: 4,
  render: 5,
};
