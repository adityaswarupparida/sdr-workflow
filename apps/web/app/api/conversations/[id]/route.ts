import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVER = process.env["AGENT_SERVER_URL"] ?? "http://localhost:3001";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${AGENT_SERVER}/conversations/${id}`);
  if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "approve") {
    const res = await fetch(`${AGENT_SERVER}/conversations/${id}/approve`, { method: "POST" });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  }

  if (action === "reply") {
    const body = await req.json();
    const res = await fetch(`${AGENT_SERVER}/conversations/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  }

  if (action === "reassign") {
    const body = await req.json();
    const res = await fetch(`${AGENT_SERVER}/conversations/${id}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
