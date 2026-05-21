# Hot AI — Art Assets Requirements

This document is the contract between engineering and design. Every asset listed here is
*referenced by code*; missing assets degrade gracefully (we ship inline SVG fallbacks for
the critical path) but the site is meaningfully less polished without them.

> **Conventions**
> - All raster assets ship in 1× and 2× variants unless noted.
> - Drop files into `apps/web/public/` at the paths shown.
> - Prefer SVG for anything iconographic; PNG only when raster effects (gradients, glow, photo) demand it.
> - Color palette pinned in `tailwind.config.js` — designers should treat it as source-of-truth.

---

## 1 · Brand Palette (for reference)

| Token         | Hex       | Use                                    |
| ------------- | --------- | -------------------------------------- |
| `ember-500`   | `#f97316` | Primary accent, "🔥" associations      |
| `ember-600`   | `#ea580c` | Hover, deeper CTAs                     |
| `ember-700`   | `#c2410c` | Text on light bg, "deep ember"         |
| `ember-200`   | `#fed7aa` | Soft chip bg                           |
| `red-500`     | `#ef4444` | Middle stop of the "fire" gradient     |
| `fuchsia-500` | `#d946ef` | End stop of the "fire" gradient        |
| `ink-950`     | `#020617` | Dark-mode bg                           |
| `ink-100`     | `#f1f5f9` | Light-mode text on dark cards          |

**The "fire" gradient** (used in logo, hot badges, CTAs):
`linear-gradient(135deg, #f97316 0%, #ef4444 50%, #d946ef 100%)`

---

## 2 · Logo & favicons  ★ Required

| File                          | Size               | Format | Code references                                |
| ----------------------------- | ------------------ | ------ | ---------------------------------------------- |
| `public/logo.svg`             | 64×64, viewBox 0 0 64 64 | SVG  | `components/Header.tsx`, OG image fallback     |
| `public/icon.svg`             | 32×32 viewBox      | SVG    | `app/layout.tsx` (`icons.icon`)                |
| `public/favicon.ico`          | 16+32+48 multi-res | ICO    | Browser shortcut                               |
| `public/apple-touch-icon.png` | 180×180            | PNG    | iOS home-screen                                |
| `public/icon-192.png`         | 192×192            | PNG    | PWA-style installs                             |
| `public/icon-512.png`         | 512×512            | PNG    | PWA / share preview                            |

**Design brief.** A stylised flame inside a rounded square (corner radius ≈ 22% of side).
The flame should read as both "🔥 hot" and "data point spike" — angular, not cartoonish.
Use the fire gradient for the square; the flame is white with one inner highlight curve
suggesting a stylised "AI" silhouette. Avoid filling the entire square with detail — leave
breathing room so the icon is recognisable at 16×16. Inline SVG fallbacks live at
`public/logo.svg` and `public/icon.svg` and should be REPLACED, not just covered, by the
final design.

---

## 3 · Open Graph / Twitter card  ★ Required

| File              | Size      | Format | Code references                             |
| ----------------- | --------- | ------ | ------------------------------------------- |
| `public/og.png`   | 1200×630  | PNG    | `app/layout.tsx` (`openGraph.images`, `twitter.images`) |
| `public/og-zh.png`| 1200×630  | PNG    | Optional Chinese variant for future zh route |

**Design brief.** Dark background (`#020617`) with a generous ember-gradient glow in the
top-left. Centred wordmark "Hot AI" in 96–120pt extrabold; tagline "The pulse of AI,
every hour." in 32–40pt below. Bottom-left: rolling chip strip showing source names
(OpenAI, Anthropic, arXiv, HuggingFace, 机器之心, 量子位, GitHub) at 50% opacity to
suggest aggregation. Bottom-right: small "🔥 hourly refresh" badge.

Keep the safe area ≥ 80px from edges (LinkedIn / Slack crop). Export at 1× only.

---

## 4 · Hero illustration  ◇ Nice-to-have

| File                       | Size      | Format | Code references                                       |
| -------------------------- | --------- | ------ | ----------------------------------------------------- |
| `public/hero-spark.svg`    | ~480×360  | SVG    | Could be slotted into `components/Hero.tsx` (right side, replacing the blob) |

**Design brief.** Abstract illustration of "signal becoming heat": a sparse left-side dot
field (data points) condensing into a bright flame on the right. Strokes only, 1–1.5px,
in `ember-500 → fuchsia-500` gradient. Must work on both light and dark bg (no fills
that depend on bg color). Optional subtle CSS animation on the dots (pulse).

