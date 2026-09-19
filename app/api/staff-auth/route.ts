import { NextRequest, NextResponse } from "next/server";
import {
  STAFF_COOKIE_NAME,
  createStaffToken,
  getStaffRole,
  roleForPin,
} from "@/lib/staff-auth";

export async function GET(request: NextRequest) {
  const role = getStaffRole(request);
  return NextResponse.json({ authenticated: !!role, role });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const pin = typeof body?.pin === "string" ? body.pin : "";

    if (!process.env.OPEN_STAGE_ADMIN_PIN?.trim()) {
      return NextResponse.json(
        { error: "Admin access is not configured yet." },
        { status: 503 },
      );
    }

    const role = roleForPin(pin);
    if (!role) {
      return NextResponse.json({ error: "Incorrect staff PIN." }, { status: 401 });
    }

    const response = NextResponse.json({ authenticated: true, role });
    response.cookies.set(STAFF_COOKIE_NAME, createStaffToken(role), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    console.error("Staff login error:", error);
    return NextResponse.json({ error: "Unable to sign in as staff." }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false, role: null });
  response.cookies.set(STAFF_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
