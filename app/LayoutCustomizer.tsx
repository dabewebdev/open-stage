"use client";

import { useEffect, useMemo, useState } from "react";

type LayoutMode = "auto" | "three" | "two" | "one";

type LayoutSettings = {
  mode: LayoutMode;
  leftWidth: number;
  rightWidth: number;
  stageHeight: number;
  chatHeight: number;
  peopleHeight: number;
};

const STORAGE_KEY = "kwentayo-layout-settings-v1";

const DEFAULTS: LayoutSettings = {
  mode: "auto",
  leftWidth: 300,
  rightWidth: 330,
  stageHeight: 390,
  chatHeight: 360,
  peopleHeight: 520,
};

export default function LayoutCustomizer() {
  const [open, setOpen] = useState(false);
  const [roomVisible, setRoomVisible] = useState(false);
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<LayoutSettings>;
        setSettings({ ...DEFAULTS, ...parsed });
      }
    } catch {
      // Ignore malformed old local settings and use responsive defaults.
    }
  }, []);

  useEffect(() => {
    const check = () => setRoomVisible(!!document.querySelector(".workspace"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.kwLayout = settings.mode;
    root.style.setProperty("--kw-left-width", `${settings.leftWidth}px`);
    root.style.setProperty("--kw-right-width", `${settings.rightWidth}px`);
    root.style.setProperty("--kw-stage-height", `${settings.stageHeight}px`);
    root.style.setProperty("--kw-chat-height", `${settings.chatHeight}px`);
    root.style.setProperty("--kw-people-height", `${settings.peopleHeight}px`);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const css = useMemo(
    () => `
      /* Personal Kwentayo layout overrides. These affect only this browser. */
      .workspace {
        align-items: start !important;
        flex: 0 0 auto !important;
      }

      .people-window {
        min-height: 0 !important;
        height: var(--kw-people-height, clamp(360px, 56vh, 690px));
        max-height: calc(100vh - 150px);
      }

      .stage-content {
        min-height: 0 !important;
        height: var(--kw-stage-height, clamp(280px, 38vh, 430px));
      }

      .chat-window {
        flex: none !important;
        min-height: 0 !important;
        height: var(--kw-chat-height, clamp(320px, 38vh, 480px));
      }

      .chat-messages {
        min-height: 0 !important;
        max-height: none !important;
        flex: 1 1 auto !important;
      }

      html[data-kw-layout="auto"] .workspace {
        grid-template-columns: clamp(230px, 16vw, var(--kw-left-width)) minmax(430px, 1fr) clamp(280px, 18vw, var(--kw-right-width));
      }

      html[data-kw-layout="three"] .workspace {
        grid-template-columns: var(--kw-left-width) minmax(360px, 1fr) var(--kw-right-width) !important;
      }

      html[data-kw-layout="two"] .workspace {
        grid-template-columns: var(--kw-left-width) minmax(0, 1fr) !important;
      }
      html[data-kw-layout="two"] .right-column {
        grid-column: 1 / -1 !important;
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
      }

      html[data-kw-layout="one"] .workspace {
        grid-template-columns: 1fr !important;
      }
      html[data-kw-layout="one"] .people-window,
      html[data-kw-layout="one"] .center-column,
      html[data-kw-layout="one"] .right-column {
        grid-column: auto !important;
      }
      html[data-kw-layout="one"] .right-column {
        display: flex !important;
      }

      @media (max-width: 1050px) {
        html[data-kw-layout="auto"] .workspace {
          grid-template-columns: min(var(--kw-left-width), 28vw) minmax(0, 1fr) !important;
        }
        html[data-kw-layout="auto"] .right-column {
          grid-column: 1 / -1 !important;
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
        }
      }

      @media (max-width: 720px) {
        .kw-layout-launcher { display: none !important; }
        html[data-kw-layout] .workspace { grid-template-columns: 1fr !important; }
        html[data-kw-layout] .people-window,
        html[data-kw-layout] .center-column,
        html[data-kw-layout] .right-column { grid-column: auto !important; }
        html[data-kw-layout] .right-column { display: flex !important; }
        .people-window { height: min(var(--kw-people-height), 420px); }
      }
    `,
    [],
  );

  function update<K extends keyof LayoutSettings>(key: K, value: LayoutSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(name: "compact" | "balanced" | "bigStage" | "portrait") {
    const presets: Record<typeof name, LayoutSettings> = {
      compact: { mode: "three", leftWidth: 230, rightWidth: 270, stageHeight: 280, chatHeight: 300, peopleHeight: 440 },
      balanced: { mode: "auto", leftWidth: 300, rightWidth: 330, stageHeight: 390, chatHeight: 360, peopleHeight: 520 },
      bigStage: { mode: "three", leftWidth: 240, rightWidth: 280, stageHeight: 520, chatHeight: 300, peopleHeight: 520 },
      portrait: { mode: "one", leftWidth: 260, rightWidth: 300, stageHeight: 420, chatHeight: 420, peopleHeight: 360 },
    };
    setSettings(presets[name]);
  }

  if (!roomVisible) return <style>{css}</style>;

  return (
    <>
      <style>{css}</style>
      <button
        type="button"
        className="kw-layout-launcher"
        onClick={() => setOpen((value) => !value)}
        title="Adjust this room for your monitor"
        style={styles.launcher}
      >
        ⚙ Layout
      </button>

      {open && (
        <aside style={styles.panel} aria-label="Personal room layout controls">
          <div style={styles.panelHead}>
            <div>
              <strong style={styles.heading}>My Layout</strong>
              <div style={styles.subheading}>Only changes this device</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={styles.closeButton}>×</button>
          </div>

          <div style={styles.presetRow}>
            <button type="button" style={styles.smallButton} onClick={() => applyPreset("compact")}>Compact</button>
            <button type="button" style={styles.smallButton} onClick={() => applyPreset("balanced")}>Balanced</button>
            <button type="button" style={styles.smallButton} onClick={() => applyPreset("bigStage")}>Big Stage</button>
            <button type="button" style={styles.smallButton} onClick={() => applyPreset("portrait")}>Portrait</button>
          </div>

          <label style={styles.label}>
            Columns
            <select value={settings.mode} onChange={(event) => update("mode", event.target.value as LayoutMode)} style={styles.select}>
              <option value="auto">Auto for my screen</option>
              <option value="three">3 columns</option>
              <option value="two">2 columns</option>
              <option value="one">1 column</option>
            </select>
          </label>

          <Slider label="Who's Here width" value={settings.leftWidth} min={180} max={460} onChange={(v) => update("leftWidth", v)} />
          <Slider label="Right panel width" value={settings.rightWidth} min={220} max={520} onChange={(v) => update("rightWidth", v)} />
          <Slider label="Stage height" value={settings.stageHeight} min={220} max={700} onChange={(v) => update("stageHeight", v)} />
          <Slider label="Live Chat height" value={settings.chatHeight} min={240} max={700} onChange={(v) => update("chatHeight", v)} />
          <Slider label="Who's Here height" value={settings.peopleHeight} min={260} max={800} onChange={(v) => update("peopleHeight", v)} />

          <button type="button" style={styles.resetButton} onClick={() => setSettings(DEFAULTS)}>
            Reset to responsive default
          </button>
        </aside>
      )}
    </>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label style={styles.sliderLabel}>
      <span style={styles.sliderTitle}><span>{label}</span><strong>{value}px</strong></span>
      <input
        type="range"
        min={min}
        max={max}
        step={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={styles.range}
      />
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  launcher: {
    position: "fixed",
    left: 14,
    bottom: 92,
    zIndex: 80,
    border: "1px solid #3b106d",
    borderRadius: 5,
    background: "linear-gradient(#7134b4, #4e178b)",
    color: "white",
    padding: "8px 11px",
    fontSize: 12,
    fontWeight: 800,
    boxShadow: "0 2px 8px rgba(0,0,0,.28)",
  },
  panel: {
    position: "fixed",
    left: 14,
    bottom: 132,
    zIndex: 90,
    width: "min(340px, calc(100vw - 28px))",
    maxHeight: "calc(100vh - 165px)",
    overflowY: "auto",
    padding: 12,
    border: "1px solid #4d2c7e",
    borderRadius: 7,
    background: "rgba(248,248,250,.98)",
    boxShadow: "0 10px 28px rgba(0,0,0,.28)",
    color: "#201331",
  },
  panelHead: { display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10, marginBottom: 10 },
  heading: { fontSize: 16, color: "#4c177f" },
  subheading: { marginTop: 2, fontSize: 10, color: "#716879" },
  closeButton: { border: 0, background: "transparent", color: "#4c177f", fontSize: 22, lineHeight: 1, cursor: "pointer" },
  presetRow: { display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 11 },
  smallButton: { border: "1px solid #9b8cac", borderRadius: 4, background: "linear-gradient(#fff,#e5e1ea)", color: "#28126c", padding: "5px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" },
  label: { display: "grid", gap: 4, marginBottom: 10, fontSize: 11, fontWeight: 700 },
  select: { width: "100%", border: "1px solid #9b8cac", borderRadius: 4, background: "white", padding: "7px", color: "#201331", fontSize: 11 },
  sliderLabel: { display: "grid", gap: 4, marginBottom: 9 },
  sliderTitle: { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 },
  range: { width: "100%", accentColor: "#5a1f9e" },
  resetButton: { width: "100%", marginTop: 5, border: "1px solid #8f8999", borderRadius: 4, background: "linear-gradient(#fff,#dedce5)", color: "#21136f", padding: "7px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
};