If shipped, update `components/Hero.tsx` to import and place it inside the hero card,
positioned absolute top-right under the existing blob, max-width 40% on `sm:` and above,
hidden below `sm`.

---

## 5 · Source favicons / fallback  ◇ Nice-to-have

The article card currently fetches favicons via `https://www.google.com/s2/favicons` —
this is fast but uses a third-party endpoint and can be blocked in some regions.

| File                          | Size  | Format | Use                                                |
| ----------------------------- | ----- | ------ | -------------------------------------------------- |
| `public/source-fallback.svg`  | 16×16 | SVG    | Shown when Google's favicon endpoint fails / blocked |
| `public/sources/{slug}.svg`   | 16×16 | SVG    | Optional: ship our own icons for top-20 sources to skip the network round-trip entirely |

**Design brief.** Fallback should be a neutral monochrome glyph (a small "○" with the
first letter of the source name, generated server-side from the source name) — see
implementation note in `components/ArticleCard.tsx`. Per-source icons should be the
host's actual logo, hand-traced to 16×16 grid, monochrome where possible to survive both
light and dark themes.

---

## 6 · Category icons  ◇ Nice-to-have

The four category chips (`research`, `industry`, `opensource`, `media`) are currently
prefixed with `#`. Replacing with bespoke icons would lift the navigation.

| File                                 | Size   | Format | Reference                            |
| ------------------------------------ | ------ | ------ | ------------------------------------ |
| `public/categories/research.svg`     | 20×20  | SVG    | `components/CategoryNav.tsx`         |
| `public/categories/industry.svg`     | 20×20  | SVG    | (would render before the label)      |
| `public/categories/opensource.svg`   | 20×20  | SVG    |                                      |
| `public/categories/media.svg`        | 20×20  | SVG    |                                      |

**Design brief.** Single-stroke line icons (1.5px), 20×20 grid. Suggestions:
- research — a stylised "beaker" or "paper with axis lines"
- industry — a "circuit / chip" outline
- opensource — a "fork in the road" or "branched node"
- media — a "broadcasting tower" or "speech bubble with a dot"

Match Heroicons' visual weight (we don't import Heroicons — keep it custom).

---

## 7 · Sentiment glyphs  ◇ Nice-to-have

`ArticleCard` shows a coloured chip when AI assigns a sentiment label (`release`,
`research`, `opinion`, `rumor`, `tutorial`, `other`). Currently text-only; small leading
glyphs would improve scannability.

| File                                | Size   | Format | Each label                                 |
| ----------------------------------- | ------ | ------ | ------------------------------------------ |
| `public/sentiment/release.svg`      | 14×14  | SVG    | Rocket / package                           |
| `public/sentiment/research.svg`     | 14×14  | SVG    | Telescope / lens                           |
| `public/sentiment/opinion.svg`      | 14×14  | SVG    | Speech bubble                              |
| `public/sentiment/rumor.svg`        | 14×14  | SVG    | Question mark / whisper                    |
| `public/sentiment/tutorial.svg`     | 14×14  | SVG    | Book / play                                |
| `public/sentiment/other.svg`        | 14×14  | SVG    | Dot                                        |

Use `currentColor` so the chip's text colour drives the glyph.

---

## 8 · 404 illustration  ◇ Nice-to-have

| File                       | Size      | Format | Reference                |
| -------------------------- | --------- | ------ | ------------------------ |
| `public/404-flameout.svg`  | ~320×240  | SVG    | `app/not-found.tsx`      |

**Design brief.** A wisp of smoke trailing off a tiny extinguished flame. Pure line work,
should feel quiet rather than alarming. Replace the current animated gradient square
above the "404" heading.

---

## 9 · Loading skeletons  — already in CSS

No assets needed; `globals.css` defines `.skeleton` with a shimmer animation. Designers
should be aware that all card placeholders use this class so the cadence/contrast can be
tuned in CSS without re-exporting.

---

## 10 · Out-of-scope (for now)

- Photographic / hero photography — the design intentionally avoids stock imagery.
- Per-article cover images — we don't extract OG images from source articles yet.
- Animated/Lottie assets — keep it CSS-only for performance and zero JS deps.

---

## Delivery checklist

- [ ] `logo.svg` + raster icon family
- [ ] `og.png` (1200×630)
- [ ] `apple-touch-icon.png` (180×180)
- [ ] `favicon.ico` (multi-res)
- [ ] Source fallback glyph
- [ ] At least one hero illustration variant
- [ ] Category icon set (4)
- [ ] Sentiment glyph set (6)
- [ ] 404 illustration
