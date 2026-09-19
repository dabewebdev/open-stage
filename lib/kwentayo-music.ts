export type KwentayoTrack = {
  id: string;
  title: string;
  category: string;
  tempo: number;
  root: number;
  minor: boolean;
  seed: number;
};

const moods = [
  { name: "Midnight", category: "Late Night", tempo: 72, root: 45, minor: true },
  { name: "Velvet", category: "Lounge", tempo: 78, root: 48, minor: false },
  { name: "Quiet", category: "Calm", tempo: 68, root: 50, minor: false },
  { name: "Neon", category: "Retro", tempo: 96, root: 43, minor: true },
  { name: "Moonlit", category: "Dreamy", tempo: 74, root: 47, minor: true },
  { name: "Rainy", category: "Lo-Fi", tempo: 82, root: 45, minor: true },
  { name: "Golden", category: "Warm", tempo: 88, root: 48, minor: false },
  { name: "Sunday", category: "Easy", tempo: 76, root: 50, minor: false },
  { name: "City", category: "Night Drive", tempo: 102, root: 43, minor: true },
  { name: "Starlight", category: "Ambient", tempo: 70, root: 52, minor: false },
] as const;

const scenes = [
  "Lounge",
  "Drift",
  "Coffee",
  "Walk",
  "Window",
  "Drive",
  "Letters",
  "Glow",
  "Dream",
  "Memories",
] as const;

export const KWENTAYO_MUSIC_LIBRARY: KwentayoTrack[] = moods.flatMap((mood, moodIndex) =>
  scenes.map((scene, sceneIndex) => {
    const index = moodIndex * scenes.length + sceneIndex;
    return {
      id: String(index + 1).padStart(3, "0"),
      title: `${mood.name} ${scene}`,
      category: mood.category,
      tempo: mood.tempo + (sceneIndex % 5) * 3,
      root: mood.root + (sceneIndex % 4),
      minor: sceneIndex % 3 === 0 ? !mood.minor : mood.minor,
      seed: index + 1,
    };
  }),
);

export function getKwentayoTrack(id: string) {
  return KWENTAYO_MUSIC_LIBRARY.find((track) => track.id === id) ?? null;
}
