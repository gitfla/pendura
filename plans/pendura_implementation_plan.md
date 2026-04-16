# Pendura Placement System — Unification Plan

## Context

The placement flow currently splits rectangle editing and perspective editing across two separate steps (`placement` and `perspective`). Once a user enters PerspectiveStep, they lose access to frame controls, exact size, and the subtitle changes — it feels like a different app. The desired state: both modes live in one step, the UI below the canvas stays consistent regardless of mode, and the architecture is a foundation for future improvements (move-whole-quad, wall helper, bottom strip).

---

## Current state (accurate as of now)

**Two steps in STEPS_ORDER**: `placement` (index 3) → `perspective` (index 4) → `render` (index 5)

**PlacementStep** (`components/steps/PlacementStep.tsx`):
- Konva canvas (rectangle drag/resize/rotate)
- 12 local state vars: `containerWidth`, `photoHeight`, `calibPhase` ("off"/"measure"/"distance"/"dimensions"), `pointA`, `pointB`, `distance`, `unit`, `pxPerUnit`, `dimWidth`, `dimHeight`, `pendingResize`, `toast`, `frameStyle`
- Calibration flow: `"off"` → `"measure"` → `"distance"` → `"dimensions"` → `"off"` (Konva remounts, pendingResize applied)
- "Adjust Corners" button calls `goNext()` → navigates to PerspectiveStep
- Frame selector, Set Exact Size all visible

**PerspectiveStep** (`components/steps/PerspectiveStep.tsx`):
- Custom canvas with pointer events, RAF throttle, `clientPerspectiveWarp` for live warp preview
- `displayQuad` state initialized from `state.placement.quad`
- Corner dragging only — no whole-quad move
- Frame controls: gone. Size controls: gone.
- "← Reset to Rectangle" = `goPrev()` (back to PlacementStep)
- Continue → `goToStep("render")`

**Steps rendered** in `app/[locale]/page.tsx` as flat conditionals:
```tsx
{currentStep === "placement" && <PlacementStep />}
{currentStep === "perspective" && <PerspectiveStep />}
```

**Step type / index** in `lib/types.ts`:
- `Step` union includes `"perspective"`
- `STEP_INDEX`: perspective = 4, render = 5
- `STEPS_ORDER` in ProjectContext also includes perspective

---

## Desired goal

One unified placement step. The UI below the canvas (frame selector, size controls, angle controls, Continue button) is always visible and consistent. Mode (rectangle vs free-form) is an internal toggle, not a navigation event.

This is **Option C** from prior discussion: collapse the two steps into one, swap only the canvas, keep all controls persistent.

This directly enables:
- Frame can be changed while in perspective mode
- "Set Exact Size" stays accessible (even if not yet functional in perspective mode)
- Foundation for move-whole-quad (Phase 1 of product plan)
- Foundation for wall helper (Phase 4) — just a third mode in the same component
- Foundation for bottom strip UI (Phase 5) — controls already colocated

---

## Architecture decision

`perspective` is **removed as a navigation step**. It becomes an internal UI mode (`perspMode: boolean`) inside PlacementStep.

`STEPS_ORDER` becomes: `wall → painting → crop → placement → render`

The warp canvas code from PerspectiveStep moves into PlacementStep.

---

## Task breakdown

### Task 1 — Types and context cleanup
**Files**: `lib/types.ts`, `context/ProjectContext.tsx`

- Remove `"perspective"` from `Step` union type
- Remove `"perspective"` from `STEPS` array and `STEP_INDEX` record
- Remove `"perspective"` from `STEPS_ORDER` in ProjectContext
- Update `STEP_INDEX`: render becomes index 4 (was 5)
- `PlacementState.mode` stays as `"basic" | "perspective"` — this is data, not navigation

### Task 2 — Remove PerspectiveStep from page routing
**File**: `app/[locale]/page.tsx`

