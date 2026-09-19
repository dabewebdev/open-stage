"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type StageState = {
  current_user_id: string | null;
};

type CamCategory = "nature" | "city" | "mixed";

type PublicCam = {
  name: string;
  mood: string;
  category: Exclude<CamCategory, "mixed">;
  url: string;
};

/*
 * The idle stage intentionally uses image-based public cameras rather than
 * third-party video embeds. This keeps the room lightweight for visitors and
 * lets a failed source fall through to the next view without affecting chat,
 * presence, or LiveKit stage audio/video.
 */
const CAMS: PublicCam[] = [
  {
    name: "Mokuʻāweoweo Caldera · Hawaiʻi",
    mood: "Sunrise · high mountain calm",
    category: "nature",
    url: "https://volcanoes.usgs.gov/observatories/hvo/cams/MLcam/images/M.jpg",
  },
  {
    name: "Mauna Loa from Hualālai · Hawaiʻi",
    mood: "Clouds · wide open sky",
    category: "nature",
    url: "https://volcanoes.usgs.gov/cams/HLcam/images/M.jpg",
  },
  {
    name: "Kīlauea Caldera · Hawaiʻi",
    mood: "Mist · quiet volcanic landscape",
    category: "nature",
    url: "https://volcanoes.usgs.gov/cams/V2cam/images/M.jpg",
  },
  {
    name: "Mauna Loa from Mauna Kea · Hawaiʻi",
    mood: "Mountain air · distant horizon",
    category: "nature",
    url: "https://volcanoes.usgs.gov/cams/MK2cam/images/M.jpg",
  },
  {
    name: "Mauna Loa Ridge · Hawaiʻi",
    mood: "Fog · slow changing weather",
    category: "nature",
    url: "https://volcanoes.usgs.gov/observatories/hvo/cams/MKcam/images/M.jpg",
  },
  {
    name: "Mauna Ulu · Hawaiʻi",
    mood: "Night sky · peaceful darkness",
    category: "nature",
    url: "https://volcanoes.usgs.gov/observatories/hvo/cams/MUcam/images/M.jpg",
  },
  {
    name: "Kīlauea · Hawaiʻi",
    mood: "Volcanic landscape · near-live",
    category: "nature",
    url: "https://volcview.wr.usgs.gov/ashcam-api/images/webcams/kilauea-b1-cam/current.jpg",
  },
  {
    name: "Redoubt Volcano · Alaska",
    mood: "Alaska · quiet mountain weather",
    category: "nature",
    url: "https://volcview.wr.usgs.gov/ashcam-api/images/webcams/redoubt-2/current.jpg",
  },
  {
    name: "Bay Bridge · San Francisco",
    mood: "City movement · bridge traffic and skyline",
    category: "city",
    url: "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd32i80baybridgesastowereast/tvd32i80baybridgesastowereast.jpg",
  },
  {
    name: "SR-238 · Bay Area",
    mood: "Busy street · everyday urban movement",
    category: "city",
    url: "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv709sr238southofashlandavenue/tv709sr238southofashlandavenue.jpg",
  },
  {
    name: "US-101 at Ventura Blvd · Los Angeles",
    mood: "Los Angeles · traffic and city energy",
    category: "city",
    url: "https://cwwp2.dot.ca.gov/data/d7/cctv/image/us101atventurabl/us101atventurabl.jpg",
  },
];

const ROTATE_EVERY_MS = 90_000;
const REFRESH_EVERY_MS = 20_000;

