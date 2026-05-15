import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("sdr-session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
