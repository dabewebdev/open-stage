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

export default function Home() {
  const [nicknameInput, setNicknameInput] = useState("");
  const [nickname, setNickname] = useState("");

  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);

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

  const [stageAudioLevel, setStageAudioLevel] = useState(0);

  const [needsAudioStart, setNeedsAudioStart] = useState(false);

  const roomRef = useRef<Room | null>(null);

  const audioContainerRef = useRef<HTMLDivElement | null>(null);

  const accessTokenRef = useRef<string | null>(null);

  const inQueue = !!userId && queue.some((person) => person.user_id === userId);

  const isOnStage = !!userId && stageState?.current_user_id === userId;

  const firstInQueue = queue[0] ?? null;

  const canTakeStage =
    !!userId &&
    !stageState?.current_user_id &&
    firstInQueue?.user_id === userId;

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
      setJoined(true);
    } catch (error) {
      console.error("Enter room error:", error);

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to enter Open Stage.",
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

  async function takeStage() {
    if (!canTakeStage) return;

    const room = roomRef.current;

    if (!room || audioStatus !== "connected") {
      setErrorMessage("Live audio is not connected yet.");

      return;
    }

    setMicrophoneStarting(true);
    setErrorMessage("");

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

  /*
   * CLEAN UP QUEUE/STAGE WHEN TAB CLOSES
   */
  useEffect(() => {
    if (!joined) {
      return;
    }

    function leaveRoom() {
      const accessToken = accessTokenRef.current;

      if (!accessToken) {
        return;
      }

      const body = JSON.stringify({
        accessToken,
      });

      const blob = new Blob([body], {
        type: "application/json",
      });

      navigator.sendBeacon("/api/leave-room", blob);
    }

    window.addEventListener("pagehide", leaveRoom);

    return () => {
      window.removeEventListener("pagehide", leaveRoom);
    };
  }, [joined]);

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
      const currentStageUserId = stageState?.current_user_id;

      if (!currentStageUserId) {
        setStageAudioLevel(0);
        return;
      }

      const performer = speakers.find(
        (speaker) => speaker.identity === currentStageUserId,
      );

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
  }, [joined, userId, nickname, stageState?.current_user_id]);

  useEffect(() => {
    if (!stageState?.current_user_id) {
      setStageAudioLevel(0);
    }
  }, [stageState?.current_user_id]);

  if (!joined) {
    return (
      <main className="join-screen">
        <section className="join-box">
          <div className="join-logo">🎙</div>

          <h1>OPEN STAGE</h1>

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
    <main className="app">
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
            <h1>OPEN STAGE</h1>

            <p>One room. One stage. Everyone gets a turn.</p>
          </div>
        </div>

        <div className="top-right">
          Welcome, <strong>{nickname}!</strong>
          <div
            style={{
              marginTop: "7px",
              fontSize: "12px",
            }}
          >
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
                      onClick={takeStage}
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
                onClick={takeStage}
                disabled={microphoneStarting}
              >
                {microphoneStarting ? "Getting Mic..." : "Take The Stage"}
              </button>
            )}

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
        </aside>
      </section>

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

      <div className="window-controls">
        <button>−</button>
        <button>□</button>
        <button>×</button>
      </div>
    </div>
  );
}
