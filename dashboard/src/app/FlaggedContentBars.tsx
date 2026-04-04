"use client";

import { useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { useSpring, animated } from "@react-spring/three";
import { motion } from "motion/react";

// ─── Types ──────────────────────────────────────────────

type SeverityLevel = "safe" | "suspicious" | "attack" | "blocked";

interface FileResult {
  name: string;
  type: "document" | "image" | "video";
  extension: string;
  score: number;
  category: string;
  severity: SeverityLevel;
}

interface BarStatsData {
  total: number;
  safe: number;
  suspicious: number;
  flagged: number;
}

// ─── Colors ─────────────────────────────────────────────

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  safe: "#a3b18a",
  suspicious: "#c9a96e",
  attack: "#b85c4a",
  blocked: "#8a3a2e",
};

// ─── Mock Data ──────────────────────────────────────────

const MOCK_FILES: FileResult[] = [
  { name: "config.yaml", type: "document", extension: ".yaml", score: 0.91, category: "safety_boundary_probing", severity: "blocked" },
  { name: "readme.md", type: "document", extension: ".md", score: 0.03, category: "none", severity: "safe" },
  { name: "batch.json", type: "document", extension: ".json", score: 0.52, category: "template_reuse", severity: "suspicious" },
  { name: "utils.py", type: "document", extension: ".py", score: 0.01, category: "none", severity: "safe" },
  { name: "eval_suite.py", type: "document", extension: ".py", score: 0.48, category: "reward_grading", severity: "suspicious" },
  { name: "extract.py", type: "document", extension: ".py", score: 0.74, category: "CoT_elicitation", severity: "attack" },
  { name: "schema.py", type: "document", extension: ".py", score: 0.02, category: "none", severity: "safe" },
  { name: "routes.json", type: "document", extension: ".json", score: 0.05, category: "none", severity: "safe" },
  { name: "prompts.txt", type: "document", extension: ".txt", score: 0.35, category: "cot_elicitation", severity: "suspicious" },
  { name: "data.csv", type: "document", extension: ".csv", score: 0.04, category: "none", severity: "safe" },
  { name: "session.log", type: "document", extension: ".txt", score: 0.08, category: "none", severity: "safe" },
  { name: "output.pdf", type: "document", extension: ".pdf", score: 0.02, category: "none", severity: "safe" },
  { name: "notes.md", type: "document", extension: ".md", score: 0.01, category: "none", severity: "safe" },
  { name: "plan.txt", type: "document", extension: ".txt", score: 0.06, category: "none", severity: "safe" },
  { name: "mapping.yaml", type: "document", extension: ".yaml", score: 0.03, category: "none", severity: "safe" },
  { name: "test_cases.json", type: "document", extension: ".json", score: 0.12, category: "none", severity: "safe" },
  { name: "report.pdf", type: "document", extension: ".pdf", score: 0.04, category: "none", severity: "safe" },
  { name: "seeds.csv", type: "document", extension: ".csv", score: 0.07, category: "none", severity: "safe" },
  { name: "taxonomy.md", type: "document", extension: ".md", score: 0.62, category: "safety_boundary_probing", severity: "attack" },
  { name: "flow.json", type: "document", extension: ".json", score: 0.09, category: "none", severity: "safe" },
  { name: "instructions.txt", type: "document", extension: ".txt", score: 0.41, category: "capability_mapping", severity: "suspicious" },
  { name: "manifest.yaml", type: "document", extension: ".yaml", score: 0.03, category: "none", severity: "safe" },
  { name: "pipeline.json", type: "document", extension: ".json", score: 0.11, category: "none", severity: "safe" },
  { name: "results.csv", type: "document", extension: ".csv", score: 0.05, category: "none", severity: "safe" },
  { name: "logo.png", type: "image", extension: ".png", score: 0.02, category: "none", severity: "safe" },
  { name: "screenshot.jpg", type: "image", extension: ".jpg", score: 0.04, category: "none", severity: "safe" },
  { name: "wireframe.svg", type: "image", extension: ".svg", score: 0.38, category: "capability_mapping", severity: "suspicious" },
  { name: "diagram.png", type: "image", extension: ".png", score: 0.01, category: "none", severity: "safe" },
  { name: "banner.webp", type: "image", extension: ".webp", score: 0.03, category: "none", severity: "safe" },
  { name: "photo.jpg", type: "image", extension: ".jpg", score: 0.05, category: "none", severity: "safe" },
  { name: "icon.svg", type: "image", extension: ".svg", score: 0.02, category: "none", severity: "safe" },
  { name: "avatar.png", type: "image", extension: ".png", score: 0.04, category: "none", severity: "safe" },
  { name: "chart.png", type: "image", extension: ".png", score: 0.42, category: "reward_model_grading", severity: "suspicious" },
  { name: "embed.jpg", type: "image", extension: ".jpg", score: 0.06, category: "none", severity: "safe" },
  { name: "thumb.webp", type: "image", extension: ".webp", score: 0.55, category: "censorship_rewrite", severity: "suspicious" },
  { name: "preview.gif", type: "image", extension: ".gif", score: 0.72, category: "tool_use_extraction", severity: "attack" },
  { name: "demo.mp4", type: "video", extension: ".mp4", score: 0.04, category: "none", severity: "safe" },
  { name: "recording.mov", type: "video", extension: ".mov", score: 0.68, category: "capability_mapping", severity: "attack" },
  { name: "tutorial.webm", type: "video", extension: ".webm", score: 0.03, category: "none", severity: "safe" },
  { name: "clip.mp4", type: "video", extension: ".mp4", score: 0.45, category: "cot_elicitation", severity: "suspicious" },
  { name: "screen.avi", type: "video", extension: ".avi", score: 0.02, category: "none", severity: "safe" },
  { name: "intro.mp4", type: "video", extension: ".mp4", score: 0.88, category: "safety_boundary_probing", severity: "blocked" },
];

