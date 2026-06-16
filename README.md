# Pendura

**Visualize artwork on your wall before you hang it.**

Pendura lets you photograph your wall, choose any painting, and see exactly how it would look — with accurate perspective, real-world sizing, and optional frame styles. [Try it at pendura.me](https://pendura.me)

---

## Features

### 5-step workflow
1. **Upload your wall** — photograph any wall, any room
2. **Choose artwork** — upload your own or pick from the built-in catalog
3. **Crop & straighten** — trim borders, or use 4-corner de-warp if the photo was taken at an angle
4. **Place & calibrate** — drag, resize, rotate; optionally calibrate real-world dimensions and define the wall plane for perspective-accurate placement
5. **Render & download** — server-side composited PNG, ready to share

### Placement engine
- **Free quad** — drag each of the 4 corners independently to match any perspective
- **Wall-attached mode** — define the wall plane once; artwork stays locked to it as you adjust corners, re-projecting automatically
- **Real-world calibration** — tap two reference points, enter the distance (cm or in), enter painting dimensions → the app scales the artwork to the correct pixel size
- **Frame styles** — None, White (beveled), Black, Wood (gradient grain), rendered on canvas

### Image processing
- Client-side compression (max 2048 px) to keep uploads fast
- Perspective crop/de-warp using bilinear interpolation
- Server-side final render via [Sharp](https://sharp.pixelplumbing.com/) — handles EXIF rotation, composites wall + shadow + artwork into a full-resolution PNG
- Drop shadow generated from the warp mask

### Artwork browsing
- Scrollable tray with your uploaded painting alongside catalog artworks
- Swap artworks at any time while keeping your placement intact

### Internationalization
- English and Portuguese (BR) — add more locales by dropping a JSON file in `/messages`

---

## Tech stack

| Layer | Library |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Canvas / interaction | [Konva](https://konvajs.org/) + react-konva |
| Perspective math | [perspective-transform](https://github.com/jlouthan/perspective-transform) |
| Server image processing | [Sharp](https://sharp.pixelplumbing.com/) |
| i18n | [next-intl](https://next-intl-docs.vercel.app/) |
| Analytics | Vercel Analytics |

---

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The `/api/render` route runs server-side and requires Node.js (Sharp is a native module — no extra setup needed beyond `npm install`).

---

## Project structure

```
app/
  [locale]/         # Locale-prefixed routes (en, pt)
    page.tsx        # Main step-based UI
  api/render/       # Server-side composite endpoint
components/
  steps/            # One component per workflow step
  editor/           # Konva canvas editors (crop, placement)
  ui/               # Shared UI components
context/            # ProjectContext — global state
lib/                # Image utils, perspective warp, frame rendering
messages/           # i18n JSON (en.json, pt.json)
types/              # TypeScript interfaces
```

---

## License

MIT
