import { Asset } from "expo-asset";
import { prefs } from "./prefs";

/**
 * Web version: Web Audio API with pre-decoded buffers. HTMLAudio (what expo-audio uses on web) starts
 * with a noticeable delay on iOS Safari; decoded buffers play within a frame.
 * iOS only allows audio after a user gesture, so the context is created/resumed on the first touch.
 */
const SOURCES = {
  tap: require("../../assets/sounds/tap.wav"),
  tick: require("../../assets/sounds/tick.wav"),
  correct: require("../../assets/sounds/correct.wav"),
  wrong: require("../../assets/sounds/wrong.wav"),
  capture: require("../../assets/sounds/capture.wav"),
  shield: require("../../assets/sounds/shield.wav"),
  win: require("../../assets/sounds/win.wav"),
  lose: require("../../assets/sounds/lose.wav"),
  reveal: require("../../assets/sounds/reveal.wav"),
} as const;

export type SoundName = keyof typeof SOURCES;

type Ctx = AudioContext;
let ctx: Ctx | null = null;
const buffers: Partial<Record<SoundName, AudioBuffer>> = {};
let loading = false;

function context(): Ctx | null {
  if (ctx) return ctx;
  const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

async function loadAll() {
  if (loading) return;
  loading = true;
  const c = context();
  if (!c) return;
  await Promise.all(
    (Object.keys(SOURCES) as SoundName[]).map(async (name) => {
      try {
        const uri = Asset.fromModule(SOURCES[name]).uri;
        const data = await (await fetch(uri)).arrayBuffer();
        buffers[name] = await c.decodeAudioData(data);
      } catch {
        // missing sound is not worth breaking the game
      }
    }),
  );
}

function unlock() {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  // A silent one-sample buffer fully unlocks audio on iOS.
  const b = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = b;
  src.connect(c.destination);
  src.start(0);
  void loadAll();
}

if (typeof window !== "undefined") {
  const once = () => {
    unlock();
    window.removeEventListener("touchend", once, true);
    window.removeEventListener("pointerdown", once, true);
    window.removeEventListener("keydown", once, true);
  };
  window.addEventListener("touchend", once, true);
  window.addEventListener("pointerdown", once, true);
  window.addEventListener("keydown", once, true);
}

export const sound = {
  play(name: SoundName, volume = 1) {
    if (!prefs.sound) return;
    const c = context();
    const buf = buffers[name];
    if (!c || !buf) {
      void loadAll();
      return;
    }
    if (c.state === "suspended") void c.resume();
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(c.destination);
    src.start(0);
  },
};
