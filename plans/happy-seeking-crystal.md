# Fix: Mobile file input — image not persisting after selection

## Context
On mobile (Safari/iOS), the `File` object returned by an `<input type="file">` can become invalid after the file picker dismisses and the page regains focus. When `compressImageIfNeeded` returns early (file < 10MB threshold), the original `File` is passed directly to `URL.createObjectURL()`. On mobile this produces a URL that immediately errors, so the preview never shows and the state appears to not persist.

## Root cause
`compressImageIfNeeded` in `lib/image.ts` has an early return:
```ts
if (file.size <= WARN_IMAGE_SIZE_BYTES) return file;
```
This skips the canvas draw step — meaning we never copy the file bytes into a stable in-memory Blob. The returned `File` object is the raw browser reference, which mobile Safari invalidates.

## Fix — one file, one function
In `lib/image.ts`, remove the early return. Always read the file through a canvas draw (or at minimum through a `FileReader` → ArrayBuffer → Blob copy) to produce a stable in-memory Blob. Since we already have the canvas pipeline for large files, just run all files through it.

Simplest safe change: replace the early return with a `FileReader`-based copy that reads the raw bytes into an `ArrayBuffer` and re-creates the `File` from that buffer. This guarantees a stable in-memory reference on all platforms.

```ts
// Before (broken on mobile):
if (file.size <= WARN_IMAGE_SIZE_BYTES) return file;

// After (stable on all platforms):
// Always copy bytes into memory via FileReader before using
const buffer = await readFileToBuffer(file);
const stableFile = new File([buffer], file.name, { type: file.type });
// then proceed with compression check on stableFile
```

## Files to change
- `lib/image.ts` — `compressImageIfNeeded` function only

## No other changes needed
`WallUploadStep` and `PaintingUploadStep` call `compressImageIfNeeded` and then `URL.createObjectURL` on the result — once the result is always a stable in-memory Blob/File, the preview URL will work correctly on mobile without touching the component files.

## Verification
1. Open on mobile Safari / Chrome on iOS
2. Select a photo under 10MB from camera roll
3. Preview should appear immediately after picker closes
4. State should persist when navigating forward/back