export default function PublicCamFallback() {
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  const [category, setCategory] = useState<CamCategory>("nature");
  const [camIndex, setCamIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("kwentayo-cam-category");
    if (saved === "nature" || saved === "city" || saved === "mixed") {
      setCategory(saved);
    }
  }, []);

  useEffect(() => {
    const locate = () => {
      const host = document.querySelector<HTMLElement>(".stage-content");
      if (host) {
        if (window.getComputedStyle(host).position === "static") host.style.position = "relative";
        host.style.overflow = "hidden";
        setStageHost(host);
      }
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadStage = async () => {
      const { data, error } = await supabase
        .from("open_stage_state")
        .select("current_user_id")
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

  const activeCams = useMemo(
    () => (category === "mixed" ? CAMS : CAMS.filter((cam) => cam.category === category)),
    [category],
  );

  useEffect(() => {
    setCamIndex(0);
    setRefreshKey(Date.now());
  }, [category]);

  useEffect(() => {
    if (stage?.current_user_id) return;
    const timer = window.setInterval(() => setRefreshKey(Date.now()), REFRESH_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [stage?.current_user_id]);

  useEffect(() => {
    if (stage?.current_user_id || paused || activeCams.length < 2) return;
    const timer = window.setInterval(() => {
      setCamIndex((current) => (current + 1) % activeCams.length);
      setRefreshKey(Date.now());
    }, ROTATE_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [stage?.current_user_id, paused, activeCams.length]);

  const nextCam = () => {
    if (!activeCams.length) return;
    setCamIndex((current) => (current + 1) % activeCams.length);
    setRefreshKey(Date.now());
  };

  const changeCategory = (next: CamCategory) => {
    setCategory(next);
    setPaused(false);
    window.localStorage.setItem("kwentayo-cam-category", next);
  };

  const cam = activeCams[camIndex] ?? activeCams[0] ?? CAMS[0];
  const src = useMemo(
    () => `${cam.url}${cam.url.includes("?") ? "&" : "?"}t=${refreshKey}`,
    [cam, refreshKey],
  );

  if (!stageHost || stage?.current_user_id) return null;

  return createPortal(
    <div style={styles.wrap}>
      <img
        key={src}
        src={src}
        alt={`Near-live public camera view from ${cam.name}`}
        style={styles.image}
        onError={nextCam}
      />
      <div style={styles.shade} />

      <div style={styles.badge}>
        ● {cam.category === "nature" ? "RELAXING NATURE" : "CITY LIFE"} · {cam.name}
      </div>

      <div style={styles.categoryBar} aria-label="Public camera category">
        <button
          type="button"
          onClick={() => changeCategory("nature")}
          style={{ ...styles.categoryButton, ...(category === "nature" ? styles.categoryActive : {}) }}
        >
          🌿 Relaxing Nature
        </button>
        <button
          type="button"
          onClick={() => changeCategory("city")}
          style={{ ...styles.categoryButton, ...(category === "city" ? styles.categoryActive : {}) }}
        >
          🏙 Busy Streets
        </button>
        <button
          type="button"
          onClick={() => changeCategory("mixed")}
          style={{ ...styles.categoryButton, ...(category === "mixed" ? styles.categoryActive : {}) }}
        >
          🔀 Mixed
        </button>
      </div>

      <div style={styles.controls}>
        <button type="button" onClick={nextCam} style={styles.controlButton}>
          Next View ›
        </button>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          style={styles.controlButton}
        >
          {paused ? "Resume Rotation" : "Hold This View"}
        </button>
      </div>

      <div style={styles.footer}>
        <div style={styles.footerLeft}>
          <strong>{category === "nature" ? "Window to the world" : category === "city" ? "City life right now" : "Around the world"}</strong>
          <span>{cam.mood}</span>
        </div>
        <div style={styles.footerRight}>
          <span>{paused ? "View held" : "Changes every 90 seconds"}</span>
          <span>Stage is open — join the line anytime.</span>
        </div>
      </div>
    </div>,
    stageHost,
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    inset: 0,
    zIndex: 25,
    overflow: "hidden",
    background: "#090b10",
  },
  image: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    background: "#090b10",
  },
  shade: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: "linear-gradient(180deg, rgba(0,0,0,.2), transparent 45%, rgba(0,0,0,.62))",
  },
  badge: {
    position: "absolute",
    top: 12,
    left: 12,
    maxWidth: "55%",
    padding: "5px 8px",
    borderRadius: 4,
    background: "rgba(0,0,0,.66)",
    color: "white",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: ".05em",
  },
  categoryBar: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 44,
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  categoryButton: {
    border: "1px solid rgba(255,255,255,.35)",
    borderRadius: 999,
    background: "rgba(0,0,0,.5)",
    color: "rgba(255,255,255,.88)",
    padding: "5px 9px",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
    backdropFilter: "blur(4px)",
  },
  categoryActive: {
    background: "rgba(72,35,96,.9)",
    borderColor: "rgba(230,196,255,.85)",
    color: "white",
  },
  controls: {
    position: "absolute",
    top: 10,
    right: 10,
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  controlButton: {
    border: "1px solid rgba(255,255,255,.42)",
    borderRadius: 4,
    background: "rgba(0,0,0,.58)",
    color: "white",
    padding: "6px 8px",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  footer: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "9px 11px",
    borderRadius: 5,
    background: "rgba(0,0,0,.6)",
    color: "white",
    fontSize: 11,
  },
  footerLeft: {
    display: "grid",
    gap: 2,
  },
  footerRight: {
    display: "grid",
    gap: 2,
    textAlign: "right",
    opacity: 0.9,
  },
};
