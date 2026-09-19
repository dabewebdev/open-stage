"use client";

import { useEffect } from "react";

function findStageToggleButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
    const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text.includes("Stage On") || text.includes("Stage Off");
  }) ?? null;
}

function findStageVolumeSlider() {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="range"]')).find((input) => {
    let node: HTMLElement | null = input.parentElement;
    for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      const text = node.textContent?.replace(/\s+/g, " ") ?? "";
      if (text.includes("Stage Volume")) return true;
    }
    return false;
  }) ?? null;
}

function findIntermissionAudio() {
  const stageHost = document.querySelector<HTMLElement>(".stage-content");
  if (!stageHost) return null;
  return Array.from(stageHost.querySelectorAll<HTMLAudioElement>("audio")).find((audio) => {
    const src = audio.currentSrc || audio.src || "";
    return !!src;
  }) ?? null;
}

export default function IntermissionAudioBridge() {
  useEffect(() => {
    let stageToggle: HTMLButtonElement | null = null;
    let stageSlider: HTMLInputElement | null = null;
    let intermissionAudio: HTMLAudioElement | null = null;
    let stageOff = false;

    const apply = () => {
      stageToggle = findStageToggleButton();
      stageSlider = findStageVolumeSlider();
      intermissionAudio = findIntermissionAudio();

      if (!intermissionAudio) return;

      const toggleText = stageToggle?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      stageOff = toggleText.includes("Stage Off");

      const sliderValue = stageSlider ? Number(stageSlider.value) : 100;
      const normalizedVolume = Number.isFinite(sliderValue)
        ? Math.max(0, Math.min(1, sliderValue / 100))
        : 1;

      intermissionAudio.volume = normalizedVolume;
      intermissionAudio.muted = stageOff || normalizedVolume === 0;

      if (stageOff && !intermissionAudio.paused) {
        intermissionAudio.pause();
      }
    };

    const onInput = () => apply();
    const onClick = () => window.setTimeout(apply, 0);

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["src", "value"],
    });

    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("click", onClick, true);

    const guard = window.setInterval(() => {
      apply();
      if (stageOff && intermissionAudio && !intermissionAudio.paused) {
        intermissionAudio.pause();
      }
    }, 500);

    return () => {
      observer.disconnect();
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("click", onClick, true);
      window.clearInterval(guard);
    };
  }, []);

  return null;
}
