"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type StageState = {
  current_user_id: string | null;
};

const CAMS = [
  {
    name: "USGS Kīlauea, Hawaiʻi",
    url: "https://volcview.wr.usgs.gov/ashcam-api/images/webcams/kilauea-b1-cam/current.jpg",
  },
  {
    name: "USGS Redoubt Volcano, Alaska",
    url: "https://volcview.wr.usgs.gov/ashcam-api/images/webcams/redoubt-2/current.jpg",
  },
];

export default function PublicCamFallback() {
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  const [camIndex, setCamIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(Date.now());

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
    const timer = window.setInterval(() => setRefreshKey(Date.now()), 20000);
    return () => window.clearInterval(timer);
  }, [stage?.current_user_id]);

  const cam = CAMS[camIndex];
  const src = useMemo(() => `${cam.url}?t=${refreshKey}`, [cam, refreshKey]);

  if (!stageHost || stage?.current_user_id) return null;

  return createPortal(
    <div style={styles.wrap}>
      <img
        key={src}
        src={src}
        alt={`Near-live public webcam view from ${cam.name}`}
        style={styles.image}
        onError={() => {
          setCamIndex((current) => (current + 1) % CAMS.length);
          setRefreshKey(Date.now());
        }}
      />
      <div style={styles.shade} />
      <div style={styles.badge}>● PUBLIC CAM · {cam.name}</div>
      <div style={styles.footer}>
        <strong>Window to the world</strong>
        <span>Near-live public-domain view · refreshes automatically</span>
        <span>Stage is open — join the line anytime.</span>
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
    background: "linear-gradient(180deg, rgba(0,0,0,.15), transparent 48%, rgba(0,0,0,.5))",
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
  footer: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "9px 11px",
    borderRadius: 5,
    background: "rgba(0,0,0,.6)",
    color: "white",
    fontSize: 11,
  },
};
