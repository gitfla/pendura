# Pendura — Wall-Aware Geometry / Perspective / Exact Size Proposal

## Goal
Define a clean product and engineering model for:
- object mode vs corner editing
- free perspective vs wall-aware perspective
- exact size behavior across geometry states
- wall helper integration
- resize behavior for warped quads

This spec is intended to guide implementation decisions in the current codebase.

---

## Core proposal

Keep **2 top-level interaction modes** only:

1. **Object mode**
2. **Corner edit mode**

Do **not** create a third top-level mode for wall-aware perspective.

Instead, wall-awareness should be an **object geometry state / capability**, reached from inside corner edit mode.

---

## High-level model

Separate these concerns:

### 1. Interaction state
Controls what the user is currently doing.

- `object`
- `cornerEdit`

### 2. Geometry state
Controls what kind of shape/projection the artwork currently has.

- `rect`
- `freeQuad`
- `wallAttachedQuad`

### 3. Precision / calibration state
Controls whether exact size is meaningful.

- `none`
- `approximate`
- `calibrated`

These are different axes and should not be collapsed into a single “mode”.

---

## UX model

### Object mode
Primary manipulation state.

User can:
- move artwork
- resize artwork
- open exact size flow
- swap artwork
- save composition
- enter corner edit mode

### Corner edit mode
Temporary geometry editing state.

Inside corner edit mode, user can choose one of two paths:
- **Free corner adjustment**
- **Wall-aware attachment / wall guide**

On confirm, user returns to **object mode**.

Important: corner edit mode is temporary. The user should not remain stuck in “corner math”.

---

## Geometry states and capabilities

### A. `rect`
Default front-facing / axis-aligned object.

Capabilities:
- move
- resize
- exact size = enabled
- can enter corner edit mode

### B. `freeQuad`
User manually adjusted corners without attaching to a known wall plane.

Capabilities:
- move = enabled
- resize = enabled, but should scale the quad proportionally
- exact size = **not truly exact**
- can re-enter corner edit mode

Exact size in this state should be either:
- disabled, or
- explicitly labeled approximate/suggested only

### C. `wallAttachedQuad`
Artwork is attached to a known wall plane / wall-aware system.

Capabilities:
- move = enabled, but should remain wall-aware
- resize = enabled, should preserve wall-plane behavior
- exact size = enabled
- can re-enter corner edit mode

If user manually distorts corners in a way that breaks wall-plane consistency, downgrade to `freeQuad`.

---

## Exact size rules

### Exact size should be enabled for:
- `rect`
- `wallAttachedQuad`

### Exact size should not be treated as truly exact for:
- `freeQuad`

Reason:
A free quad has no guaranteed wall-plane meaning. It may represent arbitrary distortion, another surface, or impossible geometry.

### UI rule
The user can still see one `Set size` action in object mode, but behavior depends on geometry state.

#### Behavior by state

##### 1. `rect`
Current behavior can remain.

Exact size updates front-facing width/height based on current calibration approach.

##### 2. `wallAttachedQuad`
Exact size should update the artwork’s **real-world wall-plane size**, then recompute the projected quad.

##### 3. `freeQuad`
Recommended behavior:
- disable `Set exact size`, or
- show a lightweight prompt:
  - “Exact size requires matching the artwork to a wall plane.”
  - Options:
    - `Match wall`
    - `Return to rectangle`
    - `Cancel`

Avoid silently snapping back to rectangle with no explanation.

---

## Important conceptual shift

### Current likely model
Artwork truth is the visible screen quad.

### Proposed model
For wall-aware exact sizing, the visible quad should **not** be the source of truth.

Source of truth should be:
- wall plane attachment
- artwork center/anchor on wall plane
- artwork real width/height in wall units
- orientation/alignment on that wall plane

Then the visible quad is computed/projection output.

This is the meaning of:

> store the artwork in wall-plane coordinates, not only image quad coordinates

---

## What “store in wall-plane coordinates” means

Instead of only storing 4 image points:
- `p1, p2, p3, p4`

store a wall-aware object like:
- `surfaceAttachment: wallPlaneId | null`
- `planeCenter: {u, v}` or similar plane-local coordinates
- `realWidth`
- `realHeight`
- `planeRotation` (optional, likely 0 if aligned to wall axes)
- derived `projectedQuad`

Then when the object moves on the wall:
- real size stays the same
- projected appearance changes naturally
- farther on wall can appear smaller
- closer can appear larger

This is correct behavior.

---

## Wall helper role

Wall helper should not be a new top-level screen.

It should live **inside corner edit mode** as an optional assist.

