"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import styles from "./staff-console.module.css";

type StaffRole = "admin" | "moderator";

type ChatMessage = {
  id: number;
  user_id: string;
  nickname: string;
  message: string;
  created_at: string;
};

type QueuePerson = {
  id: number;
  user_id: string;
  nickname: string;
  talent: string;
  joined_at: string;
};

type StageState = {
  id: number;
  current_user_id: string | null;
  current_nickname: string | null;
  started_at: string | null;
};

type MediaState = {
  id: number;
  status: "stopped" | "playing";
  title: string;
  kind: "music" | "poem" | "audiobook" | "announcement";
  audio_url: string;
  started_at: string | null;
  updated_at: string;
};

export default function StaffConsole() {
  const [role, setRole] = useState<StaffRole | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [queue, setQueue] = useState<QueuePerson[]>([]);
  const [stage, setStage] = useState<StageState | null>(null);
  const [stageLoaded, setStageLoaded] = useState(false);
  const [busyAction, setBusyAction] = useState("");

  const [media, setMedia] = useState<MediaState | null>(null);
  const [mediaConfigured, setMediaConfigured] = useState(true);
  const [mediaTitle, setMediaTitle] = useState("");
  const [mediaKind, setMediaKind] = useState<MediaState["kind"]>("music");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaNeedsPlay, setMediaNeedsPlay] = useState(false);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const intermissionAudioRef = useRef<HTMLAudioElement | null>(null);

  const checkStaff = useCallback(async () => {
    try {
      const response = await fetch("/api/staff-auth", { cache: "no-store" });
      const result = await response.json();
      setRole(result?.authenticated ? result.role : null);
    } catch {
      setRole(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  const loadMedia = useCallback(async () => {
    try {
      const response = await fetch("/api/stage-media", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) return;
      setMediaConfigured(result?.configured !== false);
      setMedia(result?.state ?? null);
    } catch {
      // Keep the room working even if optional intermission service is unavailable.
    }
  }, []);

  const loadStage = useCallback(async () => {
    const { data, error: stageError } = await supabase
      .from("open_stage_state")
      .select("id,current_user_id,current_nickname,started_at")
      .eq("id", 1)
      .maybeSingle();
    if (!stageError) {
      if (data) setStage(data);
      setStageLoaded(true);
    }
  }, []);

  const loadModerationData = useCallback(async () => {
    if (!role) return;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [messageResult, queueResult, stageResult] = await Promise.all([
      supabase
        .from("open_stage_messages")
        .select("id,user_id,nickname,message,created_at")
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("open_stage_queue")
        .select("id,user_id,nickname,talent,joined_at")
        .order("joined_at", { ascending: true }),
      supabase
        .from("open_stage_state")
        .select("id,current_user_id,current_nickname,started_at")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (messageResult.data) setMessages(messageResult.data);
    if (queueResult.data) setQueue(queueResult.data);
    if (stageResult.data) setStage(stageResult.data);
  }, [role]);

  useEffect(() => {
    void checkStaff();
    void loadMedia();
    void loadStage();

    const mediaTimer = window.setInterval(loadMedia, 2500);
    const stageTimer = window.setInterval(loadStage, 1800);
    return () => {
      window.clearInterval(mediaTimer);
      window.clearInterval(stageTimer);
    };
  }, [checkStaff, loadMedia, loadStage]);

  useEffect(() => {
    if (!panelOpen || !role) return;
    void loadModerationData();
    const timer = window.setInterval(loadModerationData, 3500);
    return () => window.clearInterval(timer);
  }, [panelOpen, role, loadModerationData]);

  useEffect(() => {
    const findHost = () => {
      const host = document.querySelector<HTMLElement>(".stage-content");
      if (host) {
        if (window.getComputedStyle(host).position === "static") {
          host.style.position = "relative";
        }
        setStageHost(host);
      } else {
        setStageHost(null);
      }
    };

    findHost();
    const observer = new MutationObserver(findHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const intermissionActive =
    stageLoaded &&
    media?.status === "playing" &&
    !!media.audio_url &&
    !stage?.current_user_id;

  useEffect(() => {
    const audio = intermissionAudioRef.current;
    if (!audio) return;

    if (!intermissionActive || !media?.audio_url) {
      audio.pause();
      setMediaNeedsPlay(false);
      return;
    }

    let cancelled = false;

    const syncAndPlay = async () => {
      if (audio.src !== media.audio_url) {
        audio.src = media.audio_url;
        audio.load();
      }

      const seek = () => {
        if (!media.started_at || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const elapsed = Math.max(0, (Date.now() - new Date(media.started_at).getTime()) / 1000);
        if (elapsed < audio.duration) {
          audio.currentTime = elapsed;
        }
      };

      if (audio.readyState >= 1) {
        seek();
      } else {
        audio.addEventListener("loadedmetadata", seek, { once: true });
      }

      try {
        await audio.play();
        if (!cancelled) setMediaNeedsPlay(false);
      } catch {
        if (!cancelled) setMediaNeedsPlay(true);
      }
    };

    void syncAndPlay();
    return () => {
      cancelled = true;
    };
  }, [intermissionActive, media?.audio_url, media?.started_at]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!pin.trim()) return;
    setLoginBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/staff-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Unable to sign in.");
      setRole(result.role);
      setPin("");
      setNotice(result.role === "admin" ? "Admin controls unlocked." : "Moderator controls unlocked.");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/staff-auth", { method: "DELETE" });
    setRole(null);
    setPanelOpen(false);
    setMessages([]);
    setQueue([]);
    setNotice("");
    setError("");
  }

  async function moderate(action: string, payload: Record<string, unknown> = {}) {
    setBusyAction(action + JSON.stringify(payload));
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/staff/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Moderation action failed.");
      setNotice("Done.");
      await loadModerationData();
      await loadStage();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Moderation action failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function startMedia(event: FormEvent) {
    event.preventDefault();
    setBusyAction("media-start");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stage-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          title: mediaTitle,
          kind: mediaKind,
          audioUrl: mediaUrl,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Unable to start intermission.");
      setNotice("Intermission started. It will play whenever the stage is empty.");
      await loadMedia();
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : "Unable to start intermission.");
    } finally {
      setBusyAction("");
    }
  }

  async function stopMedia() {
    setBusyAction("media-stop");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stage-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Unable to stop intermission.");
      setNotice("Intermission stopped.");
      await loadMedia();
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : "Unable to stop intermission.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <>
      {authChecked && (
        <button
          type="button"
          className={`${styles.staffLauncher} ${role ? styles.staffLauncherActive : ""}`}
          onClick={() => setPanelOpen((open) => !open)}
          title="Kwentayo staff controls"
        >
          🛡 {role === "admin" ? "Admin" : role === "moderator" ? "Moderator" : "Staff"}
        </button>
      )}

      {panelOpen && (
        <aside className={styles.panel} aria-label="Kwentayo staff console">
          <div className={styles.panelHeader}>
            <div>
              <strong>🛡 KWENTAYO STAFF</strong>
              <span>{role ? `${capitalize(role)} session` : "Private controls"}</span>
            </div>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close staff console">
              ×
            </button>
          </div>

          {!role ? (
            <form className={styles.loginBox} onSubmit={login}>
              <h3>Staff sign in</h3>
              <p>Enter the private admin or moderator PIN.</p>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="Private PIN"
              />
              <button type="submit" disabled={loginBusy || !pin.trim()}>
                {loginBusy ? "Checking..." : "Unlock Staff Controls"}
              </button>
            </form>
          ) : (
            <div className={styles.panelBody}>
              <section className={styles.section}>
                <div className={styles.sectionTitle}>
                  <h3>Stage control</h3>
                  <span>{stage?.current_user_id ? `Live: ${stage.current_nickname}` : "Stage is empty"}</span>
                </div>
                {stage?.current_user_id && (
                  <button
                    className={styles.dangerButton}
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => moderate("end_stage")}
                  >
                    End Current Stage Turn
                  </button>
                )}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionTitle}>
                  <h3>Chat moderation</h3>
                  <span>Last 24 hours</span>
                </div>
                {role === "admin" && messages.length > 0 && (
                  <button
                    className={styles.dangerGhost}
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => {
                      if (window.confirm("Delete every visible chat message from the room?")) {
                        void moderate("clear_chat");
                      }
                    }}
                  >
                    Clear Entire Chat
                  </button>
                )}
                <div className={styles.scrollList}>
                  {messages.length === 0 ? (
                    <p className={styles.empty}>No recent messages.</p>
                  ) : (
                    messages.map((message) => (
                      <div className={styles.messageRow} key={message.id}>
                        <div>
                          <span className={styles.messageMeta}>
                            {formatTime(message.created_at)} · {message.nickname}
                          </span>
                          <p>{message.message}</p>
                        </div>
                        <button
                          type="button"
                          disabled={!!busyAction}
                          onClick={() => moderate("delete_message", { messageId: message.id })}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionTitle}>
                  <h3>Up Next</h3>
                  <span>{queue.length} waiting</span>
                </div>
                <div className={styles.compactList}>
                  {queue.length === 0 ? (
                    <p className={styles.empty}>Nobody is waiting.</p>
                  ) : (
                    queue.map((person, index) => (
                      <div className={styles.queueRow} key={person.id}>
                        <span>#{index + 1} {person.nickname}</span>
                        <button
                          type="button"
                          disabled={!!busyAction}
                          onClick={() => moderate("remove_queue_user", { userId: person.user_id })}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {role === "admin" && (
                <section className={styles.section}>
                  <div className={styles.sectionTitle}>
                    <h3>Stage Intermission</h3>
                    <span>{media?.status === "playing" ? "Armed / playing when empty" : "Off"}</span>
                  </div>

                  {!mediaConfigured ? (
                    <div className={styles.setupNotice}>
                      Run <code>supabase/open_stage_media.sql</code> once in Supabase SQL Editor to enable shared intermission audio.
                    </div>
                  ) : (
                    <>
                      {media?.status === "playing" && (
                        <div className={styles.nowPlayingBox}>
                          <span>NOW READY</span>
                          <strong>{media.title}</strong>
                          <small>{capitalize(media.kind)} · pauses while somebody is on stage</small>
                          <button type="button" onClick={stopMedia} disabled={!!busyAction}>
                            Stop Intermission
                          </button>
                        </div>
                      )}

                      <form className={styles.mediaForm} onSubmit={startMedia}>
                        <label>
                          <span>Type</span>
                          <select value={mediaKind} onChange={(event) => setMediaKind(event.target.value as MediaState["kind"])}>
                            <option value="music">Music</option>
                            <option value="poem">Poem</option>
                            <option value="audiobook">Audiobook</option>
                            <option value="announcement">Announcement</option>
                          </select>
                        </label>
                        <label>
                          <span>Title</span>
                          <input
                            value={mediaTitle}
                            onChange={(event) => setMediaTitle(event.target.value)}
                            maxLength={100}
                            placeholder="Example: Quiet Piano Intermission"
                          />
                        </label>
                        <label>
                          <span>Direct audio URL</span>
                          <input
                            value={mediaUrl}
                            onChange={(event) => setMediaUrl(event.target.value)}
                            placeholder="https://.../audio.mp3"
                          />
                        </label>
                        <button type="submit" disabled={!!busyAction || !mediaTitle.trim() || !mediaUrl.trim()}>
                          ▶ Play When Stage Is Empty
                        </button>
                      </form>
                      <p className={styles.legalNote}>Use audio you own, have permission to use, or that is in the public domain.</p>
                    </>
                  )}
                </section>
              )}

              <button className={styles.logoutButton} type="button" onClick={logout}>
                Lock Staff Controls
              </button>
            </div>
          )}

          {notice && <div className={styles.notice}>{notice}</div>}
          {error && <div className={styles.error}>{error}</div>}
        </aside>
      )}

      {stageHost && intermissionActive && media &&
        createPortal(
          <div className={styles.intermissionOverlay}>
            <audio
              ref={intermissionAudioRef}
              preload="auto"
              onEnded={() => setMediaNeedsPlay(false)}
              onError={() => setMediaNeedsPlay(true)}
            />
            <div className={styles.intermissionIcon}>
              {media.kind === "music" ? "🎵" : media.kind === "poem" ? "📜" : media.kind === "audiobook" ? "📖" : "📣"}
            </div>
            <div className={styles.intermissionKicker}>KWENTAYO INTERMISSION</div>
            <h2>{media.title}</h2>
            <p>{capitalize(media.kind)} is playing while the stage is open.</p>
            {mediaNeedsPlay && (
              <button
                type="button"
                className={styles.enableMediaButton}
                onClick={async () => {
                  try {
                    await intermissionAudioRef.current?.play();
                    setMediaNeedsPlay(false);
                  } catch {
                    setMediaNeedsPlay(true);
                  }
                }}
              >
                🔊 Enable Intermission Audio
              </button>
            )}
            <span className={styles.stageOpenNote}>🎤 Stage is still open — join the line anytime.</span>
          </div>,
          stageHost,
        )}
    </>
  );
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
