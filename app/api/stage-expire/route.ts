import { createClient } from "@supabase/supabase-js";
import { RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

const ROOM_NAME = "open-stage-lounge";
const STAGE_LIMIT_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const { expectedUserId, expectedStartedAt } = await request.json();

    if (!expectedUserId || !expectedStartedAt) {
      return NextResponse.json({ error: "Missing stage session." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const livekitUrl = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Stage expiry is not configured." }, { status: 503 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: stage, error: stageError } = await admin
      .from("open_stage_state")
      .select("current_user_id,started_at")
      .eq("id", 1)
      .single();

    if (stageError || !stage) {
      console.error("Stage expiry read:", stageError);
      return NextResponse.json({ error: "Unable to verify stage.", detail: stageError?.message ?? null }, { status: 500 });
    }

    const databaseStartedAt = new Date(stage.started_at).getTime();
    const clientStartedAt = new Date(expectedStartedAt).getTime();

    if (
      stage.current_user_id !== expectedUserId ||
      !Number.isFinite(databaseStartedAt) ||
      !Number.isFinite(clientStartedAt) ||
      Math.abs(databaseStartedAt - clientStartedAt) > 1000
    ) {
      return NextResponse.json({ success: true, expired: false, reason: "stage-changed" });
    }

    if (Date.now() - databaseStartedAt < STAGE_LIMIT_MS) {
      return NextResponse.json({ success: true, expired: false, reason: "not-due" });
    }

    // Use the same database function as the normal End My Turn button.
    // This preserves the table's constraints/triggers instead of directly
    // writing nullable values that may not be valid for this schema.
    const { data: ended, error: endError } = await admin.rpc("end_open_stage");

    if (endError) {
      console.error("Stage expiry RPC:", endError);
      return NextResponse.json(
        { error: "Unable to expire stage.", step: "end-open-stage", code: endError.code ?? null, detail: endError.message ?? null },
        { status: 500 },
      );
    }

    if (!ended) {
      // A service-role call may not satisfy an auth.uid()-based RPC. Fall
      // back to a constraint-safe update without nulling nickname/started_at.
      const { data: cleared, error: clearError } = await admin
        .from("open_stage_state")
        .update({ current_user_id: null })
        .eq("id", 1)
        .eq("current_user_id", expectedUserId)
        .select("id");

      if (clearError) {
        console.error("Stage expiry fallback:", clearError);
        return NextResponse.json(
          { error: "Unable to expire stage.", step: "stage-clear", code: clearError.code ?? null, detail: clearError.message ?? null },
          { status: 500 },
        );
      }

      if (!cleared?.length) {
        return NextResponse.json({ success: true, expired: false, reason: "already-cleared" });
      }
    }

    await admin.from("open_stage_queue").delete().eq("user_id", expectedUserId);

    if (livekitUrl && apiKey && apiSecret) {
      try {
        const serviceUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
        const roomService = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
        await roomService.updateParticipant(ROOM_NAME, expectedUserId, {
          permission: { canSubscribe: true, canPublish: false, canPublishData: false },
        });
      } catch (error) {
        console.error("LiveKit timeout permission cleanup:", error);
      }
    }

    return NextResponse.json({ success: true, expired: true });
  } catch (error) {
    console.error("Stage expiry route error:", error);
    return NextResponse.json(
      { error: "Unable to expire stage.", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, step: "config", error: "missing-server-config" },
      { status: 503 },
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("open_stage_state")
    .select("id,current_user_id,started_at")
    .eq("id", 1)
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        step: "stage-read",
        code: error.code ?? null,
        error: error.message ?? "stage-read-failed",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    step: "stage-read",
    hasCurrentPerformer: Boolean(data?.current_user_id),
    hasStartedAt: Boolean(data?.started_at),
  });
}
