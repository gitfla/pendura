import { ProjectState, Step } from "./types";

const DB_NAME = "pendura";
const STORE_NAME = "session";
const SESSION_KEY = "locale-switch";

type StoredSession = {
  wallImageBlob: Blob | null;
  wallImageType: string | null;
  paintingImageBlob: Blob | null;
  paintingImageType: string | null;
  croppedPaintingBlob: Blob | null;
  croppedPaintingType: string | null;
  cropRect: ProjectState["cropRect"];
  placement: ProjectState["placement"];
  calibration: ProjectState["calibration"];
  paintingDimensions: ProjectState["paintingDimensions"];
  currentStep: Step;
  maxReachedStep: Step;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, value: StoredSession): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, SESSION_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGet(db: IDBDatabase): Promise<StoredSession | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(SESSION_KEY);
    req.onsuccess = () => resolve(req.result as StoredSession | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(SESSION_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function serializeSession(
  state: ProjectState,
  currentStep: Step,
  maxReachedStep: Step,
): Promise<void> {
  const db = await openDB();
  try {
    await idbPut(db, {
      wallImageBlob: state.wallImage,
      wallImageType: state.wallImage?.type ?? null,
      paintingImageBlob: state.paintingImage,
      paintingImageType: state.paintingImage?.type ?? null,
      croppedPaintingBlob: state.croppedPaintingBlob,
      croppedPaintingType: state.croppedPaintingBlob?.type ?? null,
      cropRect: state.cropRect,
      placement: state.placement,
      calibration: state.calibration,
      paintingDimensions: state.paintingDimensions,
      currentStep,
      maxReachedStep,
    });
  } finally {
    db.close();
  }
}

export async function deserializeSession(): Promise<{
  state: ProjectState;
  currentStep: Step;
  maxReachedStep: Step;
} | null> {
  const db = await openDB();
  try {
    const data = await idbGet(db);
    if (!data) return null;
    await idbDelete(db);

    const wallFile = data.wallImageBlob
      ? new File([data.wallImageBlob], "wall-image", { type: data.wallImageType ?? undefined })
      : null;
    const paintingFile = data.paintingImageBlob
      ? new File([data.paintingImageBlob], "painting-image", {
          type: data.paintingImageType ?? undefined,
        })
      : null;

    return {
      state: {
        wallImage: wallFile,
        wallPreviewUrl: wallFile ? URL.createObjectURL(wallFile) : null,
        paintingImage: paintingFile,
        paintingPreviewUrl: paintingFile ? URL.createObjectURL(paintingFile) : null,
        croppedPaintingBlob: data.croppedPaintingBlob,
        croppedPaintingUrl: data.croppedPaintingBlob
          ? URL.createObjectURL(data.croppedPaintingBlob)
          : null,
        cropRect: data.cropRect,
        placement: data.placement,
        calibration: data.calibration,
        paintingDimensions: data.paintingDimensions,
        frameStyle: "none",
        framedPaintingBlob: null,
        framedPaintingUrl: null,
      },
      currentStep: data.currentStep,
      maxReachedStep: data.maxReachedStep,
    };
  } finally {
    db.close();
  }
}
