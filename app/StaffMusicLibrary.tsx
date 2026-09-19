"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { KWENTAYO_MUSIC_LIBRARY } from "@/lib/kwentayo-music";

function trackIdFromUrl(url: string) {
  const match = url.match(/\/api\/kwentayo-music\/(\d{3})/);
  return match?.[1] ?? null;
}

function pickRandomTrack(excludeId?: string | null) {
  const choices = excludeId
    ? KWENTAYO_MUSIC_LIBRARY.filter((track) => track.id !== excludeId)
    : KWENTAYO_MUSIC_LIBRARY;
  return choices[Math.floor(Math.random() * choices.length)] ?? KWENTAYO_MUSIC_LIBRARY[0];
}

export default function StaffMusicLibrary() {
  const [role, setRole] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState("001");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [continuousShuffle, setContinuousShuffle] = useState(false);
  const shuffleRef = useRef(false);
  const advancingRef = useRef(false);

  useEffect(() => {
    shuffleRef.current = continuousShuffle;
  }, [continuousShuffle]);

  useEffect(() => {
    const loadRole = async () => {
      try {
        const response = await fetch("/api/staff-auth", { cache: "no-store" });
        const result = await response.json();
        setRole(result?.authenticated ? result.role : null);
      } catch {
        setRole(null);
      }
    };

    void loadRole();
    const timer = window.setInterval(loadRole, 2500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const locate = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>("section"));
      const intermission = sections.find((section) =>
        section.textContent?.includes("Stage Intermission"),
      );
      setHost(intermission ?? null);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncMediaState = async () => {
      try {
        const response = await fetch("/api/stage-media", { cache: "no-store" });
        const result = await response.json();
        const state = result?.state;
        const audioUrl = typeof state?.audio_url === "string" ? state.audio_url : "";
        const isBuiltIn = audioUrl.includes("/api/kwentayo-music/");
        const isShuffle = isBuiltIn && audioUrl.includes("shuffle=1");
        setContinuousShuffle(isShuffle && state?.status === "playing");

        const currentId = trackIdFromUrl(audioUrl);
        if (currentId) setSelectedId(currentId);
      } catch {
        // Optional sync only; the room can keep working without it.
      }
    };

    void syncMediaState();
    const timer = window.setInterval(syncMediaState, 2500);
    return () => window.clearInterval(timer);
  }, []);

  // Every visitor loops a single selected track, but shuffle-marked tracks are allowed to end
  // so the signed-in admin browser can advance the shared intermission to the next track.
  useEffect(() => {
    const applyLoopMode = () => {
      document.querySelectorAll<HTMLAudioElement>("audio").forEach((audio) => {
        if (!audio.src.includes("/api/kwentayo-music/")) return;
        audio.loop = !audio.src.includes("shuffle=1");
      });
    };

    applyLoopMode();
    const observer = new MutationObserver(applyLoopMode);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (role !== "admin") return;

    const attached = new Set<HTMLAudioElement>();

    const advance = async (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement;
      if (!shuffleRef.current || !audio.src.includes("shuffle=1") || advancingRef.current) return;

      advancingRef.current = true;
      const currentId = trackIdFromUrl(audio.src);
      const next = pickRandomTrack(currentId);
      setSelectedId(next.id);

      try {
        await startTrack(next.id, true, true);
      } finally {
        advancingRef.current = false;
      }
    };

    const attach = () => {
      document.querySelectorAll<HTMLAudioElement>("audio").forEach((audio) => {
        if (attached.has(audio)) return;
        if (!audio.src.includes("/api/kwentayo-music/") && !audio.closest(".stage-content")) return;
        audio.addEventListener("ended", advance);
        attached.add(audio);
      });
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      attached.forEach((audio) => audio.removeEventListener("ended", advance));
    };
  }, [role]);

  const selected = useMemo(
    () => KWENTAYO_MUSIC_LIBRARY.find((track) => track.id === selectedId) ?? KWENTAYO_MUSIC_LIBRARY[0],
    [selectedId],
  );

  async function startTrack(trackId: string, shuffleMode: boolean, automatic = false) {
    const track = KWENTAYO_MUSIC_LIBRARY.find((item) => item.id === trackId);
    if (!track) return false;

    if (!automatic) {
      setBusy(true);
      setNotice("");
    }

    try {
      const suffix = shuffleMode ? "?shuffle=1" : "";
      const audioUrl = `${window.location.origin}/api/kwentayo-music/${track.id}${suffix}`;
      const response = await fetch("/api/stage-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          title: track.title,
          kind: "music",
          audioUrl,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Unable to play this track.");

      if (!automatic) {
        setNotice(
          shuffleMode
            ? `Continuous shuffle is ON. ${track.title} is playing now.`
            : `Playing ${track.title} when the stage is empty.`,
        );
      }
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to play this track.");
      return false;
    } finally {
      if (!automatic) setBusy(false);
    }
  }

  async function playSelected() {
    setContinuousShuffle(false);
    shuffleRef.current = false;
    await startTrack(selected.id, false);
  }

  async function toggleShuffle() {
    if (continuousShuffle) {
      setContinuousShuffle(false);
      shuffleRef.current = false;
      await startTrack(selected.id, false);
      setNotice(`Continuous shuffle is OFF. ${selected.title} will loop.`);
      return;
    }

    const next = pickRandomTrack(selected.id);
    setSelectedId(next.id);
    setContinuousShuffle(true);
    shuffleRef.current = true;
    const started = await startTrack(next.id, true);
    if (!started) {
      setContinuousShuffle(false);
      shuffleRef.current = false;
    }
  }

  if (role !== "admin" || !host) return null;

  return createPortal(
    <div style={{
      marginTop: 12,
      padding: 10,
      border: "1px solid rgba(255,255,255,.14)",
      borderRadius: 6,
      background: "rgba(255,255,255,.035)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
        <strong style={{ fontSize: 13 }}>🎵 Kwentayo Music Library</strong>
        <span style={{ fontSize: 11, opacity: .7 }}>100 original instrumentals</span>
      </div>
      <select
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 7 }}
      >
        {KWENTAYO_MUSIC_LIBRARY.map((track) => (
          <option key={track.id} value={track.id}>
            {track.id}. {track.title} — {track.category}
          </option>
        ))}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        <button type="button" disabled={busy} onClick={() => void playSelected()}>
          {busy && !continuousShuffle ? "Loading..." : "▶ Play Selected"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleShuffle()}
          style={continuousShuffle ? { fontWeight: 700 } : undefined}
        >
          {continuousShuffle ? "⏹ Stop Shuffle" : "🔀 Continuous Shuffle"}
        </button>
      </div>
      <p style={{ margin: "7px 0 0", fontSize: 10, opacity: .68, lineHeight: 1.35 }}>
        {continuousShuffle
          ? "Shuffle is ON. A new random track starts automatically when each track ends. Leave this Admin browser tab open."
          : "Play Selected loops one track. Continuous Shuffle keeps choosing new tracks automatically. Custom audio below still works too."}
      </p>
      {notice && <p style={{ margin: "7px 0 0", fontSize: 11 }}>{notice}</p>}
    </div>,
    host,
  );
}