// ─── Helpers ────────────────────────────────────────────

function worstSeverity(files: FileResult[]): SeverityLevel {
  if (files.some((f) => f.score >= 0.85)) return "blocked";
  if (files.some((f) => f.score >= 0.6)) return "attack";
  if (files.some((f) => f.score >= 0.3)) return "suspicious";
  return "safe";
}

function computeStats(files: FileResult[]): BarStatsData {
  return {
    total: files.length,
    safe: files.filter((f) => f.severity === "safe").length,
    suspicious: files.filter((f) => f.severity === "suspicious").length,
    flagged: files.filter((f) => f.severity === "attack" || f.severity === "blocked").length,
  };
}

// ─── File type detection ────────────────────────────────

const DOC_EXTS = new Set([".pdf", ".txt", ".md", ".json", ".yaml", ".csv", ".py", ".js", ".ts", ".log", ".xml", ".toml"]);
const IMG_EXTS = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".bmp", ".ico"]);
const VID_EXTS = new Set([".mp4", ".mov", ".webm", ".avi", ".mkv", ".flv"]);

export function getFileType(filename: string): "document" | "image" | "video" {
  const ext = "." + filename.split(".").pop()?.toLowerCase();
  if (IMG_EXTS.has(ext)) return "image";
  if (VID_EXTS.has(ext)) return "video";
  return "document";
}

// ─── 3D Assets ──────────────────────────────────────────

function RotatingAsset({ isHovered, children }: { isHovered: boolean; children: React.ReactNode }) {
  const { rotation } = useSpring({
    rotation: isHovered ? [0, Math.PI * 2, 0] : [0, 0, 0],
    config: { mass: 1, tension: 120, friction: 14 },
  });

  return (
    <animated.group rotation={rotation as unknown as [number, number, number]}>
      <Float speed={2} rotationIntensity={0.1} floatIntensity={0.3}>
        {children}
      </Float>
    </animated.group>
  );
}

function DocumentStack() {
  return (
    <group scale={0.85}>
      {/* Back page */}
      <mesh position={[0.15, 0.1, -0.3]} rotation={[0, -0.05, 0]}>
        <boxGeometry args={[1.2, 1.6, 0.02]} />
        <meshStandardMaterial color="#4a4640" />
      </mesh>
      {/* Middle page */}
      <mesh position={[0.08, 0.05, -0.15]} rotation={[0, -0.03, 0]}>
        <boxGeometry args={[1.2, 1.6, 0.02]} />
        <meshStandardMaterial color="#3d3a34" />
      </mesh>
      {/* Front page */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 1.6, 0.02]} />
        <meshStandardMaterial color="#2a2824" />
      </mesh>
      {/* Text lines on front */}
      <mesh position={[-0.1, 0.4, 0.02]}>
        <boxGeometry args={[0.7, 0.05, 0.005]} />
        <meshStandardMaterial color="#8a8478" />
      </mesh>
      <mesh position={[-0.15, 0.25, 0.02]}>
        <boxGeometry args={[0.6, 0.04, 0.005]} />
        <meshStandardMaterial color="#6b6560" />
      </mesh>
      <mesh position={[-0.05, 0.1, 0.02]}>
        <boxGeometry args={[0.8, 0.04, 0.005]} />
        <meshStandardMaterial color="#6b6560" />
      </mesh>
      <mesh position={[-0.2, -0.05, 0.02]}>
        <boxGeometry args={[0.5, 0.04, 0.005]} />
        <meshStandardMaterial color="#6b6560" />
      </mesh>
      {/* Corner fold */}
      <mesh position={[0.42, 0.62, 0.02]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.3, 0.3, 0.015]} />
        <meshStandardMaterial color="#3d3a34" />
      </mesh>
    </group>
  );
}