### Purpose
Wall helper should:
- define a known wall plane / wall region
- provide wall-aligned perspective
- enable trustworthy exact sizing in perspective
- generate or guide the artwork corners so they match the wall angle

### Product role
Wall helper is not just a UX helper. It is what upgrades a warped object from:
- `freeQuad`

to
- `wallAttachedQuad`

---

## Free perspective vs wall-aware perspective

Support both.

### Free perspective
- manual corner adjustment
- flexible
- can be used anywhere
- no trustworthy exact size
- no guaranteed wall semantics

### Wall-aware perspective
- known wall plane / wall polygon / wall guide
- painting angle should default to match wall
- exact size becomes meaningful
- movement can preserve real wall-plane size and reproject correctly

This is the clean split.

---

## Should wall-aware placement be restricted to the wall area?

### Short answer
For wall-aware exact sizing: **yes, mostly**.

Reason:
Once the object is attached to a known wall plane, the math only makes sense on that plane.

If user drags the artwork to:
- another wall
- the floor
- outside the known wall polygon

then the same plane no longer applies.

### Recommended UX behavior
Use a **soft constraint** first, not a hard one.

Possible behaviors:
- strongly snap/prefer within wall region
- if dragged outside wall, either:
  - detach from wall and become `freeQuad`, or
  - show reduced trust / disable exact size

Recommended architecture:
- `surfaceAttachment: wallPlaneId | null`

If `null`:
- object behaves as rect or free quad

If attached:
- wall-aware behavior applies

---

## Does wall-aware exact size require a 4-point wall system?

Not strictly, but it does require **enough wall-plane knowledge**.

### Options

#### Option 1 — 4-point wall polygon
Best complete first system.

Provides:
- wall area
- wall plane definition
- placement bounds
- strongest basis for wall-aware exact size
- strongest basis for auto-matching painting corners to wall angle

#### Option 2 — 2-point wall direction helper
Useful for orientation guidance only.

Provides:
- dominant wall direction / angle hint

Weak for:
- full wall bounds
- trustworthy exact-size across the wall
- knowing where placement should stop

#### Recommendation
If the goal is:
- auto-matching painting perspective to wall
- exact size on angled walls
- correct behavior as painting moves across wall

then some explicit wall plane / area model is needed.

Best first robust version: **4-point wall system**.

---

## Recommended interpretation of wall helper

Inside corner edit mode:
- `Free adjust`
- `Match wall`

If user chooses `Match wall`:
- define wall plane (likely 4 points)
- generate wall-aware painting projection
- return to object mode with geometry state = `wallAttachedQuad`

This avoids a third global mode.

---

## Resize behavior for warped quads

### Problem
In current model, quad mode allows move but not resize.

### Proposed behavior
After confirming corners, return to object mode and allow resize again.

For warped objects, resize should:
- scale the entire quad proportionally
- preserve its shape
- preserve its perspective character
- use a stable center as anchor

### Rule
Resize should **not** mean dragging corners manually again.

It should mean:
- same object
- same wall/perspective shape
- bigger or smaller overall

### Implementation mental model
Use the quad’s center / centroid (or other stable center) and scale all corner points outward/inward proportionally.

#### For `freeQuad`
This is a purely visual scale.

#### For `wallAttachedQuad`
Prefer resizing by updating the artwork’s **real wall-plane size** and recomputing projection.

---

## What happens when exact size is used today and object snaps back to rectangle?

That behavior should be changed.

Snapping back to rectangle is only acceptable if user explicitly chooses to return to rectangle mode.

If exact size is invoked on a warped object:

### For `wallAttachedQuad`
Do not unwarp.
- update real size on wall plane
- regenerate projected quad

### For `freeQuad`
Do not silently unwarp.
Use a prompt or disable exact size.

---

## Recommended state transitions

```text
                 ┌──────────────────────┐
                 │    object / rect     │
                 │ exact size: enabled  │
                 └──────────┬───────────┘
                            │ enter corner edit
                            ▼
                 ┌──────────────────────┐
                 │    corner edit       │
                 │ free or wall-aware   │
                 └───────┬───────┬──────┘
                         │       │
            free adjust  │       │ match wall
                         │       │
                         ▼       ▼
      ┌──────────────────────┐   ┌──────────────────────────┐
      │ object / freeQuad    │   │ object / wallAttached    │
      │ exact size: no/approx│   │ exact size: enabled      │
      └──────────┬───────────┘   └────────────┬─────────────┘
                 │                            │
                 │ re-enter corner edit       │ re-enter corner edit
                 ▼                            ▼
             corner edit                  corner edit
```

