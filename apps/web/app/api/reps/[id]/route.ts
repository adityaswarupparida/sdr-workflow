import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVER = process.env["AGENT_SERVER_URL"] ?? "http://localhost:3001";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const res = await fetch(`${AGENT_SERVER}/reps/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${AGENT_SERVER}/reps/${id}`, { method: "DELETE" });
  return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
}
