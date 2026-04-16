# Pendura Placement System — Current State, Direction, and Implementation Path

# Current state

The current placement flow has two clearly different editing behaviors:

## Rectangle placement
The painting behaves as a rectangular object:
- move  
- resize  
- rotate  
- frame selection available  
- exact size available  

This is simple and intuitive.

## Perspective adjustment
After entering adjust corners:
- painting becomes a 4-corner quad  
- user manually drags corners  
- perspective warp now correctly maps full painting into quad  
- but interaction becomes harder because:
  - moving requires dragging all 4 corners  
  - frame controls disappear  
  - exact size becomes unavailable  
  - editing feels like entering a different subsystem  

So today perspective mode works mathematically, but UX still feels fragmented.

# Core product direction

The painting should always feel like **one object**, even when perspective is active.

Perspective should not create a new editing world.

It should simply mean:

> the object now has perspective geometry.

That means:
- same painting  
- same editing continuity  
- same available refinement logic  

# Core mental model

The cleanest model is not steps, but interaction layers.

These layers are **not sequential**.

Users can move between them freely.

# Layer 1 — Where is it?

Placement position:
- move painting  
- drag object  
- center placement  

This should always remain available.

Even in perspective mode.

# Layer 2 — At what angle?

Geometry / perspective:
- rectangle  
- manual corner adjustment  
- wall angle helper  

Important:
Wall helper is not a separate mode.

It is simply a helper to initialize perspective correctly.

Flow:
- user marks wall reference corners  
- system derives perspective quad  
- painting enters normal perspective editing  

So:

wall helper = perspective initializer

not a separate placement mode.

# Layer 3 — How big is it?

Scale realism:
- exact size  
- 2-point calibration  

This is independent from geometry.

Meaning:
size tools should eventually work both in:
- rectangle mode  
- perspective mode  

Because size and angle are orthogonal.

# Layer 4 — What finish?

Visual styling:
- frame  
- future shadow  
- future styling refinements  

This layer should always remain logically independent from geometry.

# Important architectural principle

These layers are not screens.

They are editable dimensions of the same object.

User should be able to:

- move  
- angle  
- move again  
- resize  
- frame  
- refine angle again  

That is natural.

# Desired long-term UX

One placement system.

Not separate placement worlds.

The painting remains one editable object.

# Long-term interaction model

## Rectangle state
Object behaves normally:
- move  
- resize  
- rotate  

## Perspective state
Object becomes quad:
- move whole quad  
- scale whole quad  
- rotate whole quad  
- refine corners individually  

The key improvement:

Perspective should not force corner editing for every adjustment.

# Critical next UX improvement

Once perspective exists, user must be able to move the whole quad.

Currently:
to reposition, user must drag 4 corners.

That is poor UX.

Correct behavior:

## drag inside quad or center handle = move full quad

This means:
all 4 corners move together.

Perspective preserved.

This is simple technically:
add delta to all corners.

This should be the next major perspective improvement.

# Perspective handle design (recommended)

## 4 corner handles
Used only for perspective refinement.

## 1 center handle (or inside drag)
Used for moving full quad.

This avoids clutter while preserving power.

Best rule:

- drag corner = geometry edit  
- drag inside object = move object  

This feels natural.

# Angle family (long-term UI)

Angle should contain:

## Rectangle  
Reset to rectangle geometry

## Adjust corners  
Manual perspective editing

## Align with wall  
Wall angle helper

These are not global modes.

They are angle methods.

Because all answer:

> how should angle be handled?

# Size family

Size remains separate:
- exact size  
- calibration  

Because size is independent from angle.

# Frame family

Frame remains styling:
- none  
- white  
- black  
- wood  

# Recommended mobile UI structure

## Canvas = direct editing

Painting manipulated directly.

## Bottom strip = edit dimension selector

Only 3 primary controls:

## Angle | Size | Frame

Then:
## Continue

Why:
- move happens directly on canvas  
- angle, size, frame open focused controls  

This keeps interface premium and light.

# Immediate practical roadmap

You should not try to unify everything now.

Do it progressively.

# Phase 1 — Stabilize current perspective UX

Immediate next steps:

## Add move-whole-quad in perspective mode
Most important next improvement.

User can drag inside quad or center handle.

This removes biggest friction immediately.

## Keep current two-screen architecture
Rectangle and perspective can remain separate for now.

This is acceptable short term.

## Keep frame chosen before perspective
No need yet to fully unify frame editing across both screens.

Current architecture acceptable.

# Phase 2 — Make perspective mode feel less isolated

Then:

## Preserve more controls while in perspective
At minimum:
- frame choice should feel persistent  
- exact size logic should remain conceptually linked  

Even if still separate screens.

Goal:
Perspective no longer feels like leaving placement.

# Phase 3 — Extend size into perspective mode

Then implement:

## exact size scales quad around center

Meaning:
quad shape preserved  
all 4 corners scaled proportionally

This is very doable.

This is when size becomes fully orthogonal.

# Phase 4 — Add wall angle helper

Flow:

## user marks wall reference corners  
## system derives perspective quad  
## enters normal perspective mode  

After that:
same move / size / frame logic applies.

Very important:
wall helper ends by creating a normal editable quad.

Not a special persistent state.

# Phase 5 — Long-term UI unification

Eventually:
rectangle + perspective become one editing surface.

Then:
Angle / Size / Frame become true bottom-strip tools.

At that point separate screens likely disappear.

But not necessary yet.

# Why this order is best

Because each phase builds naturally:

move quad first → biggest UX gain

then size quad

then wall helper

then full UI unification

This avoids premature complexity.

# Short version of next step

If only one next improvement:

## make perspective quad movable as one object

That unlocks everything else naturally.

# Product rule to keep in mind

Perspective defines shape.

It should never destroy object manipulability.
