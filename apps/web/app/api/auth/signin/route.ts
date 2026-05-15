import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVER = process.env["AGENT_SERVER_URL"] ?? "http://localhost:3001";
const COOKIE_NAME = "sdr-session";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24h, matches JWT TTL

export async function POST(req: NextRequest) {
  const body = await req.json();
  const upstream = await fetch(`${AGENT_SERVER}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await upstream.json().catch(() => ({}))) as { token?: string; user?: unknown; error?: string };

  if (!upstream.ok || !data.token) {
    return NextResponse.json({ error: data.error ?? "Sign in failed" }, { status: upstream.status });
  }

  const res = NextResponse.json({ user: data.user });
  res.cookies.set(COOKIE_NAME, data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