function PolaroidStack() {
  return (
    <group scale={0.8}>
      {/* Back frame */}
      <mesh position={[0.12, 0.08, -0.25]} rotation={[0, -0.04, 0.03]}>
        <boxGeometry args={[1.3, 1.6, 0.02]} />
        <meshStandardMaterial color="#4a4640" />
      </mesh>
      {/* Middle frame */}
      <mesh position={[0.06, 0.04, -0.12]} rotation={[0, -0.02, -0.02]}>
        <boxGeometry args={[1.3, 1.6, 0.02]} />
        <meshStandardMaterial color="#3d3a34" />
      </mesh>
      {/* Front frame */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.3, 1.6, 0.02]} />
        <meshStandardMaterial color="#2a2824" />
      </mesh>
      {/* Image area */}
      <mesh position={[0, 0.15, 0.02]}>
        <boxGeometry args={[1.1, 1.0, 0.01]} />
        <meshStandardMaterial color="#1a1916" />
      </mesh>
      {/* Mountain large */}
      <mesh position={[-0.1, -0.05, 0.03]}>
        <coneGeometry args={[0.35, 0.6, 4]} />
        <meshStandardMaterial color="#4a4640" />
      </mesh>
      {/* Mountain small */}
      <mesh position={[0.25, -0.15, 0.025]}>
        <coneGeometry args={[0.25, 0.4, 4]} />
        <meshStandardMaterial color="#5a5650" />
      </mesh>
      {/* Sun */}
      <mesh position={[0.35, 0.4, 0.03]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#c9a96e" emissive="#c9a96e" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function FilmStrip() {
  return (
    <group scale={0.75}>
      {/* Main strip */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.8, 1.2, 0.02]} />
        <meshStandardMaterial color="#2a2824" />
      </mesh>
      {/* Sprocket holes */}
      {[-0.35, -0.1, 0.15, 0.4].map((y, i) => (
        <group key={i}>
          <mesh position={[-0.82, y - 0.2, 0.02]}>
            <boxGeometry args={[0.08, 0.12, 0.02]} />
            <meshStandardMaterial color="#0a0a0a" />
          </mesh>
          <mesh position={[0.82, y - 0.2, 0.02]}>
            <boxGeometry args={[0.08, 0.12, 0.02]} />
            <meshStandardMaterial color="#0a0a0a" />
          </mesh>
        </group>
      ))}
      {/* Frame content area */}
      <mesh position={[0, -0.05, 0.02]}>
        <boxGeometry args={[1.4, 0.8, 0.01]} />
        <meshStandardMaterial color="#1a1916" />
      </mesh>
      {/* Play button */}
      <mesh position={[0.1, -0.05, 0.04]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.22, 0.38, 3]} />
        <meshStandardMaterial color="#b85c4a" emissive="#b85c4a" emissiveIntensity={0.3} />
      </mesh>
      {/* Clapperboard top */}
      <mesh position={[0, 0.7, 0]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[1.8, 0.3, 0.02]} />
        <meshStandardMaterial color="#3d3a34" />
      </mesh>
      {/* Clapper stripes */}
      {[-0.4, 0, 0.4].map((x, i) => (
        <mesh key={i} position={[x, 0.72, 0.02]} rotation={[0.1, 0, 0.15]}>
          <boxGeometry args={[0.25, 0.06, 0.015]} />
          <meshStandardMaterial color="#6b6560" />
        </mesh>
      ))}
    </group>
  );
}

// ─── Shared 3D Scene ────────────────────────────────────

function Scene3D({
  model,
  isHovered,
}: {
  model: "document-stack" | "polaroid-stack" | "film-strip";
  isHovered: boolean;
}) {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 3, 4]} intensity={1.0} />
      <directionalLight position={[-2, 1, 3]} intensity={0.4} />
      <RotatingAsset isHovered={isHovered}>
        {model === "document-stack" && <DocumentStack />}
        {model === "polaroid-stack" && <PolaroidStack />}
        {model === "film-strip" && <FilmStrip />}
      </RotatingAsset>
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────

