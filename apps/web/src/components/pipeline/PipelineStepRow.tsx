"use client";
import React, { useState, useMemo } from "react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";

function getBorderColor(text: string): string {
  if (/encoding|comparing/i.test(text)) return "#6b8aaa";
  if (/result|stage 2|scoring|similarity/i.test(text)) return "#a3b18a";
  return "#3d3a34";
}

export const PipelineStepRow = React.memo(function PipelineStepRow({ step, index, devMode }: {
  step: { text: string; color: string };
  index: number;
  devMode: boolean;
}) {
  const { copied, copy } = useCopyToClipboard();
  const [hovered, setHovered] = useState(false);
  const isResult = step.text.startsWith("RESULT:");
  const borderColor = useMemo(() => getBorderColor(step.text), [step.text]);

  return (
    <div
      className={`step-in flex items-start gap-1.5 px-1 py-0.5 rounded-sm cursor-pointer transition-colors ${hovered ? "bg-[#1a1916]" : ""} ${isResult ? "font-bold" : ""}`}
      style={{ color: step.color ?? "#6b6560", animationDelay: `${index * 50}ms`, borderLeft: `2px solid ${borderColor}` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => copy(devMode ? JSON.stringify(step, null, 2) : step.text)}
    >
      <span className="text-text-sub text-[10px] w-3 text-right shrink-0 mt-px">{index + 1}.</span>
      {devMode ? (
        <pre className="text-[10px] whitespace-pre-wrap overflow-x-auto">{JSON.stringify(step, null, 2)}</pre>
      ) : (
        <span className="flex-1">{step.text}</span>
      )}
      {hovered && (
        <span className="text-[10px] text-text-sub shrink-0 ml-auto">
          {copied ? "Copied" : "\u2398"}
        </span>
      )}
    </div>
  );
});
