"use client";
import { useState } from "react";
import { PipelineStepRow } from "./PipelineStepRow";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";

export function PipelineView({ steps, isRunning, isAnalyzing }: {
  steps: { text: string; color: string }[];
  isRunning: boolean;
  isAnalyzing: boolean;
}) {
  const [devMode, setDevMode] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="border-b border-panel-border flex-1 flex flex-col">
      <div className="px-3 py-2 flex items-center justify-between">
        <button
          onClick={() => copy(steps.map(s => s.text).join("\n"))}
          className="text-[10px] text-text-label uppercase tracking-[2px] hover:text-text-primary transition-colors"
          title="Copy all steps"
        >
          {copied ? "Copied!" : "Pipeline"}
        </button>
        <button
          onClick={() => setDevMode(!devMode)}
          className="text-[10px] text-text-sub hover:text-text-primary transition-colors"
        >
          [{devMode ? "view" : "dev"}]
        </button>
      </div>
      <div className="px-3 pb-3 text-[11px] leading-relaxed flex-1 overflow-y-auto">
        {isAnalyzing && steps.length === 0 ? (
          <div className="text-suspicious animate-pulse">Scanning...</div>
        ) : steps.length === 0 ? (
          <div className="text-text-sub text-[11px]" style={{ borderLeft: "2px dashed var(--text-sub)", paddingLeft: "8px" }}>Awaiting scan...</div>
        ) : (
          <div className="space-y-0.5">
            {steps.map((step, i) => (
              <PipelineStepRow key={i} step={step} index={i} devMode={devMode} />
            ))}
            {isRunning && <div className="text-text-sub animate-pulse ml-4">...</div>}
          </div>
        )}
      </div>
    </div>
  );
}
