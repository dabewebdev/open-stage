"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { KWENTAYO_MUSIC_LIBRARY } from "@/lib/kwentayo-music";

export default function StaffMusicLibrary() {
  const [role, setRole] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState("001");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

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

  const selected = useMemo(
    () => KWENTAYO_MUSIC_LIBRARY.find((track) => track.id === selectedId) ?? KWENTAYO_MUSIC_LIBRARY[0],
    [selectedId],
  );

  if (role !== "admin" || !host) return null;

  async function play(trackId = selected.id) {
    const track = KWENTAYO_MUSIC_LIBRARY.find((item) => item.id === trackId);
    if (!track) return;
    setBusy(true);
    setNotice("");
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
      setNotice(`Playing ${track.title} when the stage is empty.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to play this track.");
    } finally {
      setBusy(false);
    }
  }

  function shuffle() {
    const next = KWENTAYO_MUSIC_LIBRARY[Math.floor(Math.random() * KWENTAYO_MUSIC_LIBRARY.length)];
    setSelectedId(next.id);
    void play(next.id);
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
        <button type="button" disabled={busy} onClick={() => void play()}>
          {busy ? "Loading..." : "▶ Play Selected"}
        </button>
        <button type="button" disabled={busy} onClick={shuffle}>
          🔀 Shuffle
        </button>
      </div>
      <p style={{ margin: "7px 0 0", fontSize: 10, opacity: .68, lineHeight: 1.35 }}>
        Built-in Kwentayo instrumental loops. No external audio link needed. Custom audio below still works too.
      </p>
      {notice && <p style={{ margin: "7px 0 0", fontSize: 11 }}>{notice}</p>}
    </div>,
    host,
  );
}
