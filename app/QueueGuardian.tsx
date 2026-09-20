"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

type QueuePerson = {
  id: number;
  user_id: string;
  nickname: string;
  joined_at: string;
};

type StageState = {
  current_user_id: string | null;
};

const OFFLINE_GRACE_MS = 20_000;

export default function QueueGuardian() {
  const offlineSinceRef = useRef<Map<string, number>>(new Map());
  const cleanupInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let userId = "";
    let accessToken = "";
    let onlineIds = new Set<string>();

    // Join the same Realtime topic as the room so we can see who is actually
    // present. This channel does not track a second presence record; it only
    // listens to the room's existing presence state.
    const channel = supabase.channel("open-stage-room");

    const readPresence = () => {
      const next = new Set<string>();
      const state = channel.presenceState();

      Object.values(state).forEach((entries) => {
        entries.forEach((entry) => {
          const person = entry as unknown as { user_id?: string };
          if (person.user_id) next.add(person.user_id);
        });
      });

      onlineIds = next;
    };

    channel.on("presence", { event: "sync" }, readPresence).subscribe();

    const loadIdentity = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      userId = session?.user?.id ?? "";
      accessToken = session?.access_token ?? "";
    };

    const sweep = async () => {
      if (cancelled || cleanupInFlightRef.current) return;
      await loadIdentity();
      if (!userId || !accessToken) return;

      const [{ data: stage }, { data: queue }] = await Promise.all([
        supabase
          .from("open_stage_state")
          .select("current_user_id")
          .eq("id", 1)
          .maybeSingle<StageState>(),
        supabase
          .from("open_stage_queue")
          .select("id,user_id,nickname,joined_at")
          .order("joined_at", { ascending: true })
          .returns<QueuePerson[]>(),
      ]);

      if (stage?.current_user_id || !queue || queue.length < 2) {
        offlineSinceRef.current.clear();
        return;
      }

      const first = queue[0];
      const callerIndex = queue.findIndex((item) => item.user_id === userId);

      // Only people already waiting behind the stale first spot can trigger
      // cleanup. This keeps a random visitor from changing the queue.
      if (callerIndex < 1) return;

      if (onlineIds.has(first.user_id)) {
        offlineSinceRef.current.delete(first.user_id);
        return;
      }

      const now = Date.now();
      const firstSeenOffline = offlineSinceRef.current.get(first.user_id) ?? now;
      offlineSinceRef.current.set(first.user_id, firstSeenOffline);

      if (now - firstSeenOffline < OFFLINE_GRACE_MS) return;

      cleanupInFlightRef.current = true;
      try {
        await fetch("/api/queue-skip-offline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, staleUserId: first.user_id }),
        });
      } catch (error) {
        console.error("Queue guardian cleanup error:", error);
      } finally {
        cleanupInFlightRef.current = false;
        offlineSinceRef.current.delete(first.user_id);
      }
    };

    void loadIdentity();
    const timer = window.setInterval(() => void sweep(), 4_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
