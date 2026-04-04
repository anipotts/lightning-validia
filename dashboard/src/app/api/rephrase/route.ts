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
        messages: [{
          role: "user",
          content: `This prompt was flagged as a "${category}" distillation attack:\n"${prompt}"\n\nRephrase it as a legitimate request that achieves the user's actual goal without triggering extraction patterns. Respond with ONLY the rephrased prompt.`,
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