### Additional downgrade rule
If user manually drags a wall-attached quad’s corners in arbitrary ways that no longer fit the wall plane:

```text
wallAttachedQuad  --manual free distortion-->  freeQuad
```

This should also downgrade exact-size trust from `calibrated` to `approximate` or `none`.

---

## Interaction/action matrix

| Geometry state      | Move | Resize | Exact size | Corner edit | Wall-aware behavior |
|---------------------|------|--------|------------|-------------|---------------------|
| `rect`              | Yes  | Yes    | Yes        | Yes         | No                  |
| `freeQuad`          | Yes  | Yes    | No / Approx| Yes         | No                  |
| `wallAttachedQuad`  | Yes  | Yes    | Yes        | Yes         | Yes                 |

---

## Non-linear UX journey

Do **not** force a fixed sequence like:
1. define wall
2. define angle
3. set exact size
4. place artwork

That is too rigid.

Use a non-linear model:
- place roughly
- adjust corners if needed
- optionally match wall
- set exact size if meaningful
- move again
- tweak again

This is consistent with how users actually work.

The product should allow refinement in different orders.

---

## Recommended implementation priority

### Priority 1
Preserve current 2-mode interaction structure:
- object mode
- corner edit mode

### Priority 2
Add internal geometry state support:
- `rect`
- `freeQuad`
- `wallAttachedQuad`

### Priority 3
Fix post-warp object continuity:
- warped object returns to object mode
- move works
- resize works
- no forced snap back to rect

### Priority 4
Implement exact size rules by state:
- rect = enabled
- wallAttachedQuad = enabled
- freeQuad = disabled or approximate

### Priority 5
Add wall helper within corner edit mode:
- likely 4-point wall plane if wall-aware exact sizing is a real target

---

## Minimal data model suggestion

This is not prescriptive, but useful as a target shape.

```ts
interface ArtworkPlacement {
  id: string;

  interactionState: 'object' | 'cornerEdit';
  geometryType: 'rect' | 'freeQuad' | 'wallAttachedQuad';
  sizeMode: 'none' | 'approximate' | 'calibrated';

  artworkId: string;

  // common logical coordinates
  position: { x: number; y: number };
  baseWidth: number;
  baseHeight: number;

  // if rect or free visual transform uses it
  scale?: number;

  // explicit projected shape when needed
  projectedQuad?: [Point, Point, Point, Point];

  // wall attachment
  surfaceAttachment: string | null; // wallPlaneId
  planeCenter?: { u: number; v: number };
  realWidth?: number;
  realHeight?: number;
  planeRotation?: number;
}
```

Wall plane example:

```ts
interface WallPlane {
  id: string;
  polygon: [Point, Point, Point, Point];
  calibration?: {
    referenceSegmentImage: [Point, Point];
    referenceLengthReal: number;
    units: 'cm' | 'in';
  };
}
```

Notes:
- `projectedQuad` can remain useful even in wallAttached state, but should be treated as derived/render output, not only truth.
- actual implementation can differ; this is to clarify the conceptual target.

---

## Rendering/resize notes

### For `freeQuad`
Source of truth may still be `projectedQuad`.

Resize:
- compute center
- scale all quad points about center
- update quad

### For `wallAttachedQuad`
Preferred source of truth:
- wall plane attachment
- real size
- plane-local position

Resize:
- update `realWidth` / `realHeight`
- recompute projection into image space

---

## Key engineering/product rules

1. **Do not create a third global mode for wall-aware perspective.**
2. **Keep corner editing temporary.**
3. **A warped object must still behave like an object afterward.**
4. **Free quad should not promise true exact size.**
5. **Wall-aware exact size requires enough wall-plane knowledge.**
6. **If manual edits break wall consistency, downgrade from `wallAttachedQuad` to `freeQuad`.**
7. **Do not silently snap a warped object back to rectangle when using exact size.**

---

## Recommended product language

Avoid exposing technical model names like:
- freeQuad
- wallAttachedQuad
- calibrated plane

Prefer user-facing language like:
- `Adjust corners`
- `Match wall`
- `Set exact size`
- `Exact size works after matching to wall`

---

## Final recommendation

Use this structure:

- **Top-level interaction:** `object` / `cornerEdit`
- **Geometry types:** `rect` / `freeQuad` / `wallAttachedQuad`
- **Exact size:** enabled only when geometry is meaningful (`rect` or `wallAttachedQuad`)
- **Wall helper:** integrated inside corner edit mode, not as a separate app mode

This preserves the current UX shape while allowing the system to evolve into wall-aware, trustworthy perspective behavior.
