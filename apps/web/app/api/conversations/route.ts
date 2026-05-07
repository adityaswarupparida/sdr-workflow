import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVER = process.env["AGENT_SERVER_URL"] ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const url = status ? `${AGENT_SERVER}/conversations?status=${status}` : `${AGENT_SERVER}/conversations`;
  const res = await fetch(url);
  const data = await res.json();
  return NextResponse.json(data);
}
