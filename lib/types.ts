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

export type GeometryType = "rect" | "freeQuad" | "wallAttachedQuad";
export const GeometryType = {
  Rect: "rect" as const,
  FreeQuad: "freeQuad" as const,
  WallAttachedQuad: "wallAttachedQuad" as const,
};

export type InteractionMode = "object" | "perspective";
export const InteractionMode = {
  Object: "object" as const,
  Perspective: "perspective" as const,
};

export type PlacementState = {
  quad: Quad;
  // Canvas display dimensions when the quad was recorded — needed to scale to natural image coords
  canvasWidth: number;
  canvasHeight: number;
  geometryType: GeometryType;
  surfaceAttachment: string | null; // wallPlaneId or null

  // Wall-attached fields (present when geometryType === 'wallAttachedQuad')
  planeCenter?: { u: number; v: number }; // wall-plane UV [0,1]²
  widthWallUnits?: number;  // canonical wall-plane width — source of truth
  heightWallUnits?: number; // canonical wall-plane height — source of truth

  // Real-world dimensions (present after calibration / exact size)
  realWidth?: number;  // in cm
  realHeight?: number; // in cm
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

export type WallPlane = {
  id: string;
  polygon: [Point, Point, Point, Point]; // TL, TR, BR, BL in canvas coords
  calibration?: {
    segmentA: Point;     // canvas coords
    segmentB: Point;     // canvas coords
    segmentAWall: Point; // wall-plane UV [0,1]²
    segmentBWall: Point; // wall-plane UV [0,1]²
    realDistance: number;
    unit: "cm" | "in";
    cmPerWallUnit: number; // source of truth: wall-plane units → real-world cm
  };
};

export type ProjectState = {
  wallImage: File | null;
  wallPreviewUrl: string | null;
  paintingImage: File | null;
  paintingPreviewUrl: string | null;
  croppedPaintingBlob: Blob | null;
  croppedPaintingUrl: string | null;
  cropRect: CropRect | null;
  placement: PlacementState | null;
  wallPlane: WallPlane | null;
  calibration: CalibrationState | null;
  paintingDimensions: PaintingDimensions | null;
  frameStyle: FrameStyle;
  framedPaintingBlob: Blob | null;
  framedPaintingUrl: string | null;
  selectedArtworkId: string | null;      // null = user's own upload
  userCroppedPaintingUrl: string | null; // snapshot of user's painting when they first swap to catalog
  userCroppedPaintingBlob: Blob | null;
  userCroppedPaintingAspect: number | null; // aspect ratio (w/h) of user's painting at snapshot time
};

export type Step =
  | "wall"
  | "painting"
  | "crop"
  | "placement"
  | "render";

export const STEPS: Step[] = [
  "wall",
  "painting",
  "crop",
  "placement",
  "render",
];

export const STEP_INDEX: Record<Step, number> = {
  wall: 0,
  painting: 1,
  crop: 2,
  placement: 3,
  render: 4,
};
