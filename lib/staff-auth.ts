import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export type StaffRole = "admin" | "moderator";

export const STAFF_COOKIE_NAME = "kwentayo_staff";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function sessionSecret() {
  return (
    process.env.OPEN_STAGE_STAFF_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function sign(value: string) {
  const secret = sessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function roleForPin(pin: string): StaffRole | null {
  const clean = pin.trim();
  const adminPin = process.env.OPEN_STAGE_ADMIN_PIN?.trim() || "";
  const moderatorPin = process.env.OPEN_STAGE_MODERATOR_PIN?.trim() || "";

  if (adminPin && safeEqual(clean, adminPin)) return "admin";
  if (moderatorPin && safeEqual(clean, moderatorPin)) return "moderator";
  return null;
}

export function createStaffToken(role: StaffRole) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${role}.${expiresAt}`;
  const signature = sign(payload);
  if (!signature) throw new Error("Staff sessions are not configured.");
  return `${payload}.${signature}`;
}

export function verifyStaffToken(token?: string | null): StaffRole | null {
  if (!token) return null;

  const [role, expiresAtText, signature] = token.split(".");
  if ((role !== "admin" && role !== "moderator") || !expiresAtText || !signature) {
    return null;
  }

  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const expected = sign(`${role}.${expiresAtText}`);
  if (!expected || !safeEqual(signature, expected)) return null;
  return role;
}

export function getStaffRole(request: NextRequest) {
  return verifyStaffToken(request.cookies.get(STAFF_COOKIE_NAME)?.value);
}

export function canModerate(role: StaffRole | null): role is StaffRole {
  return role === "admin" || role === "moderator";
}
