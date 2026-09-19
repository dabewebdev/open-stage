import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const ROOM_NAME = "open-stage-lounge";

export async function POST(request: NextRequest) {
  try {
    const { accessToken, nickname } = await request.json();

    if (!accessToken || !nickname) {
      return NextResponse.json({ error: "Missing authentication information." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    const livekitUrl = process.env.LIVEKIT_URL?.trim();

    if (!supabaseUrl || !supabaseKey || !apiKey || !apiSecret || !livekitUrl) {
      return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid guest session." }, { status: 401 });
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: `video-${user.id}`,
      name: nickname.trim().slice(0, 20),
      ttl: "1h",
    });

    token.addGrant({
      roomJoin: true,
      room: ROOM_NAME,
      canSubscribe: true,
      canPublish: false,
      canPublishData: false,
    });

    return NextResponse.json({ token: await token.toJwt(), url: livekitUrl });
  } catch (error) {
    console.error("Stage video token error:", error);
    return NextResponse.json({ error: "Unable to create stage video token." }, { status: 500 });
  }
}
