"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { KWENTAYO_MUSIC_LIBRARY } from "@/lib/kwentayo-music";

function pickRandomTrack(excludeId?: string) {
  const choices = excludeId
    ? KWENTAYO_MUSIC_LIBRARY.filter((track) => track.id !== excludeId)
    : KWENTAYO_MUSIC_LIBRARY;
  return choices[Math.floor(Math.random() * choices.length)] ?? KWENTAYO_MUSIC_LIBRARY[0];
}

function trackDurationMs(track: (typeof KWENTAYO_MUSIC_LIBRARY)[number]) {
  return Math.max(15000, Math.round((60 / track.tempo) * 64 * 1000));
}

export default function StaffMusicLibrary() {
  const [role, setRole] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState("001");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [continuousShuffle, setContinuousShuffle] = useState(false);
  const shuffleRef = useRef(false);
  const timerRef = useRef<number | null>(null);

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
    const applyLoop = () => {
      document.querySelectorAll<HTMLAudioElement>("audio").forEach((audio) => {
        if (audio.src.includes("/api/kwentayo-music/")) audio.loop = true;
      });
    };
    applyLoop();
    const observer = new MutationObserver(applyLoop);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const selected = useMemo(
    () => KWENTAYO_MUSIC_LIBRARY.find((track) => track.id === selectedId) ?? KWENTAYO_MUSIC_LIBRARY[0],
    [selectedId],
  );

  if (role !== "admin" || !host) return null;

  async function play(trackId = selected.id, automatic = false) {
    const track = KWENTAYO_MUSIC_LIBRARY.find((item) => item.id === trackId);
    if (!track) return false;

    if (!automatic) {
      setBusy(true);
      setNotice("");
    }

    try {
      const audioUrl = `${window.location.origin}/api/kwentayo-music/${track.id}`;
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
        setNotice(`Playing ${track.title} when the stage is empty.`);
      }
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to play this track.");
      return false;
    } finally {
      if (!automatic) setBusy(false);
    }
  }

  function scheduleNext(currentId: string) {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const current = KWENTAYO_MUSIC_LIBRARY.find((track) => track.id === currentId);
    if (!current) return;

    timerRef.current = window.setTimeout(async () => {
      if (!shuffleRef.current) return;
      const next = pickRandomTrack(currentId);
      setSelectedId(next.id);
      const ok = await play(next.id, true);
      if (ok && shuffleRef.current) {
        setNotice(`Continuous shuffle is ON. Now playing ${next.title}.`);
        scheduleNext(next.id);
      }
    }, trackDurationMs(current));
  }

  async function playSelected() {
    shuffleRef.current = false;
    setContinuousShuffle(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    await play(selected.id);
  }

  async function toggleShuffle() {
    if (continuousShuffle) {
      shuffleRef.current = false;
      setContinuousShuffle(false);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      setNotice("Continuous shuffle is OFF. The current track will keep looping.");
      return;
    }

    const first = pickRandomTrack(selected.id);
    setSelectedId(first.id);
    shuffleRef.current = true;
    setContinuousShuffle(true);
    const ok = await play(first.id, true);
    if (!ok) {
      shuffleRef.current = false;
      setContinuousShuffle(false);
      return;
    }
    setNotice(`Continuous shuffle is ON. Now playing ${first.title}.`);
    scheduleNext(first.id);
  }

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
          {busy ? "Loading..." : "▶ Play Selected"}
        </button>
        <button type="button" disabled={busy} onClick={() => void toggleShuffle()}>
          {continuousShuffle ? "⏹ Stop Shuffle" : "🔀 Continuous Shuffle"}
        </button>
      </div>
      <p style={{ margin: "7px 0 0", fontSize: 10, opacity: .68, lineHeight: 1.35 }}>
        {continuousShuffle
          ? "Continuous Shuffle is ON. A different track is selected automatically after each track interval. Keep this Admin tab open."
          : "Play Selected loops one track. Continuous Shuffle automatically rotates through the library. Custom audio below still works too."}
      </p>
      {notice && <p style={{ margin: "7px 0 0", fontSize: 11 }}>{notice}</p>}
    </div>,
    host,
  );
}
