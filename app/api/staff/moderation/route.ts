import { createClient } from "@supabase/supabase-js";
import { RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { canModerate, getStaffRole } from "@/lib/staff-auth";

const ROOM_NAME = "open-stage-lounge";

type ModerationAction =
  | "delete_message"
  | "clear_chat"
  | "remove_queue_user"
  | "end_stage";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function revokeStageMicrophone(userId: string) {
  const livekitUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!livekitUrl || !apiKey || !apiSecret) return;

  try {
    const serviceUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const roomService = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
    await roomService.updateParticipant(ROOM_NAME, userId, {
      permission: { canSubscribe: true, canPublish: false, canPublishData: false },
    });
  } catch (error) {
    console.error("Staff microphone revoke error:", error);
  }
}

export async function POST(request: NextRequest) {
  const role = getStaffRole(request);
  if (!canModerate(role)) {
    return NextResponse.json({ error: "Staff access required." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Moderation is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action as ModerationAction | undefined;

    if (action === "delete_message") {
      const messageId = Number(body?.messageId);
      if (!Number.isInteger(messageId) || messageId <= 0) {
        return NextResponse.json({ error: "Invalid message." }, { status: 400 });
      }
      const { error } = await admin.from("open_stage_messages").delete().eq("id", messageId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "clear_chat") {
      if (role !== "admin") {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
      }
      const { error } = await admin
        .from("open_stage_messages")
        .delete()
        .lt("created_at", new Date(Date.now() + 60_000).toISOString());
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "remove_queue_user") {
      const userId = typeof body?.userId === "string" ? body.userId : "";
      if (!userId) {
        return NextResponse.json({ error: "Invalid queue user." }, { status: 400 });
      }
      const { error } = await admin.from("open_stage_queue").delete().eq("user_id", userId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "end_stage") {
      const { data: stage, error: stageReadError } = await admin
        .from("open_stage_state")
        .select("current_user_id")
        .eq("id", 1)
        .single();
      if (stageReadError) throw stageReadError;

      if (stage?.current_user_id) {
        await revokeStageMicrophone(stage.current_user_id);
      }

      const { error } = await admin
        .from("open_stage_state")
        .update({
          current_user_id: null,
          current_nickname: null,
          started_at: null,
        })
        .eq("id", 1);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown moderation action." }, { status: 400 });
  } catch (error) {
    console.error("Staff moderation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Moderation action failed." },
      { status: 500 },
    );
  }
}
