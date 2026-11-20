import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { prefs } from "./prefs";

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

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let ready = false;

function init() {
  if (ready) return;
  ready = true;
  void setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
}

export const sound = {
  play(name: SoundName, volume = 1) {
    if (!prefs.sound) return;
    try {
      init();
      let p = players[name];
      if (!p) {
        p = createAudioPlayer(SOURCES[name]);
        players[name] = p;
      }
      p.volume = volume;
      p.seekTo(0);
      p.play();
    } catch {
      // audio is decoration; never break the game over it
    }
  },
};
