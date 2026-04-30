## Pendura — Artwork Tray + Control Condensing Plan

### Goal

Add artwork browsing/comparison without making the placement screen feel crowded.

Core idea:
- wall stays visible
- tray appears only when needed
- selected artwork is larger
- tap artwork swaps it on wall immediately
- existing controls become more compact

---

## 1. Add static artwork data first

No backend/database yet.

Create local data file:

```ts
type Artwork = {
  id: string;
  title: string;
  artist?: string;
  imageUrl: string;
  widthCm: number;
  heightCm: number;
};
```

Start with 8–12 artworks.

---

## 2. Add “Compare artworks” trigger

Add a small secondary button:

```txt
Comparar obras
```

Do not make it equal weight to “Definir tamanho” / “Ajustar cantos”.

Preferred location:
- below canvas
- above main controls
- or as a small contextual action near artwork controls

---

## 3. Add collapsible artwork tray

Tray appears only after user taps `Comparar obras`.

Position:
- directly below wall/canvas
- above size/corner/frame controls

Behavior:
- horizontal scroll
- current artwork larger than others
- neighbors smaller
- selected artwork centered if practical
- tray stays open after selection for rapid comparison

---

## 4. Tray item behavior

On tap artwork:

```txt
1. set selectedArtworkId
2. replace artwork image on wall
3. preserve placement state
4. keep tray open
```

Selected item:
- larger thumbnail
- optional title/artist below

Other items:
- smaller thumbnails
- minimal/no text

---

## 5. Swap placement rules

When replacing artwork:

Always preserve:
- position / center
- wall attachment if present
- planeCenter if wallAttachedQuad
- frame choice if applicable

Aspect ratio rule:
- preserve center
- preserve dominant dimension
- adapt secondary dimension

For `wallAttachedQuad`:
- use new artwork dimensions if available
- recompute `widthWallUnits` / `heightWallUnits`
- reproject on wall

---

## 6. Condense existing controls

Current placement screen is crowded. Group controls by purpose.

### Geometry group
Visible primary controls:
- `Definir tamanho`
- `Ajustar cantos`

### Wall group
Collapse into one compact section:

```txt
Parede
```

Expanded actions:
- `Redefinir parede`
- `Refixar na parede`

Default: collapsed unless wall/perspective mode is active.

### Appearance group
Frame controls remain below, but can be more compact.

---

## 7. Suggested screen order

```txt
Title / instruction
Canvas
[Comparar obras button]
[Artwork tray, only when open]
Geometry controls
Collapsed Wall controls
Frame controls
Continue button
Previous step
```

---

## 8. Premium UI rules

- tray should feel like a gallery rail, not marketplace grid
- no prices, filters, search, categories yet
- selected item scale only slightly larger, not gimmicky
- soft transition when selection changes
- keep wall visually dominant

---

## 9. Out of scope

Do not build yet:
- backend database
- artist upload
- search/filter
- pricing/availability
- artist profiles
- user accounts
- permanent marketplace browsing page

---

## 10. Verification

1. User can open/close artwork tray
2. Wall/canvas remains visible while tray is open
3. Tapping artwork swaps it immediately
4. Placement is preserved after swap
5. Selected tray item becomes visually active/larger
6. Tray remains open for multiple comparisons
7. Controls feel less crowded after wall actions are collapsed
