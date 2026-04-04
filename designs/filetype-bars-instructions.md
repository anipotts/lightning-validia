# Flagged Content Bars — Implementation Instructions for Claude

> **Wireframe reference:** `docs/filetype-bars-wireframe.svg`
> **Location in dashboard:** Bottom-right corner of the main ShieldClaw UI
> **Component name:** `<FlaggedContentBars />`

## What This Is

Three horizontal bars representing scanned file categories. Each bar has:

1. A **3D asset** on the left that represents the file type (rotates on hover)
2. A **severity color fill** that sweeps left-to-right on hover
3. **Stats** showing safe/suspicious/flagged counts
4. A **left accent strip** colored by the worst severity in that category

The three bars, top to bottom:

| Bar | File Types | 3D Asset |
|-----|-----------|----------|
| **Documents** | .pdf .txt .md .json .yaml .csv | Isometric stack of 3 pages with text lines and corner fold |
| **Images** | .png .jpg .jpeg .svg .webp .gif | Isometric polaroid/frame stack with landscape thumbnail |
| **Video** | .mp4 .mov .webm .avi | Isometric film strip with clapperboard top and play button |

---

## Tech Stack (Fastest Path)

These libraries were chosen because they're the fastest to get the exact effect working in a React/Next.js project at a hackathon. No overkill — every pick earns its weight.

### Required

| Library | Why | Install |
|---------|-----|---------|
| **React Three Fiber (R3F)** + **Drei** | The 3D assets. R3F is React's Three.js binding. Drei gives you `<Float>`, `<RoundedBox>`, `<Text3D>`, and `<MeshDistortMaterial>` out of the box. No raw GL code needed. | `npm i @react-three/fiber @react-three/drei three` |
| **Motion** (formerly Framer Motion) | The hover fill animation and the rotation trigger. `whileHover`, `AnimatePresence`, spring physics. Handles the bar color sweep and triggers the 3D rotation. | `npm i motion` |
| **GSAP** + **ScrollTrigger** (optional) | Only if you want the bars to animate in on scroll. Timeline-based, reliable. But Motion alone can handle hover — GSAP is bonus polish. | `npm i gsap` |

### Optional Polish

| Library | What For |
|---------|----------|
| **Lenis** | Smooth scroll if the dashboard scrolls. Pairs with GSAP ScrollTrigger. `npm i lenis` |
| **SplitType** | If you want the stats text to stagger-reveal on hover. `npm i split-type` |

### NOT Needed

- **OGL / Lamina / Theatre.js** — overkill for 3 simple rotating assets
- **Spline** — requires their editor, too slow for hackathon
- **tsParticles / p5.js** — no particle effects in this component
- **Rive / Lottie** — the 3D assets are simple enough to build inline

---

## Component Architecture

```
<FlaggedContentBars>
  ├── <ContentBar type="documents" severity="safe" files={docFiles}>
  │     ├── <AssetCanvas3D model="document-stack" />    ← R3F Canvas
  │     ├── <HoverFill color={severityColor} />         ← Motion div
  │     └── <BarStats safe={18} sus={4} flagged={2} />
  ├── <ContentBar type="images" severity="suspicious" files={imgFiles}>
  │     ├── <AssetCanvas3D model="polaroid-stack" />
  │     ├── <HoverFill color={severityColor} />
  │     └── <BarStats safe={8} sus={3} flagged={1} />
  └── <ContentBar type="video" severity="attack" files={vidFiles}>
        ├── <AssetCanvas3D model="film-strip" />
        ├── <HoverFill color={severityColor} />
        └── <BarStats safe={3} sus={1} flagged={2} />
```

---

## Color System

Strictly beige/gray/black. No blue, no purple, no neon.

```ts
const colors = {
  bg:         '#0a0a0a',
  barBg:      '#1a1916',
  cardBg:     '#141210',
  stroke:     '#3d3a34',
  textPrimary:'#e8e0d4',
  textDim:    '#6b6560',
  textMuted:  '#8a8478',
  textGhost:  '#4a4640',

  // Severity (these are the ONLY accent colors allowed)
  safe:       '#a3b18a',  // muted olive green
  suspicious: '#c9a96e',  // warm amber
  attack:     '#b85c4a',  // terracotta
  blocked:    '#8a3a2e',  // dark red
}
```

---

## Interaction Spec