function HoverFill({ color, isHovered }: { color: string; isHovered: boolean }) {
  return (
    <motion.div
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(90deg, ${color}40, ${color}00)`,
        pointerEvents: "none",
        transformOrigin: "left center",
      }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: isHovered ? 1 : 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    />
  );
}

function BarStats({ total, safe, suspicious, flagged }: BarStatsData) {
  return (
    <div className="flex flex-col justify-center gap-1 flex-1 min-w-0">
      <div className="flex items-baseline gap-2">
        <span
          style={{
            color: "#e8e0d4",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
          }}
        >
          {total}
        </span>
        <span
          style={{
            color: "#6b6560",
            fontSize: 11,
            fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
          }}
        >
          files scanned
        </span>
      </div>
      <div
        className="flex gap-4"
        style={{
          fontSize: 9,
          fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
        }}
      >
        <span style={{ color: "#a3b18a" }}>{safe} safe</span>
        <span style={{ color: "#c9a96e" }}>{suspicious} sus</span>
        <span style={{ color: "#b85c4a" }}>{flagged} flagged</span>
      </div>
    </div>
  );
}

function AssetCanvas3D({
  model,
  isHovered,
  width = 120,
  height = 100,
}: {
  model: "document-stack" | "polaroid-stack" | "film-strip";
  isHovered: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <div style={{ width, height, flexShrink: 0 }}>
      <Canvas camera={{ position: [0, 0, 4], fov: 40 }}>
        <Scene3D model={model} isHovered={isHovered} />
      </Canvas>
    </div>
  );
}

// ─── Small file icon for flagged file rows ──────────────

export function FileIcon3D({
  filename,
  isHovered = false,
}: {
  filename: string;
  isHovered?: boolean;
}) {
  const fileType = getFileType(filename);
  const model = fileType === "image" ? "polaroid-stack" : fileType === "video" ? "film-strip" : "document-stack";

  return (
    <div style={{ width: 40, height: 36, flexShrink: 0 }}>
      <Canvas camera={{ position: [0, 0, 4.5], fov: 35 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 3, 4]} intensity={1.0} />
        <RotatingAsset isHovered={isHovered}>
          {model === "document-stack" && <DocumentStack />}
          {model === "polaroid-stack" && <PolaroidStack />}
          {model === "film-strip" && <FilmStrip />}
        </RotatingAsset>
      </Canvas>
    </div>
  );
}

const BAR_CONFIG: {
  type: "document" | "image" | "video";
  label: string;
  extensions: string;
  model: "document-stack" | "polaroid-stack" | "film-strip";
}[] = [
  { type: "document", label: "FLAGGED DOCUMENTS", extensions: ".pdf .txt .md .json .yaml .csv", model: "document-stack" },
  { type: "image", label: "FLAGGED IMAGES", extensions: ".png .jpg .jpeg .svg .webp .gif", model: "polaroid-stack" },
  { type: "video", label: "FLAGGED VIDEO", extensions: ".mp4 .mov .webm .avi", model: "film-strip" },
];

// ─── ContentBar ─────────────────────────────────────────

function ContentBar({
  label,
  extensions,
  model,
  severity,
  stats,
}: {
  label: string;
  extensions: string;
  model: "document-stack" | "polaroid-stack" | "film-strip";
  severity: SeverityLevel;
  stats: BarStatsData;
}) {
  const [hovered, setHovered] = useState(false);
  const color = SEVERITY_COLORS[severity];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        height: 120,
        background: "#1a1916",
        border: "1px solid #3d3a34",
        borderRadius: 2,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        gap: 16,
        cursor: "default",
      }}
    >
      {/* Left severity strip */}
      <div
        style={{
          width: 4,
          height: "100%",
          background: color,
          flexShrink: 0,
        }}
      />

      {/* Hover fill overlay */}
      <HoverFill color={color} isHovered={hovered} />

      {/* 3D Asset */}
      <AssetCanvas3D model={model} isHovered={hovered} />

      {/* Labels & Stats */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flex: 1,
          gap: 4,
          position: "relative",
          zIndex: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            color: "#8a8478",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
          }}
        >
          {label}
        </span>
        <span
          style={{
            color: "#6b6560",
            fontSize: 8,
            fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
          }}
        >
          {extensions}
        </span>
        <BarStats {...stats} />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────

export default function FlaggedContentBars({ files = MOCK_FILES }: { files?: FileResult[] }) {
  const grouped = useMemo(() => {
    const docs = files.filter((f) => f.type === "document");
    const imgs = files.filter((f) => f.type === "image");
    const vids = files.filter((f) => f.type === "video");
    return { docs, imgs, vids };
  }, [files]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        position: "relative",
        boxShadow: "inset 0 0 10px 5px #0a0a0a",
      }}
    >
      {BAR_CONFIG.map((bar) => {
        const group =
          bar.type === "document" ? grouped.docs : bar.type === "image" ? grouped.imgs : grouped.vids;
        return (
          <ContentBar
            key={bar.type}
            label={bar.label}
            extensions={bar.extensions}
            model={bar.model}
            severity={worstSeverity(group)}
            stats={computeStats(group)}
          />
        );
      })}
    </div>
  );
}
