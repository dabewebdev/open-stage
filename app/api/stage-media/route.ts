import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getStaffRole } from "@/lib/staff-auth";

const MEDIA_KINDS = new Set(["music", "poem", "audiobook", "announcement"]);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ configured: false, state: null });
  }

  const { data, error } = await admin
    .from("open_stage_media_state")
    .select("id,status,title,kind,audio_url,started_at,updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ configured: false, state: null });
    }
    console.error("Stage media read error:", error);
    return NextResponse.json({ configured: false, state: null }, { status: 500 });
  }

  return NextResponse.json({ configured: true, state: data });
}

export async function POST(request: NextRequest) {
  const role = getStaffRole(request);
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Stage media is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "stop") {
      const { error } = await admin
        .from("open_stage_media_state")
        .upsert(
          {
            id: 1,
            status: "stopped",
            title: "",
            kind: "music",
            audio_url: "",
            started_at: null,
            updated_at: new Date().toISOString(),
            updated_by: "admin",
          },
          { onConflict: "id" },
        );
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "start") {
      const title = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "";
      const kind = typeof body?.kind === "string" ? body.kind : "music";
      const audioUrl = typeof body?.audioUrl === "string" ? body.audioUrl.trim() : "";

      if (!title || !audioUrl || !MEDIA_KINDS.has(kind)) {
        return NextResponse.json({ error: "Title, audio type, and audio URL are required." }, { status: 400 });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(audioUrl);
      } catch {
        return NextResponse.json({ error: "Enter a valid audio URL." }, { status: 400 });
      }
      if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
        return NextResponse.json({ error: "Audio URL must use http or https." }, { status: 400 });
      }

      const now = new Date().toISOString();
      const { error } = await admin
        .from("open_stage_media_state")
        .upsert(
          {
            id: 1,
            status: "playing",
            title,
            kind,
            audio_url: parsedUrl.toString(),
            started_at: now,
            updated_at: now,
            updated_by: "admin",
          },
          { onConflict: "id" },
        );
      if (error) throw error;
      return NextResponse.json({ success: true, startedAt: now });
    }

    return NextResponse.json({ error: "Unknown media action." }, { status: 400 });
  } catch (error) {
    console.error("Stage media update error:", error);
    const message = error instanceof Error ? error.message : "Unable to update stage media.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
