"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteTrack, Room, RoomEvent, Track } from "livekit-client";
import { supabase } from "@/lib/supabase/client";

type StageState = {
  current_user_id: string | null;
  current_nickname: string | null;
  started_at: string | null;
};

const PUBLIC_CAM_EMBED =
  "https://www.youtube.com/embed/live_stream?channel=UCLA_DiR1FfKNvjuUpBHmylQ&autoplay=1&mute=1&controls=1&playsinline=1&rel=0&modestbranding=1";

export default function StageVideoLayer() {
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [endingTurn, setEndingTurn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [videoActive, setVideoActive] = useState(false);
  const [videoConnected, setVideoConnected] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(10 * 60);

  const roomRef = useRef<Room | null>(null);
  const videoMountRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<StageState | null>(null);
  const attachedRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const clearVideo = useCallback(() => {
    attachedRef.current.forEach((element) => element.remove());
    attachedRef.current = [];
    if (videoMountRef.current) videoMountRef.current.innerHTML = "";
    setVideoActive(false);
  }, []);

  const styleVideoElement = (element: HTMLElement, muted = false) => {
    const video = element as HTMLVideoElement;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = muted;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    video.style.display = "block";
    video.style.background = "#090b10";
  };

  const attachTrack = useCallback((track: RemoteTrack, participantIdentity: string) => {
    const currentPerformer = stageRef.current?.current_user_id;
    if (track.kind !== Track.Kind.Video || !currentPerformer) return;
    if (participantIdentity !== `video-${currentPerformer}`) return;

    const element = track.attach();
    styleVideoElement(element);
    clearVideo();
    videoMountRef.current?.appendChild(element);
    attachedRef.current = [element];
    setVideoActive(true);
  }, [clearVideo]);

  useEffect(() => {
    let cancelled = false;

    const loadIdentity = async () => {
      const savedNickname = window.localStorage.getItem("open-stage-nickname") ?? "";
      if (!savedNickname) {
        setNickname("");
        setUserId(null);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!cancelled && session?.user) {
        setNickname(savedNickname);
        setUserId(session.user.id);
      }
    };

    void loadIdentity();
    const timer = window.setInterval(loadIdentity, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const locateAndClean = () => {
      const host = document.querySelector<HTMLElement>(".stage-content");
      if (host) {
        if (window.getComputedStyle(host).position === "static") host.style.position = "relative";
        host.style.overflow = "hidden";
        setStageHost(host);
      }

      document
        .querySelectorAll<HTMLElement>('aside[aria-label="Kwentayo staff console"] section')
        .forEach((section) => {
          if (section.textContent?.includes("Stage Intermission")) section.style.display = "none";
        });

      document.querySelectorAll<HTMLElement>('div[class*="intermissionOverlay"]').forEach((overlay) => {
        overlay.querySelectorAll("audio").forEach((audio) => audio.pause());
        overlay.style.display = "none";
      });
    };

    locateAndClean();
    const observer = new MutationObserver(locateAndClean);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadStage = async () => {
      const { data, error } = await supabase
        .from("open_stage_state")
        .select("current_user_id,current_nickname,started_at")
        .eq("id", 1)
        .maybeSingle();

      if (!cancelled && !error) setStage(data ?? null);
    };

    void loadStage();
    const timer = window.setInterval(loadStage, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!stage?.current_user_id || !stage.started_at) {
      setSecondsLeft(10 * 60);
      return;
    }

    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(stage.started_at as string).getTime()) / 1000);
      setSecondsLeft(Math.max(0, 10 * 60 - elapsed));
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [stage?.current_user_id, stage?.started_at]);

  useEffect(() => {
    // The scenic camera is public. A LiveKit video connection is only needed
    // while someone is performing, including viewers of that performer.
    if (!userId || !nickname || !stage?.current_user_id) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setVideoConnected(false);
      clearVideo();
      return;
    }

    let cancelled = false;
    setVideoConnected(false);
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      attachTrack(track, participant.identity);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove());
      if (track.kind === Track.Kind.Video) setVideoActive(false);
    });

    const connect = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const response = await fetch("/api/stage-video-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: session.access_token, nickname }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || "Unable to connect stage video.");

        await room.connect(result.url, result.token);
        if (cancelled) room.disconnect();
        else setVideoConnected(true);
      } catch (error) {
        if (!cancelled) console.error("Stage video connection error:", error);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      setVideoConnected(false);
      clearVideo();
      room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [userId, nickname, stage?.current_user_id, attachTrack, clearVideo]);

  useEffect(() => {
    clearVideo();
  }, [stage?.current_user_id, clearVideo]);

  const isOnStage = !!userId && stage?.current_user_id === userId;

  const setVideoPermission = async (action: "enable" | "disable") => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your guest session has expired.");

    const response = await fetch("/api/stage-video-permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: session.access_token, action }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error || "Unable to update camera permission.");
  };

  const setAudioPublishPermission = async (action: "enable" | "disable") => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your guest session has expired.");

    const response = await fetch("/api/livekit-stage-permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: session.access_token, action }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error || "Unable to update stage microphone permission.");
  };

  const waitForPublishPermission = async (room: Room) => {
    if (room.localParticipant.permissions?.canPublish) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        room.off(RoomEvent.ParticipantPermissionsChanged, handler);
        reject(new Error("Camera permission took too long."));
      }, 5000);

      const handler = () => {
        if (room.localParticipant.permissions?.canPublish) {
          window.clearTimeout(timeout);
          room.off(RoomEvent.ParticipantPermissionsChanged, handler);
          resolve();
        }
      };

      room.on(RoomEvent.ParticipantPermissionsChanged, handler);
    });
  };

  const turnCameraOff = useCallback(async () => {
    const room = roomRef.current;
    try {
      if (room) await room.localParticipant.setCameraEnabled(false);
      await setVideoPermission("disable").catch(() => {});
    } finally {
      clearVideo();
      setCameraOn(false);
    }
  }, [clearVideo]);

  useEffect(() => {
    if (!isOnStage && cameraOn) void turnCameraOff();
  }, [isOnStage, cameraOn, turnCameraOff]);

  const toggleCamera = async () => {
    if (!isOnStage || !videoConnected || cameraBusy) return;
    const room = roomRef.current;
    if (!room) return;

    setCameraBusy(true);
    setCameraError("");

    try {
      if (cameraOn) {
        await turnCameraOff();
        return;
      }

      await setVideoPermission("enable");
      await waitForPublishPermission(room);
      const publication = await room.localParticipant.setCameraEnabled(true);
      const localTrack = publication?.track;

      if (localTrack) {
        const element = localTrack.attach();
        styleVideoElement(element, true);
        clearVideo();
        videoMountRef.current?.appendChild(element);
        attachedRef.current = [element];
        setVideoActive(true);
      }

      setCameraOn(true);
    } catch (error) {
      console.error("Stage camera error:", error);
      setCameraError(error instanceof Error ? error.message : "Unable to start camera.");
      await turnCameraOff();
    } finally {
      setCameraBusy(false);
    }
  };

  const endMyTurn = async () => {
    if (!isOnStage || endingTurn) return;

    setEndingTurn(true);
    setCameraError("");

    try {
      if (cameraOn) await turnCameraOff();
      await setAudioPublishPermission("disable").catch(() => {});

      const { data, error } = await supabase.rpc("end_open_stage");
      if (error) throw error;
      if (!data) throw new Error("Unable to end your turn.");

      setStage({ current_user_id: null, current_nickname: null, started_at: null });
    } catch (error) {
      console.error("End stage turn error:", error);
      setCameraError(error instanceof Error ? error.message : "Unable to end your turn.");
    } finally {
      setEndingTurn(false);
    }
  };

  if (!stageHost) return null;

  return createPortal(
    <>
      {!stage?.current_user_id && (
        <div style={styles.publicCamWrap}>
          <iframe
            title="Kwentayo public scenic camera"
            src={PUBLIC_CAM_EMBED}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            style={styles.publicCamFrame}
          />
          <div style={styles.publicCamShade} />
          <div style={styles.publicCamBadge}>● LIVE PUBLIC CAM · NASA</div>
          <div style={styles.publicCamMessage}>
            <strong>Window to the world</strong>
            <span>Stage is open — join the line anytime.</span>
          </div>
        </div>
      )}

      {!!stage?.current_user_id && (
        <>
          <div
            ref={videoMountRef}
            style={{
              ...styles.performerVideo,
              opacity: videoActive ? 1 : 0,
              pointerEvents: "none",
            }}
          />

          {videoActive && (
            <div style={styles.videoInfo}>
              <span>● LIVE VIDEO</span>
              <strong>{stage.current_nickname}</strong>
              <small>{formatCountdown(secondsLeft)} remaining</small>
            </div>
          )}

          {isOnStage && (
            <div style={styles.cameraControls}>
              <div style={styles.buttonRow}>
                <button
                  type="button"
                  onClick={() => void toggleCamera()}
                  disabled={!videoConnected || cameraBusy || endingTurn}
                  style={styles.cameraButton}
                >
                  {cameraBusy ? "Camera..." : !videoConnected ? "Connecting camera..." : cameraOn ? "📷 Camera Off" : "📷 Camera On"}
                </button>
                <button
                  type="button"
                  onClick={() => void endMyTurn()}
                  disabled={endingTurn}
                  style={styles.endTurnButton}
                >
                  {endingTurn ? "Ending..." : "🚪 End My Turn"}
                </button>
              </div>
              {cameraError && <span style={styles.cameraError}>{cameraError}</span>}
            </div>
          )}
        </>
      )}
    </>,
    stageHost,
  );
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const styles: Record<string, React.CSSProperties> = {
  publicCamWrap: { position: "absolute", inset: 0, zIndex: 24, overflow: "hidden", background: "#090b10" },
  publicCamFrame: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "#090b10" },
  publicCamShade: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,.18), transparent 45%, rgba(0,0,0,.48))" },
  publicCamBadge: { position: "absolute", top: 12, left: 12, padding: "5px 8px", borderRadius: 4, background: "rgba(0,0,0,.62)", color: "white", fontSize: 10, fontWeight: 800, letterSpacing: ".08em", pointerEvents: "none" },
  publicCamMessage: { position: "absolute", left: 14, right: 14, bottom: 12, display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, padding: "9px 11px", borderRadius: 5, background: "rgba(0,0,0,.58)", color: "white", fontSize: 11, pointerEvents: "none" },
  performerVideo: { position: "absolute", inset: 0, zIndex: 28, background: "#090b10", overflow: "hidden", transition: "opacity .2s ease" },
  videoInfo: { position: "absolute", zIndex: 32, left: 12, bottom: 12, display: "grid", gap: 2, padding: "7px 9px", borderRadius: 5, background: "rgba(0,0,0,.66)", color: "white", pointerEvents: "none" },
  cameraControls: { position: "absolute", zIndex: 36, right: 12, bottom: 12, display: "grid", justifyItems: "end", gap: 5 },
  buttonRow: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" },
  cameraButton: { border: "1px solid rgba(255,255,255,.45)", borderRadius: 5, background: "rgba(32,18,43,.88)", color: "white", padding: "8px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  endTurnButton: { border: "1px solid rgba(255,190,190,.65)", borderRadius: 5, background: "rgba(103,20,32,.9)", color: "white", padding: "8px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer" },
  cameraError: { maxWidth: 260, padding: "4px 6px", borderRadius: 4, background: "rgba(120,20,30,.9)", color: "white", fontSize: 9 },
};
