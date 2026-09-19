import { RoomServiceClient } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const ROOM_NAME = "open-stage-lounge";

export async function POST(request: NextRequest) {
  try {
    const { accessToken, action } = await request.json();

    if (!accessToken || !["enable", "disable"].includes(action)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const livekitUrl = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    if (!supabaseUrl || !supabaseKey || !livekitUrl || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid guest session." }, { status: 401 });
    }

    if (action === "enable") {
      const { data: stage, error: stageError } = await supabase
        .from("open_stage_state")
        .select("current_user_id")
        .eq("id", 1)
        .single();

      if (stageError) {
        return NextResponse.json({ error: "Unable to verify the stage." }, { status: 500 });
      }

      if (stage.current_user_id !== user.id) {
        return NextResponse.json(
          { error: "Only the current performer may turn on a camera." },
          { status: 403 },
        );
      }
    }

    const serviceUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const roomService = new RoomServiceClient(serviceUrl, apiKey, apiSecret);

    await roomService.updateParticipant(ROOM_NAME, `video-${user.id}`, {
      permission: {
        canSubscribe: true,
        canPublish: action === "enable",
        canPublishData: false,
      },
    });

    return NextResponse.json({ success: true, canPublish: action === "enable" });
  } catch (error) {
    console.error("Stage video permission error:", error);
    return NextResponse.json({ error: "Unable to update camera permission." }, { status: 500 });
  }
}
