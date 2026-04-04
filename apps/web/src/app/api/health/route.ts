import { NextResponse } from "next/server";

const SHIELD_URL = process.env.SHIELD_API_URL || "http://localhost:8001";

export async function GET() {
  try {
    const res = await fetch(`${SHIELD_URL}/health`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: "disconnected" }, { status: 503 });
  }
}
