import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import confetti from 'canvas-confetti';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Sound Engine
const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
let _ac: AudioContext | null = null;

function getAC() {
  if (!_ac) _ac = new AudioCtx();
  if (_ac.state === 'suspended') _ac.resume();
  return _ac;
}

function beep(freq: number, type: OscillatorType, dur: number, vol: number, delay = 0) {
  try {
    const ac = getAC();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime + delay);
    g.gain.setValueAtTime(0, ac.currentTime + delay);
    g.gain.linearRampToValueAtTime(vol, ac.currentTime + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
    o.start(ac.currentTime + delay);
    o.stop(ac.currentTime + delay + dur + 0.02);
  } catch (e) {
    console.warn('Audio beep error', e);
  }
}

export const sfx = {
  tap: () => beep(880, 'square', 0.06, 0.08),
  expand: () => {
    beep(440, 'square', 0.05, 0.07);
    beep(660, 'square', 0.05, 0.07, 0.06);
  },
  collapse: () => {
    beep(660, 'square', 0.05, 0.07);
    beep(440, 'square', 0.05, 0.07, 0.06);
  },
  save: () => {
    beep(523, 'square', 0.06, 0.08);
    beep(659, 'square', 0.06, 0.08, 0.07);
    beep(784, 'square', 0.1, 0.1, 0.14);
  },
  deleted: (el?: HTMLElement | null) => {
    [523, 415, 330, 262, 196, 147].forEach((f, i) => beep(f, 'square', 0.07, 0.12, i * 0.055));
    if (el) {
      const rect = el.getBoundingClientRect();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { 
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height / 2) / window.innerHeight 
        },
        colors: ['#ff453a', '#ffffff', '#000000']
      });
    }
  },
  open: () => {
    beep(300, 'square', 0.04, 0.06);
    beep(480, 'square', 0.06, 0.08, 0.05);
  },
  close: () => {
    beep(480, 'square', 0.04, 0.06);
    beep(300, 'square', 0.06, 0.06, 0.05);
  },
  reject: () => {
    beep(220, 'square', 0.05, 0.1);
    beep(160, 'square', 0.08, 0.12, 0.05);
  }
};