### Hover Fill Animation

When the user hovers a bar, the bar's background fills from left to right with the severity color at ~20% opacity.

```tsx
// Using Motion (Framer Motion)
import { motion } from 'motion/react'

function HoverFill({ color, isHovered }: { color: string; isHovered: boolean }) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(90deg, ${color}40, ${color}00)`,
        pointerEvents: 'none',
      }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: isHovered ? 1 : 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ transformOrigin: 'left center' }}
    />
  )
}
```

### 3D Asset Rotation

Each bar has a small R3F `<Canvas>` (about 120x100px) containing the 3D asset. On hover, the asset does a full Y-axis rotation with spring physics.

```tsx
import { Canvas } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import { useSpring, animated } from '@react-spring/three'

function RotatingAsset({ isHovered, children }) {
  const { rotation } = useSpring({
    rotation: isHovered ? [0, Math.PI * 2, 0] : [0, 0, 0],
    config: { mass: 1, tension: 120, friction: 14 },
  })

  return (
    <animated.group rotation={rotation}>
      <Float speed={2} rotationIntensity={0.1} floatIntensity={0.3}>
        {children}
      </Float>
    </animated.group>
  )
}
```

### Putting It Together (ContentBar)

```tsx
import { useState } from 'react'
import { motion } from 'motion/react'
import { Canvas } from '@react-three/fiber'

function ContentBar({ type, severity, stats }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        height: 120,
        background: '#1a1916',
        border: '1px solid #3d3a34',
        borderRadius: 2,          // sharp, minimal rounding
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {/* Left severity strip */}
      <div style={{
        width: 4,
        height: '100%',
        background: colors[severity],
        flexShrink: 0,
      }} />

      {/* Hover fill overlay */}
      <HoverFill color={colors[severity]} isHovered={hovered} />

      {/* 3D Asset */}
      <div style={{ width: 120, height: 100, flexShrink: 0 }}>
        <Canvas camera={{ position: [0, 0, 4], fov: 40 }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[2, 2, 2]} intensity={0.6} />
          <RotatingAsset isHovered={hovered}>
            {type === 'documents' && <DocumentStack />}
            {type === 'images' && <PolaroidStack />}
            {type === 'video' && <FilmStrip />}
          </RotatingAsset>
        </Canvas>
      </div>

      {/* Stats */}
      <BarStats {...stats} />
    </motion.div>
  )
}
```

---

## 3D Asset Geometry (Hacky, Fast)

These don't need to be beautiful — they need to read clearly at 120x100px and look cool when they spin. Build them with Drei primitives, not imported .glb models.

### Document Stack

Three stacked `<RoundedBox>` (or plain `<mesh><boxGeometry>`) offset by ~0.15 on Z, each slightly different shade. Front face gets thin white line children to simulate text. Top-right corner: a small triangular mesh for the page fold.

```tsx
function DocumentStack() {
  return (
    <group>
      {/* Back page */}
      <mesh position={[0.15, 0.1, -0.3]} rotation={[0, -0.05, 0]}>
        <boxGeometry args={[1.2, 1.6, 0.02]} />
        <meshStandardMaterial color="#2a2824" />
      </mesh>
      {/* Middle page */}
      <mesh position={[0.08, 0.05, -0.15]} rotation={[0, -0.03, 0]}>
        <boxGeometry args={[1.2, 1.6, 0.02]} />
        <meshStandardMaterial color="#1e1d1a" />
      </mesh>
      {/* Front page */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 1.6, 0.02]} />
        <meshStandardMaterial color="#141210" />
      </mesh>
    </group>
  )
}
```

### Polaroid Stack

Same stacking idea but slightly wider aspect ratio. Front "polaroid" has a larger bottom border (like a real polaroid) and the image area is a slightly lighter plane. Add a tiny sphere for the "sun" in the landscape.

```tsx
function PolaroidStack() {
  return (
    <group>
      {/* Frame */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.3, 1.6, 0.02]} />
        <meshStandardMaterial color="#141210" />
      </mesh>
      {/* Image area */}
      <mesh position={[0, 0.15, 0.02]}>
        <boxGeometry args={[1.1, 1.0, 0.01]} />
        <meshStandardMaterial color="#1a1916" />
      </mesh>
      {/* Mountain triangle */}
      {/* Use a simple cone or custom BufferGeometry */}
    </group>
  )
}
```

### Film Strip

A wider box with small square cutouts (sprocket holes) along top and bottom edges. Center area has a slightly lighter plane. Add a flat triangle for the play button with the `attack` color. Clapperboard is a small angled box on top.

```tsx
function FilmStrip() {
  return (
    <group>
      {/* Main strip */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.8, 1.2, 0.02]} />
        <meshStandardMaterial color="#141210" />
      </mesh>
      {/* Play button (triangle - use a cone rotated 90deg on Z) */}
      <mesh position={[0.1, 0, 0.02]} rotation={[0, 0, -Math.PI/2]}>
        <coneGeometry args={[0.25, 0.4, 3]} />
        <meshStandardMaterial color="#b85c4a" transparent opacity={0.6} />
      </mesh>
      {/* Clapperboard top */}
      <mesh position={[0, 0.7, 0]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[1.8, 0.3, 0.02]} />
        <meshStandardMaterial color="#1e1d1a" />
      </mesh>
    </group>
  )
}
```

---

## Severity-to-Color Mapping

The bar's left strip and hover fill color are determined by the **worst** severity in that file category:

```ts
function worstSeverity(files: FileResult[]): SeverityLevel {
  if (files.some(f => f.score >= 0.85)) return 'blocked'
  if (files.some(f => f.score >= 0.6))  return 'attack'
  if (files.some(f => f.score >= 0.3))  return 'suspicious'
  return 'safe'
}
```

---

## Data Shape

```ts
interface FileResult {
  name: string          // "config.yaml"
  type: 'document' | 'image' | 'video'
  extension: string     // ".yaml"
  score: number         // 0.0 - 1.0
  category: string      // "safety_boundary_probing" | "none"
  severity: 'safe' | 'suspicious' | 'attack' | 'blocked'
}

