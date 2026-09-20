"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type FacingMode = "user" | "environment";

type StageState = {
  current_user_id: string | null;
};

const STORAGE_KEY = "kwentayo-camera-facing";

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
}

export default function CameraLensControl() {
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  const [mobile, setMobile] = useState(false);
  const [facing, setFacing] = useState<FacingMode>("environment");
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    setMobile(isMobileDevice());

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "user" || saved === "environment") {
      setFacing(saved);
    } else {
      // Phones default to the rear camera for a better "show us your view" experience.
      window.localStorage.setItem(STORAGE_KEY, "environment");
    }
  }, []);

  useEffect(() => {
    const locate = () => {
      const host = document.querySelector<HTMLElement>(".stage-content");
      if (host) {
        if (window.getComputedStyle(host).position === "static") host.style.position = "relative";
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

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;
      setUserId(session?.user?.id ?? null);

      const { data } = await supabase
        .from("open_stage_state")
        .select("current_user_id")
        .eq("id", 1)
        .maybeSingle();

      if (!cancelled) setStage(data ?? null);
    };

    void load();
    const timer = window.setInterval(load, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!mobile || !navigator.mediaDevices?.getUserMedia) return;

    const mediaDevices = navigator.mediaDevices;
    const original = mediaDevices.getUserMedia.bind(mediaDevices);

    const patched: typeof mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      if (!constraints?.video) return original(constraints);

      const currentVideo =
        typeof constraints.video === "boolean" ? {} : { ...constraints.video };

      // Remove a previously remembered physical camera id so facingMode can
      // actually switch between the selfie and rear cameras on phones.
      delete currentVideo.deviceId;

      const nextVideo: MediaTrackConstraints = {
        ...currentVideo,
        facingMode: { ideal: facing },
      };

      return original({ ...constraints, video: nextVideo });
    };

    try {
      Object.defineProperty(mediaDevices, "getUserMedia", {
        configurable: true,
        writable: true,
        value: patched,
      });
    } catch {
      return;
    }

    return () => {
      try {
        Object.defineProperty(mediaDevices, "getUserMedia", {
          configurable: true,
          writable: true,
          value: original,
        });
      } catch {
        // Browser owns this API; nothing else is required if it cannot be restored.
      }
    };
  }, [mobile, facing]);

  const switchCamera = () => {
    const next: FacingMode = facing === "environment" ? "user" : "environment";
    setFacing(next);
    setChanged(true);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const isOnStage = !!userId && stage?.current_user_id === userId;
  if (!mobile || !stageHost || !isOnStage) return null;

  return createPortal(
    <div style={styles.wrap}>
      <button type="button" onClick={switchCamera} style={styles.button}>
        {facing === "environment" ? "🤳 Use Front Camera" : "📷 Use Back Camera"}
      </button>
      {changed && <span style={styles.tip}>Turn Camera Off, then On to switch.</span>}
    </div>,
    stageHost,
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    zIndex: 38,
    top: 12,
    right: 12,
    display: "grid",
    justifyItems: "end",
    gap: 5,
    pointerEvents: "auto",
  },
  button: {
    border: "1px solid rgba(255,255,255,.52)",
    borderRadius: 5,
    background: "rgba(32,18,43,.9)",
    color: "white",
    padding: "8px 10px",
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
  },
  tip: {
    maxWidth: 200,
    padding: "4px 7px",
    borderRadius: 4,
    background: "rgba(0,0,0,.72)",
    color: "white",
    fontSize: 9,
  },
};
