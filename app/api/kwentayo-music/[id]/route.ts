import { NextResponse } from "next/server";
import { getKwentayoTrack } from "@/lib/kwentayo-music";

export const runtime = "nodejs";

const SAMPLE_RATE = 16000;

function midiToHz(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function writeWav(samples: Int16Array) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buffer;
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function synthesize(track: NonNullable<ReturnType<typeof getKwentayoTrack>>) {
  const beat = 60 / track.tempo;
  const duration = beat * 16; // 8 bars in 4/4 at two chords per bar; designed to loop.
  const count = Math.floor(duration * SAMPLE_RATE);
  const samples = new Int16Array(count);
  const random = seeded(track.seed * 7919);
  const scale = track.minor ? [0, 3, 7, 10] : [0, 4, 7, 11];
  const progression = track.minor ? [0, 5, 3, 7] : [0, 5, 7, 3];

  for (let i = 0; i < count; i += 1) {
    const t = i / SAMPLE_RATE;
    const beatIndex = Math.floor(t / beat);
    const chordIndex = Math.floor(beatIndex / 4) % progression.length;
    const root = track.root + progression[chordIndex];
    const phaseInBeat = (t % beat) / beat;
    const softPulse = Math.exp(-phaseInBeat * 5.5);

    let value = 0;
    for (let n = 0; n < 3; n += 1) {
      const hz = midiToHz(root + scale[n]);
      value += Math.sin(2 * Math.PI * hz * t + n * 0.7) * (0.12 / (n + 1));
    }

    const bassHz = midiToHz(root - 12);
    value += Math.sin(2 * Math.PI * bassHz * t) * 0.18;

    if (beatIndex % 2 === 0) {
      value += Math.sin(2 * Math.PI * midiToHz(root + 12) * t) * softPulse * 0.07;
    }

    // Very soft deterministic texture so each of the 100 tracks has its own character.
    value += (random() - 0.5) * 0.008;

    const fade = Math.min(1, t / 0.25, (duration - t) / 0.25);
    const clamped = Math.max(-1, Math.min(1, value * Math.max(0, fade)));
    samples[i] = Math.round(clamped * 32767);
  }

  return writeWav(samples);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const track = getKwentayoTrack(id);
  if (!track) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const wav = synthesize(track);
  return new Response(wav, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="kwentayo-${track.id}.wav"`,
    },
  });
}
