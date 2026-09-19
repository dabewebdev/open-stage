"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type StageState = {
  current_user_id: string | null;
};

type PublicCam = {
  name: string;
  mood: string;
  url: string;
};

/*
 * Curated, public-domain USGS webcam images. We intentionally keep this list
 * to sources we have verified and that do not require an iframe/login.
 * Add more verified sources here over time without changing the player logic.
 */
const CAMS: PublicCam[] = [
  {
    name: "Mokuʻāweoweo Caldera · Hawaiʻi",
    mood: "Sunrise · high mountain calm",
    url: "https://volcanoes.usgs.gov/observatories/hvo/cams/MLcam/images/M.jpg",
  },
  {
    name: "Mauna Loa from Hualālai · Hawaiʻi",
    mood: "Clouds · wide open sky",
    url: "https://volcanoes.usgs.gov/cams/HLcam/images/M.jpg",
  },
  {
    name: "Kīlauea Caldera · Hawaiʻi",
    mood: "Mist · quiet volcanic landscape",
    url: "https://volcanoes.usgs.gov/cams/V2cam/images/M.jpg",
  },
  {
    name: "Mauna Loa from Mauna Kea · Hawaiʻi",
    mood: "Mountain air · distant horizon",
    url: "https://volcanoes.usgs.gov/cams/MK2cam/images/M.jpg",
  },
  {
    name: "Mauna Loa Ridge · Hawaiʻi",
    mood: "Fog · slow changing weather",
    url: "https://volcanoes.usgs.gov/observatories/hvo/cams/MKcam/images/M.jpg",
  },
  {
    name: "Mauna Ulu · Hawaiʻi",
    mood: "Night sky · peaceful darkness",
    url: "https://volcanoes.usgs.gov/observatories/hvo/cams/MUcam/images/M.jpg",
  },
  {
    name: "Kīlauea · Hawaiʻi",
    mood: "Volcanic landscape · near-live",
    url: "https://volcview.wr.usgs.gov/ashcam-api/images/webcams/kilauea-b1-cam/current.jpg",
  },
  {
    name: "Redoubt Volcano · Alaska",
    mood: "Alaska · quiet mountain weather",
    url: "https://volcview.wr.usgs.gov/ashcam-api/images/webcams/redoubt-2/current.jpg",
  },
];

const ROTATE_EVERY_MS = 90_000;
const REFRESH_EVERY_MS = 20_000;

export default function PublicCamFallback() {
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  const [camIndex, setCamIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [paused, setPaused] = useState(false);

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

  useEffect(() => {
    if (stage?.current_user_id) return;
    const timer = window.setInterval(() => setRefreshKey(Date.now()), REFRESH_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [stage?.current_user_id]);

  useEffect(() => {
    if (stage?.current_user_id || paused) return;
    const timer = window.setInterval(() => {
      setCamIndex((current) => (current + 1) % CAMS.length);
      setRefreshKey(Date.now());
    }, ROTATE_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [stage?.current_user_id, paused]);

  const nextCam = () => {
    setCamIndex((current) => (current + 1) % CAMS.length);
    setRefreshKey(Date.now());
  };

  const cam = CAMS[camIndex];
  const src = useMemo(() => `${cam.url}${cam.url.includes("?") ? "&" : "?"}t=${refreshKey}`, [cam, refreshKey]);

  if (!stageHost || stage?.current_user_id) return null;

  return createPortal(
    <div style={styles.wrap}>
      <img
        key={src}
        src={src}
        alt={`Near-live public webcam view from ${cam.name}`}
        style={styles.image}
        onError={nextCam}
      />
      <div style={styles.shade} />

      <div style={styles.badge}>● RELAX CAM · {cam.name}</div>

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
          <strong>Window to the world</strong>
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
    background: "linear-gradient(180deg, rgba(0,0,0,.16), transparent 45%, rgba(0,0,0,.58))",
  },
  badge: {
    position: "absolute",
    top: 12,
    left: 12,
    padding: "5px 8px",
    borderRadius: 4,
    background: "rgba(0,0,0,.66)",
    color: "white",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: ".06em",
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
