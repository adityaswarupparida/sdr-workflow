import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVER = process.env["AGENT_SERVER_URL"] ?? "http://localhost:3001";

export async function GET() {
  const res = await fetch(`${AGENT_SERVER}/reps`);
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${AGENT_SERVER}/reps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.ok ? 201 : res.status });
}
