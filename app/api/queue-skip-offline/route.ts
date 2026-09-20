import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const MIN_STALE_AGE_MS = 20_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
    const staleUserId = typeof body?.staleUserId === "string" ? body.staleUserId : "";

    if (!accessToken || !staleUserId) {
      return NextResponse.json({ error: "Missing queue cleanup request." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Queue cleanup is not configured." }, { status: 503 });
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid guest session." }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: stage, error: stageError } = await admin
      .from("open_stage_state")
      .select("current_user_id")
      .eq("id", 1)
      .single();

    if (stageError) throw stageError;
    if (stage?.current_user_id) {
      return NextResponse.json({ success: true, skipped: false, reason: "stage-busy" });
    }

    const { data: queue, error: queueError } = await admin
      .from("open_stage_queue")
      .select("id,user_id,nickname,joined_at")
      .order("joined_at", { ascending: true });

    if (queueError) throw queueError;
    if (!queue || queue.length < 2) {
      return NextResponse.json({ success: true, skipped: false, reason: "queue-short" });
    }

    const first = queue[0];
    const callerIndex = queue.findIndex((item) => item.user_id === user.id);

    if (first.user_id !== staleUserId) {
      return NextResponse.json({ success: true, skipped: false, reason: "queue-changed" });
    }

    if (callerIndex < 1) {
      return NextResponse.json({ error: "Only someone waiting behind can clear a stale first spot." }, { status: 403 });
    }

    const joinedAt = new Date(first.joined_at).getTime();
    if (!Number.isFinite(joinedAt) || Date.now() - joinedAt < MIN_STALE_AGE_MS) {
      return NextResponse.json({ success: true, skipped: false, reason: "grace-period" });
    }

    const { error: deleteError } = await admin
      .from("open_stage_queue")
      .delete()
      .eq("id", first.id)
      .eq("user_id", staleUserId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      skipped: true,
      nickname: first.nickname,
    });
  } catch (error) {
    console.error("Queue stale cleanup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to clean stale queue entry." },
      { status: 500 },
    );
  }
}