- Remove `{currentStep === "perspective" && <PerspectiveStep />}` line
- PerspectiveStep.tsx file can stay (don't delete yet — code will be moved from it)

### Task 3 — Add perspective mode to PlacementStep (+ move-whole-quad)
**File**: `components/steps/PlacementStep.tsx`

Add local state:
```ts
const [perspMode, setPerspMode] = useState(false);
const [displayQuad, setDisplayQuad] = useState<Quad | null>(null);
const [paintingData, setPaintingData] = useState<ImageData | null>(null);
const draggingRef = useRef<
  | { type: "corner"; key: HandleKey; offsetX: number; offsetY: number }
  | { type: "move"; startX: number; startY: number; quad: Quad }
  | null
>(null);
const rafRef = useRef<number>(0);
```

Move these from PerspectiveStep into PlacementStep (reuse exactly):
- `paintingData` extraction effect (from painting image → ImageData)
- `displayQuad` init effect (from `state.placement.quad`)
- Draw effect (wall + warp + quad outline on canvas)
- `getPointerPos`, `hitTest`
- `handleReset` logic

**Also implement move-whole-quad here** (this is Phase 1 of the product plan — no reason to do it twice by implementing it in PerspectiveStep first):

Pointer interaction logic:
```
onPointerDown:
  1. hitTest corners → if hit: drag corner (existing behavior)
  2. pointInQuad check → if inside quad: drag whole quad
  3. neither → ignore

onPointerMove (move mode):
  dx = pos.x - startX
  dy = pos.y - startY
  newQuad = translate all 4 corners by (dx, dy)
  if isQuadConvex(newQuad): setDisplayQuad(newQuad)
  update startX/startY for next frame

onPointerUp: save to state.placement as before
```

`pointInQuad` helper (new, ~10 lines): point-in-convex-polygon via cross products — same sign test as `isQuadConvex`.

The perspective canvas element (with pointer events) renders in place of KonvaPlacement when `perspMode === true`.

### Task 4 — Update "Adjust Corners" button
**File**: `components/steps/PlacementStep.tsx`

Change from:
```ts
onClick={goNext}  // navigates to PerspectiveStep
```
To:
```ts
onClick={() => {
  setPerspMode(true);
  // Init displayQuad from current placement state
  if (state.placement) setDisplayQuad(state.placement.quad);
}}
```

Button label toggles: when `perspMode === true`, show "Reset to Rectangle" (calls `setPerspMode(false)`). When `perspMode === false`, show "Adjust Corners".

So the two buttons become one toggle button.

### Task 5 — Continue button
**File**: `components/steps/PlacementStep.tsx`

Currently PlacementStep's Continue calls `goNext()` (→ perspective step). Change to:
```ts
goToStep("render")
```
Always goes directly to render, regardless of mode. PlacementState is already being saved on every transform/drag-end in both modes.

### Task 6 — Calibration interaction with perspMode
**File**: `components/steps/PlacementStep.tsx`

When `calibPhase !== "off"`, currently KonvaPlacement is unmounted (that's how pendingResize works). In perspective mode, calibration is not yet supported — disable the "Set Exact Size" button when `perspMode === true` (grey it out, same as current behaviour when `calibPhase !== "off"`). Add a small note or leave it for Phase 3.

### Task 7 — i18n key updates
**Files**: `messages/en.json`, `messages/pt.json`

- The "perspective" namespace keys are still needed for the button labels now living in PlacementStep
- Move/reference: `perspective.resetButton` → use in PlacementStep as toggle label
- Can either move keys into `placement` namespace or keep `perspective` namespace and import `useTranslations("perspective")` in PlacementStep alongside existing `useTranslations("placement")`
- Simplest: add to `placement` namespace — `placement.adjustCornersButton` (already exists), `placement.resetToRectButton`

### Task 8 — Progress bar / step indicator
**File**: `components/ui/ProgressBar.tsx` (or wherever it lives)

Check if ProgressBar references the `"perspective"` step. If so, remove it so the bar shows: Wall → Painting → Crop → Placement → Render (5 steps, not 6).

---

## Files to modify

| File | Change |
|------|--------|
| `lib/types.ts` | Remove `"perspective"` from Step, STEPS, STEP_INDEX |
| `context/ProjectContext.tsx` | Remove `"perspective"` from STEPS_ORDER |
| `app/[locale]/page.tsx` | Remove perspective conditional render |
| `components/steps/PlacementStep.tsx` | Add perspMode + warp canvas from PerspectiveStep |
| `components/steps/PerspectiveStep.tsx` | Keep file, but it becomes dead code (delete after Task 3 confirmed working) |
| `messages/en.json` | Add `placement.resetToRectButton` key |
| `messages/pt.json` | Add same key in Portuguese |
| `components/ui/ProgressBar.tsx` | Remove perspective step if referenced |

---

## What does NOT change

- `PlacementState.mode` ("basic" | "perspective") — still set correctly, used by render pipeline
- Frame selector UI — no changes, always visible
- `clientPerspectiveWarp` — reused as-is from `lib/clientWarp.ts`
- `rectToQuad`, `isQuadConvex` — reused as-is from `lib/geometry.ts`
- KonvaPlacement component — no changes
- RenderStep — no changes
- The render pipeline (framedPaintingBlob, perspectiveWarp server-side) — unchanged

---

## What this does NOT include (future phases)

- Set Exact Size working in perspective mode (Phase 3)
- Wall angle helper (Phase 4)
- Bottom strip UI — Angle | Size | Frame (Phase 5)

---

## Verification

1. Rectangle mode: drag/resize/rotate painting → Continue → render works
2. Click "Adjust Corners" → canvas swaps to warp canvas, subtitle updates, frame/size/continue still visible
3. Drag corners in perspective mode → warp preview redraws correctly
4. Click "Reset to Rectangle" → Konva canvas returns, painting position preserved
5. Change frame in perspective mode → frame updates (framed painting reloads, warp redraws)
6. Progress bar shows 5 steps, not 6
7. Back button from PlacementStep goes to CropStep (not perspective)
8. Continue from either mode goes directly to RenderStep
