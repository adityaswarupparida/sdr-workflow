import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVER = process.env["AGENT_SERVER_URL"] ?? "http://localhost:3001";

function authHeaders(req: NextRequest): Record<string, string> | null {
  const token = req.cookies.get("sdr-session")?.value;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authHeaders(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const res = await fetch(`${AGENT_SERVER}/conversations/${id}`, { headers: auth });
  if (!res.ok) return NextResponse.json(await res.json().catch(() => ({ error: "Not found" })), { status: res.status });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authHeaders(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const send = async (path: string, body?: unknown) => {
    const res = await fetch(`${AGENT_SERVER}/conversations/${id}${path}`, {
      method: "POST",
      headers: { ...auth, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  };

  if (action === "approve") return send("/approve");
  if (action === "reply")   return send("/reply", await req.json());
  if (action === "reassign") return send("/reassign", await req.json());

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
