"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { RemoteTrack, Room, RoomEvent, Track } from "livekit-client";

import { supabase } from "@/lib/supabase/client";

type PresencePerson = {
  user_id: string;
  nickname: string;
  online_at: string;
};

type QueuePerson = {
  id: number;
  user_id: string;
  nickname: string;
  talent: string;
  joined_at: string;
};

type ChatMessage = {
  id: number;
  user_id: string;
  nickname: string;
  message: string;
  created_at: string;
};

type StageState = {
  id: number;
  current_user_id: string | null;
  current_nickname: string | null;
  started_at: string | null;
};

type AudioStatus = "disconnected" | "connecting" | "connected" | "error";

type RadioStation = {
  stationuuid: string;
  name: string;
  country: string;
  countrycode: string;
  favicon: string;
  url_resolved: string;
  codec: string;
  bitrate: number;
};

export default function Home() {
  const [nicknameInput, setNicknameInput] = useState("");
  const [nickname, setNickname] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);

  const [people, setPeople] = useState<PresencePerson[]>([]);
  const [queue, setQueue] = useState<QueuePerson[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [stageState, setStageState] = useState<StageState | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [audioStatus, setAudioStatus] = useState<AudioStatus>("disconnected");

  const [microphoneLive, setMicrophoneLive] = useState(false);

  const [microphoneStarting, setMicrophoneStarting] = useState(false);
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const [micHelp, setMicHelp] = useState(false);

  const [stageAudioLevel, setStageAudioLevel] = useState(0);
  const [stageSecondsLeft, setStageSecondsLeft] = useState(10 * 60);
  const autoEndRef = useRef(false);
  const [stageMuted, setStageMuted] = useState(false);
  const [stageVolume, setStageVolume] = useState(100);

  const [needsAudioStart, setNeedsAudioStart] = useState(false);

  const [radioCountries, setRadioCountries] = useState<string[]>([]);
  const [radioCountry, setRadioCountry] = useState("Philippines");
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);
  const [radioIndex, setRadioIndex] = useState(0);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioLoading, setRadioLoading] = useState(true);
  const [radioError, setRadioError] = useState("");
  const [radioVolume, setRadioVolume] = useState(55);
  const radioRef = useRef<HTMLAudioElement | null>(null);

  const roomRef = useRef<Room | null>(null);

  const audioContainerRef = useRef<HTMLDivElement | null>(null);

  const accessTokenRef = useRef<string | null>(null);

  const radioStation = radioStations[radioIndex] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function restoreRoomSession() {
      try {
        const savedNickname = window.localStorage.getItem("open-stage-nickname");
        if (!savedNickname) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user || cancelled) return;

        accessTokenRef.current = session.access_token;
        setUserId(session.user.id);
        setNickname(savedNickname);
        setNicknameInput(savedNickname);
        setJoined(true);
      } catch (error) {
        console.error("Restore room session error:", error);
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    }

    restoreRoomSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("open-stage-theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      window.localStorage.setItem("open-stage-theme", next);
      return next;
    });
  }

  function applyStageAudioSettings(muted: boolean, volume: number) {
    const container = audioContainerRef.current;
    if (!container) return;

    container.querySelectorAll("audio").forEach((element) => {
      const audio = element as HTMLAudioElement;
      audio.muted = muted;
      audio.volume = Math.max(0, Math.min(1, volume / 100));
    });
  }

  function toggleStageMute() {
    const next = !stageMuted;
    setStageMuted(next);
    applyStageAudioSettings(next, stageVolume);
  }

  function changeStageVolume(value: number) {
    setStageVolume(value);
    if (value > 0 && stageMuted) setStageMuted(false);
    applyStageAudioSettings(value === 0 ? true : false, value);
  }

  useEffect(() => {
    applyStageAudioSettings(stageMuted, stageVolume);
  }, [stageMuted, stageVolume]);

  const inQueue = !!userId && queue.some((person) => person.user_id === userId);

  const isOnStage = !!userId && stageState?.current_user_id === userId;

  const firstInQueue = queue[0] ?? null;

  const canTakeStage =
    !!userId &&
    !stageState?.current_user_id &&
    firstInQueue?.user_id === userId;

  const STAGE_LIMIT_SECONDS = 10 * 60;

  useEffect(() => {
    autoEndRef.current = false;

    if (!stageState?.current_user_id || !stageState.started_at) {
      setStageSecondsLeft(STAGE_LIMIT_SECONDS);
      return;
    }

    const updateTimer = () => {
      const started = new Date(stageState.started_at as string).getTime();
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setStageSecondsLeft(Math.max(0, STAGE_LIMIT_SECONDS - elapsed));
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [stageState?.current_user_id, stageState?.started_at]);

  useEffect(() => {
    if (!stageState?.current_user_id || stageSecondsLeft > 0 || autoEndRef.current) return;

    autoEndRef.current = true;

    async function expireStage() {
      try {
        const response = await fetch("/api/stage-expire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedUserId: stageState?.current_user_id,
            expectedStartedAt: stageState?.started_at,
          }),
        });

        if (!response.ok) {
          autoEndRef.current = false;
          return;
        }

        if (isOnStage) {
          const room = roomRef.current;
          if (room) {
            await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          }
          setMicrophoneLive(false);
        }

        await loadStageState();
        await loadQueue();
      } catch (error) {
        console.error("Stage expiry error:", error);
        autoEndRef.current = false;
      }
    }

    void expireStage();
  }, [
    stageSecondsLeft,
    stageState?.current_user_id,
    stageState?.started_at,
    isOnStage,
  ]);

  const timerTone =
    stageSecondsLeft <= 30
      ? "danger"
      : stageSecondsLeft <= 120
        ? "warning"
        : "normal";

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Your guest session has expired.");
    }

    accessTokenRef.current = session.access_token;

    return session.access_token;
  }

  async function loadMessages() {
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabase
      .from("open_stage_messages")
      .select("*")
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", {
        ascending: true,
      })
      .limit(100);

    if (error) {
      console.error("Messages error:", error);
      return;
    }

    setMessages(data ?? []);
  }

  async function loadQueue() {
    const { data, error } = await supabase
      .from("open_stage_queue")
      .select("*")
      .order("joined_at", {
        ascending: true,
      });

    if (error) {
      console.error("Queue error:", error);
      return;
    }

    setQueue(data ?? []);
  }

  async function loadStageState() {
    const { data, error } = await supabase
      .from("open_stage_state")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Stage state error:", error);
      return;
    }

    setStageState(data);
  }

  async function enterRoom(event: FormEvent) {
    event.preventDefault();

    const cleanName = nicknameInput.trim();

    if (!cleanName) return;

    setJoining(true);
    setErrorMessage("");

    try {
      let currentUserId: string | null = null;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        currentUserId = session.user.id;
        accessTokenRef.current = session.access_token;
      } else {
        const { data, error } = await supabase.auth.signInAnonymously();

        if (error) {
          throw error;
        }

        currentUserId = data.user?.id ?? null;

        accessTokenRef.current = data.session?.access_token ?? null;
      }

      if (!currentUserId) {
        throw new Error("Could not create your guest session.");
      }

      setUserId(currentUserId);
      setNickname(cleanName);
      window.localStorage.setItem("open-stage-nickname", cleanName);
      setJoined(true);
    } catch (error) {
      console.error("Enter room error:", error);

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to enter Kwentayo.",
      );
    } finally {
      setJoining(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();

    const cleanMessage = chatInput.trim();

    if (!cleanMessage || !userId) {
      return;
    }

    const { error } = await supabase.from("open_stage_messages").insert({
      user_id: userId,
      nickname,
      message: cleanMessage,
    });

    if (error) {
      setErrorMessage("Your message could not be sent.");

      return;
    }

    setChatInput("");
  }

  async function getInLine() {
    if (!userId || inQueue || isOnStage) {
      return;
    }

    const { error } = await supabase.from("open_stage_queue").insert({
      user_id: userId,
      nickname,
      talent: "Waiting to perform",
    });

    if (error) {
      setErrorMessage("You could not join the queue.");
    }
  }

  async function leaveLine() {
    if (!userId || !inQueue) {
      return;
    }

    const { error } = await supabase
      .from("open_stage_queue")
      .delete()
      .eq("user_id", userId);

    if (error) {
      setErrorMessage("You could not leave the queue.");
    }
  }

  async function setServerPublishPermission(action: "enable" | "disable") {
    const accessToken = await getAccessToken();

    const response = await fetch("/api/livekit-stage-permission", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        accessToken,
        action,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Unable to update microphone permission.",
      );
    }
  }

  async function waitForPublishPermission() {
    const room = roomRef.current;

    if (!room) {
      throw new Error("Live audio is not connected.");
    }

    if (room.localParticipant.permissions?.canPublish) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        room.off(RoomEvent.ParticipantPermissionsChanged, handler);

        reject(new Error("Microphone permission took too long."));
      }, 5000);

      const handler = (
        _previousPermissions: unknown,
        participant: {
          identity: string;
          permissions?: {
            canPublish?: boolean;
          };
        },
      ) => {
        if (
          participant.identity === room.localParticipant.identity &&
          participant.permissions?.canPublish
        ) {
          window.clearTimeout(timeout);

          room.off(RoomEvent.ParticipantPermissionsChanged, handler);

          resolve();
        }
      };

      room.on(RoomEvent.ParticipantPermissionsChanged, handler);
    });
  }

  function requestTakeStage() {
    if (!canTakeStage) return;
    setMicHelp(false);
    setShowMicPrompt(true);
  }

  async function takeStage() {
    if (!canTakeStage) return;

    const room = roomRef.current;

    if (!room || audioStatus !== "connected") {
      setErrorMessage("Live audio is not connected yet.");

      return;
    }

    setShowMicPrompt(false);
    setMicrophoneStarting(true);
    setErrorMessage("");

    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      permissionStream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error("Microphone permission error:", error);
      setMicrophoneStarting(false);
      setMicHelp(true);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("take_open_stage");

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("You are no longer first in line.");
      }

      await setServerPublishPermission("enable");

      await waitForPublishPermission();

      await room.localParticipant.setMicrophoneEnabled(true);

      setMicrophoneLive(true);
      setMicrophoneStarting(false);
    } catch (error) {
      console.error("Take stage error:", error);

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to start your turn.",
      );

      try {
        await setServerPublishPermission("disable");
      } catch {}

      try {
        await supabase.rpc("end_open_stage");
      } catch {}
    } finally {
      setMicrophoneStarting(false);
    }
  }

  async function endTurn() {
    if (!isOnStage) return;

    const room = roomRef.current;

    setErrorMessage("");

    try {
      if (room) {
        await room.localParticipant.setMicrophoneEnabled(false);
      }

      setMicrophoneLive(false);

      await setServerPublishPermission("disable");

      const { data, error } = await supabase.rpc("end_open_stage");

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("Unable to end your turn.");
      }
    } catch (error) {
      console.error("End turn error:", error);

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to end your turn.",
      );
    }
  }

  async function enableAudioPlayback() {
    const room = roomRef.current;

    if (!room) return;

    await room.startAudio();

    setNeedsAudioStart(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCountries() {
      const mirrors = [
        "https://de1.api.radio-browser.info/json",
        "https://nl1.api.radio-browser.info/json",
        "https://at1.api.radio-browser.info/json",
      ];

      for (const base of mirrors) {
        try {
          const response = await fetch(`${base}/countries?order=name&hidebroken=true`);
          if (!response.ok) continue;
          const data = (await response.json()) as Array<{ name: string; stationcount: number }>;
          const names = data
            .filter((country) => country.name && country.stationcount > 0)
            .map((country) => country.name);
          if (!cancelled && names.length) {
            setRadioCountries(names);
            const philippines = names.find((name) =>
              name.toLowerCase().includes("philippines"),
            );
            if (philippines) setRadioCountry(philippines);
            return;
          }
        } catch {}
      }
    }

    loadCountries();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRadio() {
      setRadioLoading(true);
      setRadioError("");
      radioRef.current?.pause();
      setRadioPlaying(false);

      const mirrors = [
        "https://de1.api.radio-browser.info/json",
        "https://nl1.api.radio-browser.info/json",
        "https://at1.api.radio-browser.info/json",
      ];

      for (const base of mirrors) {
        try {
          const params = new URLSearchParams({
            country: radioCountry,
            limit: "60",
            hidebroken: "true",
            order: "clickcount",
            reverse: "true",
          });
          const response = await fetch(`${base}/stations/search?${params}`);
          if (!response.ok) continue;
          const data = (await response.json()) as RadioStation[];
          const usable = data.filter(
            (station) =>
              station.url_resolved &&
              station.url_resolved.startsWith("https://"),
          );
          if (!cancelled && usable.length) {
            setRadioStations(usable);
            setRadioIndex(0);
            setRadioLoading(false);
            return;
          }
        } catch {}
      }

      if (!cancelled) {
        setRadioStations([]);
        setRadioError(`No playable stations found for ${radioCountry}.`);
        setRadioLoading(false);
      }
    }

    loadRadio();
    return () => {
      cancelled = true;
    };
  }, [radioCountry]);

  useEffect(() => {
    const audio = radioRef.current;
    if (!audio) return;
    const normalized = Math.max(0, Math.min(1, radioVolume / 100));
    audio.volume = normalized;
    audio.muted = radioVolume === 0;
  }, [radioVolume]);

  function changeRadioVolume(value: number) {
    const next = Math.max(0, Math.min(100, value));
    setRadioVolume(next);

    const audio = radioRef.current;
    if (!audio) return;
    audio.volume = next / 100;
    audio.muted = next === 0;
  }

  async function toggleRadio() {
    const audio = radioRef.current;
    if (!audio || !radioStation) return;

    setRadioError("");

    if (radioPlaying) {
      audio.pause();
      setRadioPlaying(false);
      return;
    }

    try {
      if (audio.src !== radioStation.url_resolved) {
        audio.src = radioStation.url_resolved;
        audio.load();
      }
      audio.volume = Math.max(0, Math.min(1, radioVolume / 100));
      audio.muted = radioVolume === 0;
      await audio.play();
      setRadioPlaying(true);
    } catch {
      setRadioPlaying(false);
      setRadioError("This station could not play. Try the next station.");
    }
  }

  async function changeRadioStation(direction: number) {
    if (!radioStations.length) return;

    const audio = radioRef.current;
    const wasPlaying = radioPlaying;
    audio?.pause();

    const nextIndex =
      (radioIndex + direction + radioStations.length) % radioStations.length;
    setRadioIndex(nextIndex);
    setRadioPlaying(false);
    setRadioError("");

    if (wasPlaying && audio) {
      const next = radioStations[nextIndex];
      try {
        audio.src = next.url_resolved;
        audio.load();
        await audio.play();
        setRadioPlaying(true);
      } catch {
        setRadioError("This station could not play. Try another.");
      }
    }
  }

  async function leaveRoom() {
    const accessToken = accessTokenRef.current;

    try {
      if (radioRef.current) {
        radioRef.current.pause();
      }

      if (roomRef.current && microphoneLive) {
        await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      }

      if (accessToken) {
        await fetch("/api/leave-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
      }
    } catch (error) {
      console.error("Leave room error:", error);
    } finally {
      window.localStorage.removeItem("open-stage-nickname");
      setMicrophoneLive(false);
      setNickname("");
      setNicknameInput("");
      setJoined(false);
      setUserId(null);
      setQueue([]);
      setPeople([]);
      setMessages([]);
      setStageState(null);
    }
  }

  /*
   * REFRESHES AND MOBILE TAB RELOADS DO NOT COUNT AS LEAVING.
   * Supabase presence/LiveKit disconnect naturally and reconnect on restore.
   */

  /*
   * SUPABASE REALTIME + PRESENCE
   */
  useEffect(() => {
    if (!joined || !userId || !nickname) {
      return;
    }

    loadMessages();
    loadQueue();
    loadStageState();

    const channel = supabase.channel("open-stage-room", {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();

        const uniquePeople = new Map<string, PresencePerson>();

        Object.values(state).forEach((entries) => {
          entries.forEach((entry) => {
            const person = entry as unknown as PresencePerson;

            if (person.user_id && person.nickname) {
              uniquePeople.set(person.user_id, person);
            }
          });
        });

        setPeople(Array.from(uniquePeople.values()));
      })

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "open_stage_messages",
        },
        loadMessages,
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "open_stage_queue",
        },
        loadQueue,
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "open_stage_state",
        },
        loadStageState,
      )

      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            nickname,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.untrack();

      supabase.removeChannel(channel);
    };
  }, [joined, userId, nickname]);

  /*
   * LIVEKIT
   */
  useEffect(() => {
    if (!joined || !userId || !nickname) {
      return;
    }

    let cancelled = false;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    roomRef.current = room;

    function attachTrack(track: RemoteTrack) {
      if (track.kind !== Track.Kind.Audio) {
        return;
      }

      const element = track.attach();

      element.autoplay = true;

      audioContainerRef.current?.appendChild(element);
    }

    room.on(RoomEvent.TrackSubscribed, (track) => {
      attachTrack(track);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove());
    });

    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      setNeedsAudioStart(!room.canPlaybackAudio);
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const performer = speakers[0];
      setStageAudioLevel(performer?.audioLevel ?? 0);
    });

    async function connect() {
      try {
        setAudioStatus("connecting");

        const accessToken = await getAccessToken();

        const response = await fetch("/api/livekit-token", {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            accessToken,
            nickname,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error);
        }

        await room.connect(result.url, result.token);

        if (cancelled) {
          room.disconnect();
          return;
        }

        setAudioStatus("connected");

        setNeedsAudioStart(!room.canPlaybackAudio);
      } catch (error) {
        console.error("LiveKit connection error:", error);

        setAudioStatus("error");

        setErrorMessage("Unable to connect to live audio.");
      }
    }

    connect();

    return () => {
      cancelled = true;

      roomRef.current = null;

      room.disconnect();

      if (audioContainerRef.current) {
        audioContainerRef.current.innerHTML = "";
      }
    };
  }, [joined, userId, nickname]);

  useEffect(() => {
    if (!stageState?.current_user_id) {
      setStageAudioLevel(0);
    }
  }, [stageState?.current_user_id]);

  useEffect(() => {
    if (!microphoneLive) return;

    let frame = 0;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let cancelled = false;

    async function watchLocalMic() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(data);
          const average =
            data.reduce((sum, value) => sum + value, 0) / data.length;
          setStageAudioLevel(Math.min(1, average / 70));
          frame = requestAnimationFrame(tick);
        };

        tick();
      } catch (error) {
        console.error("Microphone meter error:", error);
      }
    }

    watchLocalMic();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      context?.close();
    };
  }, [microphoneLive]);



  if (restoringSession) {
    return (
      <main className="join-screen">
        <section className="join-box restore-box">
          <div className="join-logo">🎙</div>
          <h1>KWENTAYO</h1>
          <p className="join-tagline">Reconnecting to the room...</p>
        </section>
      </main>
    );
  }

  if (!joined) {
    return (
      <main className="join-screen">
        <section className="join-box">
          <div className="join-logo">🎙</div>

          <h1>KWENTAYO</h1>

          <p className="join-tagline">
            One room. One stage. Everyone gets a turn.
          </p>

          <form onSubmit={enterRoom}>
            <label htmlFor="nickname">Your nickname</label>

            <input
              id="nickname"
              value={nicknameInput}
              onChange={(event) => setNicknameInput(event.target.value)}
              maxLength={20}
              autoFocus
              placeholder="Enter a nickname"
              disabled={joining}
            />

            <button type="submit" disabled={joining || !nicknameInput.trim()}>
              {joining ? "Entering..." : "Enter Open Stage"}
            </button>
          </form>

          {errorMessage && (
            <p
              style={{
                color: "#a51919",
                marginTop: "14px",
              }}
            >
              {errorMessage}
            </p>
          )}

          <p className="guest-note">
            No email. No account. Just pick a name and come in.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={`app theme-${theme}`}>
      <div
        ref={audioContainerRef}
        style={{
          display: "none",
        }}
      />

      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">🎙</div>

          <div>
            <h1>KWENTAYO</h1>

            <p>Talk. Listen. Hang out.</p>
          </div>
        </div>

        <div className="top-right">
          <div className="header-audio-controls" aria-label="Personal audio controls">
            <button
              className={stageMuted ? "header-audio-button muted" : "header-audio-button active"}
              onClick={toggleStageMute}
              type="button"
            >
              🎙 {stageMuted ? "Stage Off" : "Stage On"}
            </button>
            <button
              className={!radioPlaying ? "header-audio-button muted" : "header-audio-button active"}
              onClick={toggleRadio}
              type="button"
              disabled={!radioStation}
            >
              📻 {radioPlaying ? "Radio On" : "Radio Off"}
            </button>
          </div>

          <div className="top-welcome">
            <span>Welcome, <strong>{nickname}!</strong></span>
            <div className="top-actions">
              <button className="leave-room-button" onClick={leaveRoom} type="button">
                Leave Room
              </button>
              <button className="theme-toggle" onClick={toggleTheme} type="button">
                {theme === "light" ? "🌙 Yahoo Night" : "☀ Yahoo Classic"}
              </button>
            </div>
          </div>

          <div className="audio-connection">
            <span className={audioStatus === "connected" ? "connection-dot online" : "connection-dot"} />
            Audio:{" "}
            <strong>
              {audioStatus === "connected" && "Connected ✓"}
              {audioStatus === "connecting" && "Connecting..."}
              {audioStatus === "error" && "Error"}
              {audioStatus === "disconnected" && "Disconnected"}
            </strong>
          </div>
        </div>
      </header>

      {needsAudioStart && (
        <div
          style={{
            textAlign: "center",
            padding: "8px",
            background: "#fff2b5",
          }}
        >
          Your browser blocked automatic audio.
          <button
            onClick={enableAudioPlayback}
            style={{
              marginLeft: "10px",
            }}
          >
            Enable Audio
          </button>
        </div>
      )}

      <section className="workspace">
        <aside className="window people-window">
          <WindowTitle title={`Who's Here (${people.length})`} />

          <div className="people-list">
            {people.map((person) => (
              <div className="person" key={person.user_id}>
                <span className="face">🙂</span>

                <span className="status-dot online" />

                <strong>
                  {person.nickname}

                  {person.user_id === userId ? " (You)" : ""}
                </strong>
              </div>
            ))}
          </div>
        </aside>

        <section className="center-column">
          <div className="window stage-window">
            <WindowTitle title="Now On Stage" />

            <div className="stage-content">
              <div className="microphone">
                {stageState?.current_user_id ? "🎙️" : "🎤"}
              </div>

              {stageState?.current_user_id ? (
                <div className="stage-details">
                  <div className="stage-label">NOW ON STAGE</div>

                  <h2>{stageState.current_nickname}</h2>

                  <div className="live">LIVE</div>

                  <div className={`stage-timer ${timerTone}`}>
                    <span>⏱</span>
                    <strong>{formatCountdown(stageSecondsLeft)}</strong>
                    <small>remaining</small>
                  </div>

                  <LiveWaveform level={stageAudioLevel} />

                  <p>
                    <strong>{people.length} listening</strong>
                  </p>

                  {isOnStage && (
                    <>
                      <p>
                        {microphoneLive
                          ? "🎙️ Your microphone is LIVE"
                          : microphoneStarting
                            ? "Starting microphone..."
                            : "Preparing microphone..."}
                      </p>

                      <button className="get-line-button" onClick={endTurn}>
                        End My Turn
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="stage-details">
                  <div className="stage-label">STAGE IS OPEN</div>

                  <h2>No one yet</h2>

                  <p>First person in line gets the mic.</p>

                  {canTakeStage && (
                    <button
                      className="get-line-button"
                      onClick={requestTakeStage}
                      disabled={microphoneStarting}
                    >
                      {microphoneStarting ? "Getting Mic..." : "Take The Stage"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="window chat-window">
            <WindowTitle title="Live Chat" />

            <div className="chat-messages">
              {messages.map((message) => (
                <div className="chat-message" key={message.id}>
                  <span className="timestamp">
                    [{formatTime(message.created_at)}]
                  </span>

                  <strong>{message.nickname}:</strong>

                  <span>{message.message}</span>
                </div>
              ))}
            </div>

            <form className="chat-form" onSubmit={sendMessage}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                maxLength={300}
                placeholder="Say something..."
              />

              <button className="send-button" type="submit">
                Send
              </button>
            </form>
            <p
              style={{
                margin: "6px 10px 10px",
                fontSize: "12px",
                color: "#6b6570",
                textAlign: "center",
              }}
            >
              Chat history disappears after 24 hours. Be yourself. Be kind.
            </p>
          </div>
        </section>

        <aside className="right-column">
          <div className="window queue-window">
            <WindowTitle title={`Up Next (${queue.length})`} />

            <div className="queue-list">
              {queue.length === 0 && (
                <p
                  style={{
                    textAlign: "center",
                    color: "#666",
                    padding: "15px",
                  }}
                >
                  Nobody is waiting yet.
                </p>
              )}

              {queue.map((person, index) => (
                <div className="queue-person" key={person.id}>
                  <div className="queue-number">{index + 1}</div>

                  <div className="queue-details">
                    <strong>
                      {person.nickname}

                      {person.user_id === userId ? " (You)" : ""}
                    </strong>

                    <span>{person.talent}</span>
                  </div>

                  <div className="queue-icon">🎤</div>
                </div>
              ))}
            </div>

            {!isOnStage && (
              <button
                className="get-line-button"
                onClick={inQueue ? leaveLine : getInLine}
              >
                {inQueue ? "Leave The Line" : "Get In Line"}
              </button>
            )}

            {canTakeStage && (
              <button
                className="get-line-button"
                onClick={requestTakeStage}
                disabled={microphoneStarting}
              >
                {microphoneStarting ? "Getting Mic..." : "Take The Stage"}
              </button>
            )}

            <div className="stage-limit-note">⏱ 10 minutes maximum per turn</div>

            <p className="queue-caption">
              {inQueue
                ? `You're #${
                    queue.findIndex((person) => person.user_id === userId) + 1
                  } in line.`
                : isOnStage
                  ? "You're on stage!"
                  : "Take your turn on stage!"}
            </p>
          </div>

          <div className="window radio-window">
            <WindowTitle title="GlobeWave • DJ Radio" />

            <div className="dj-radio">
              <audio
                ref={radioRef}
                onPlaying={() => setRadioPlaying(true)}
                onPause={() => setRadioPlaying(false)}
                onError={() => {
                  setRadioPlaying(false);
                  setRadioError("Station stream unavailable. Try another.");
                }}
              />

              <div className="mini-globewave-head">
                <div>
                  <span className="radio-kicker">◉ LIVE RADIO</span>
                  <strong>GlobeWave</strong>
                </div>
                <span className="radio-signal">▂▄▆█</span>
              </div>

              <div className="mini-globe" aria-hidden="true">
                <div className="mini-globe-orbit" />
                <div className="mini-globe-earth">
                  <span>🌏</span>
                </div>
                <div className="mini-globe-glow" />
              </div>

              <div className="radio-browser">
                <label>
                  <span>COUNTRY</span>
                  <select
                    value={radioCountry}
                    onChange={(event) => setRadioCountry(event.target.value)}
                  >
                    {(radioCountries.length ? radioCountries : ["Philippines"]).map(
                      (country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  <span>STATION</span>
                  <select
                    value={radioIndex}
                    onChange={(event) => {
                      radioRef.current?.pause();
                      setRadioPlaying(false);
                      setRadioError("");
                      setRadioIndex(Number(event.target.value));
                    }}
                    disabled={radioLoading || radioStations.length === 0}
                  >
                    {radioStations.map((station, index) => (
                      <option key={station.stationuuid || index} value={index}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {radioLoading ? (
                <p className="radio-status">Tuning {radioCountry} stations...</p>
              ) : radioStation ? (
                <>
                  <div className="station-card">
                    <div className="station-copy">
                      <span className="station-caption">NOW TUNED</span>
                      <strong>{radioStation.name}</strong>
                      <span>
                        {radioStation.country || "Worldwide"}
                        {radioStation.codec ? ` • ${radioStation.codec}` : ""}
                        {radioStation.bitrate ? ` • ${radioStation.bitrate} kbps` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="radio-eq" aria-hidden="true">
                    {Array.from({ length: 18 }, (_, index) => (
                      <span
                        key={index}
                        className={radioPlaying ? "radio-bar active" : "radio-bar"}
                        style={{ animationDelay: `${index * 70}ms` }}
                      />
                    ))}
                  </div>

                  <div className="radio-controls">
                    <button onClick={() => changeRadioStation(-1)} aria-label="Previous station">
                      ◀◀
                    </button>
                    <button className="radio-play" onClick={toggleRadio}>
                      {radioPlaying ? "❚❚ Pause" : "▶ Play"}
                    </button>
                    <button onClick={() => changeRadioStation(1)} aria-label="Next station">
                      ▶▶
                    </button>
                  </div>

                  <label className="radio-volume">
                    <span>🔊</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={radioVolume}
                      onInput={(event) => changeRadioVolume(Number(event.currentTarget.value))}
                      onChange={(event) => changeRadioVolume(Number(event.currentTarget.value))}
                    />
                  </label>

                </>
              ) : null}

              {radioError && <p className="radio-error">{radioError}</p>}

              <div className="radio-footer-actions">
                <span className="radio-inline-note">
                  Select a country and station right here.
                </span>
                <a
                  className="globewave-link"
                  href="https://globewave.vercel.app"
                  target="_blank"
                  rel="noreferrer"
                >
                  ↗ Full GlobeWave
                </a>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="mood-audio-bar" aria-label="Your listening controls">
        <div className="mood-audio-intro">
          <strong>YOUR MOOD</strong>
          <span>Listen your way — stage, radio, chat, or just relax.</span>
        </div>

        <div className="mood-control">
          <span className="mood-label">🎙 Stage Volume</span>
          <input
            aria-label="Stage volume"
            type="range"
            min="0"
            max="100"
            value={stageMuted ? 0 : stageVolume}
            onChange={(event) => changeStageVolume(Number(event.target.value))}
          />
          <span>{stageMuted ? 0 : stageVolume}%</span>
        </div>

        <div className="mood-control">
          <span className="mood-label">📻 Radio Volume</span>
          <input
            aria-label="Radio volume"
            type="range"
            min="0"
            max="100"
            value={radioVolume}
            onInput={(event) => changeRadioVolume(Number(event.currentTarget.value))}
                      onChange={(event) => changeRadioVolume(Number(event.currentTarget.value))}
          />
          <span>{radioVolume}%</span>
        </div>
      </section>

      {showMicPrompt && (
        <div className="mic-permission-backdrop" role="dialog" aria-modal="true">
          <div className="mic-permission-card">
            <div className="mic-permission-icon">🎙️</div>
            <h3>Ready to go on stage?</h3>
            <p>
              Kwentayo needs your microphone so everyone in the room can hear you.
            </p>
            <p className="mic-permission-tip">
              After you tap Yes, choose <strong>Allow</strong> when your browser asks.
            </p>
            <div className="mic-permission-actions">
              <button className="mic-yes" onClick={takeStage}>
                Yes, Use My Mic
              </button>
              <button className="mic-no" onClick={() => setShowMicPrompt(false)}>
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

      {micHelp && (
        <div className="mic-help-card">
          <button
            className="mic-help-close"
            onClick={() => setMicHelp(false)}
            aria-label="Close microphone help"
          >
            ×
          </button>
          <strong>🎙️ Microphone access is off</strong>
          <span>Allow microphone access for Kwentayo, then try again.</span>
          <button
            onClick={() => {
              setMicHelp(false);
              setShowMicPrompt(true);
            }}
          >
            Try Microphone Again
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 14px",
            background: "white",
            color: "#a51919",
            border: "1px solid #a51919",
            zIndex: 100,
          }}
        >
          {errorMessage}
        </div>
      )}
    </main>
  );
}

function LiveWaveform({ level }: { level: number }) {
  const bars = Array.from({ length: 30 }, (_, index) => {
    const wave = 0.35 + 0.65 * Math.abs(Math.sin(index * 0.72));
    const energy = Math.min(1, Math.max(0.04, level * 5.5));
    const height = 6 + Math.round(44 * energy * wave);

    return <span key={index} style={{ height: `${height}px` }} />;
  });

  return (
    <div className="waveform" aria-label="Live microphone activity">
      {bars}
    </div>
  );
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WindowTitle({ title }: { title: string }) {
  return (
    <div className="window-title">
      <span>{title}</span>
    </div>
  );
}