interface BarStats {
  total: number
  safe: number
  suspicious: number
  flagged: number
}
```

---

## Style Rules

1. **No rounded corners.** `border-radius: 2px` max everywhere. The wireframe uses `rx="2"` — match that.
2. **10px edge gradients.** The parent container of these bars should have a 10px inset shadow/gradient on all four edges fading from `#0a0a0a`. CSS: `box-shadow: inset 0 0 10px 5px #0a0a0a;` or use pseudo-elements with linear gradients.
3. **Monospace font everywhere.** Use `'SF Mono', 'Fira Code', 'Courier New', monospace`.
4. **No emoji.** The trust badges in these bars are text-only: `[safe]`, `[sus]`, `[flagged]`, `[blocked]`.
5. **Spacing.** 12px gap between bars. 16px internal padding.
6. **The bars are ~120px tall, full width of their container.**

---

## GSAP Alternative (If Motion Feels Wrong)

If you prefer GSAP over Motion for the hover fill, here's the equivalent:

```ts
import gsap from 'gsap'

// On mouseenter:
gsap.to(fillRef.current, {
  scaleX: 1,
  duration: 0.4,
  ease: 'power2.out',
  transformOrigin: 'left center',
})

// On mouseleave:
gsap.to(fillRef.current, {
  scaleX: 0,
  duration: 0.3,
  ease: 'power2.in',
  transformOrigin: 'left center',
})
```

For the 3D rotation with GSAP instead of react-spring:

```ts
gsap.to(meshRef.current.rotation, {
  y: Math.PI * 2,
  duration: 0.8,
  ease: 'power2.inOut',
})
```

---

## Integration with Dashboard

This component slots into the bottom-right of the main ShieldClaw layout. It receives data from the same WebSocket feed as the rest of the dashboard. When a new file scan result comes in:

1. Update the relevant bar's stats
2. If the new file's severity is worse than the current bar severity, the accent strip color changes
3. Optionally flash the bar briefly (Motion `animate` pulse)

```tsx
// In the main dashboard layout:
<div style={{ gridArea: 'bottom-right' }}>
  <FlaggedContentBars files={scannedFiles} />
</div>
```

---

## Summary: What to Install

```bash
npm i @react-three/fiber @react-three/drei three @react-spring/three motion
```

Optional:
```bash
npm i gsap lenis split-type
```

That's it. Build the `<ContentBar>` component, wire in the 3D assets, hook up hover state. The wireframe SVG shows exactly what it should look like at rest and the annotations show the hover behavior.
