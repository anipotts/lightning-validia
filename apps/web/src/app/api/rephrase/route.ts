import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export async function POST(req: NextRequest) {
  const { prompt, category } = await req.json();

  if (!ANTHROPIC_API_KEY || !prompt) {
    return NextResponse.json({ rephrased: prompt }, { status: 200 });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: "You are a prompt rewriter. You receive a prompt that was flagged as a distillation attack. Your ONLY job is to output a single rephrased version of that prompt that asks for the same information in a legitimate, non-extractive way. Output ONLY the rephrased prompt text — no explanation, no preamble, no quotes, no commentary. Just the new prompt.",
        messages: [{
          role: "user",
          content: `Flagged category: ${category}\nOriginal prompt: ${prompt}`,
        }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ rephrased: prompt });
    }

    const data = await res.json();
    const rephrased = data.content?.[0]?.text?.trim() || prompt;
    return NextResponse.json({ rephrased });
  } catch {
    return NextResponse.json({ rephrased: prompt });
  }
}
