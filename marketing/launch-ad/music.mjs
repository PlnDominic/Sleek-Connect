// Writes out/music.wav: a 30 s, 120 BPM Afro-house cue for the ad, with sound effects on the same cue times as ad.html.
// Pure Node, no packages: every sound is synthesised here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const LEN = 30;
const N = SR * LEN;
const BEAT = 0.5; // 120 BPM
const BAR = BEAT * 4;

const bus = () => [new Float32Array(N), new Float32Array(N)];
const drums = bus(), bass = bus(), pad = bus(), keys = bus(), sfx = bus(), send = bus();

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

function add(b, i, l, r = l) { if (i >= 0 && i < N) { b[0][i] += l; b[1][i] += r; } }
const panLR = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

/* ---------------- instruments ---------------- */
function kick(t, g = 1) {
  const s = Math.floor(t * SR), len = Math.floor(0.45 * SR);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR;
    const f = 45 + 110 * Math.exp(-x * 38);
    ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) * Math.exp(-x * 7.5) * g * 0.95 + (i < 60 ? rnd() * 0.25 * (1 - i / 60) * g : 0);
    add(drums, s + i, v);
  }
}
function hat(t, g = 1, open = false, pan = 0.2) {
  const s = Math.floor(t * SR), len = Math.floor((open ? 0.22 : 0.05) * SR);
  let prev = 0; const [l, r] = panLR(pan);
  for (let i = 0; i < len; i++) {
    const n = rnd(), hp = n - prev; prev = n;
    const v = hp * Math.exp(-(i / SR) * (open ? 18 : 70)) * 0.16 * g;
    add(drums, s + i, v * l, v * r);
  }
}
function shaker(t, g = 1) {
  const s = Math.floor(t * SR), len = Math.floor(0.06 * SR);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const n = rnd(), hp = n - prev; prev = n;
    const x = i / SR, env = Math.min(1, x / 0.008) * Math.exp(-x * 55);
    add(drums, s + i, hp * env * 0.07 * g * 0.7, hp * env * 0.07 * g);
  }
}
function clap(t, g = 1) {
  const s = Math.floor(t * SR);
  for (const off of [0, 0.011, 0.022]) {
    const len = Math.floor(0.12 * SR), o = Math.floor(off * SR);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const n = rnd(); lp += (n - lp) * 0.45;
      const v = (n - lp) * Math.exp(-(i / SR) * (off === 0.022 ? 22 : 90)) * 0.22 * g;
      add(drums, s + o + i, v * 0.9, v);
      if (i % 2 === 0) add(send, s + o + i, v * 0.4);
    }
  }
}
// Amapiano-style log drum: a pitched, slightly driven thump that slides down.
function logDrum(t, note, g = 1, dur = 0.32) {
  const s = Math.floor(t * SR), len = Math.floor(dur * SR), f0 = midi(note);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR;
    const f = f0 * (1 + 0.6 * Math.exp(-x * 60));
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, x / 0.004) * Math.exp(-x * (4.2 / dur));
    const v = Math.tanh(Math.sin(ph) * 2.2 + Math.sin(ph * 2) * 0.3) * env * 0.42 * g;
    add(bass, s + i, v);
  }
}
// Warm pad: detuned saws through a one-pole low-pass, slow swell.
function chord(t, dur, notes, g = 1, cutoff = 1800) {
  const s = Math.floor(t * SR), len = Math.floor(dur * SR);
  notes.forEach((n, vi) => {
    for (const det of [-0.12, 0, 0.11]) {
      const f = midi(n + det);
      let ph = Math.random(), lp = 0;
      const a = Math.exp((-2 * Math.PI * cutoff) / SR);
      const [l, r] = panLR(det * 6 + (vi - notes.length / 2) * 0.12);
      for (let i = 0; i < len; i++) {
        ph += f / SR; if (ph >= 1) ph -= 1;
        const saw = ph * 2 - 1;
        lp = (1 - a) * saw + a * lp;
        const x = i / SR;
        const env = Math.min(1, x / 0.35) * Math.min(1, (dur - x) / 0.3);
        const v = lp * env * 0.03 * g;
        add(pad, s + i, v * l, v * r);
      }
    }
  });
}
function pluck(t, note, g = 1, pan = 0, decay = 7, bright = 1) {
  const s = Math.floor(t * SR), len = Math.floor(1.2 * SR), f = midi(note);
  const [l, r] = panLR(pan);
  for (let i = 0; i < len; i++) {
    const x = i / SR, w = 2 * Math.PI * f * x;
    const env = Math.min(1, x / 0.003) * Math.exp(-x * decay);
    const v = (Math.sin(w) + 0.35 * bright * Math.sin(2 * w) * Math.exp(-x * 14) + 0.12 * Math.sin(3 * w) * Math.exp(-x * 20)) * env * 0.16 * g;
    add(keys, s + i, v * l, v * r);
    add(send, s + i, v * 0.5);
  }
}
function bell(t, note, g = 1, pan = 0) {
  const s = Math.floor(t * SR), len = Math.floor(2.2 * SR), f = midi(note);
  const [l, r] = panLR(pan);
  for (let i = 0; i < len; i++) {
    const x = i / SR;
    const v = (Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 2.6) + 0.5 * Math.sin(2 * Math.PI * f * 2.76 * x) * Math.exp(-x * 6) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * x) * Math.exp(-x * 10)) * 0.13 * g * Math.min(1, x / 0.002);
    add(sfx, s + i, v * l, v * r);
    add(send, s + i, v * 0.7);
  }
}
function whoosh(t, dur, g = 1, panFrom = -0.8, panTo = 0.8, fromHz = 300, toHz = 6000) {
  const s = Math.floor(t * SR), len = Math.floor(dur * SR);
  let lp = 0, lp2 = 0;
  for (let i = 0; i < len; i++) {
    const k = i / len;
    const fc = fromHz * Math.pow(toHz / fromHz, Math.sin(k * Math.PI / 2));
    const a = Math.exp((-2 * Math.PI * fc) / SR);
    const n = rnd(); lp = (1 - a) * n + a * lp; lp2 = (1 - a) * lp + a * lp2;
    const env = Math.pow(Math.sin(Math.PI * k), 1.6);
    const [l, r] = panLR(panFrom + (panTo - panFrom) * k);
    const v = (lp - lp2 * 0.6) * env * 0.9 * g;
    add(sfx, s + i, v * l, v * r);
    add(send, s + i, v * 0.3);
  }
}
function tick(t, g = 1, f = 3200, pan = 0) {
  const s = Math.floor(t * SR), len = Math.floor(0.03 * SR);
  const [l, r] = panLR(pan);
  for (let i = 0; i < len; i++) {
    const x = i / SR;
    const v = (Math.sin(2 * Math.PI * f * x) * 0.6 + rnd() * 0.4) * Math.exp(-x * 220) * 0.22 * g;
    add(sfx, s + i, v * l, v * r);
  }
}
function pop(t, g = 1) { // a soft bubble for taps
  const s = Math.floor(t * SR), len = Math.floor(0.09 * SR);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR, f = 380 + 900 * (x / 0.09);
    ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) * Math.exp(-x * 45) * 0.32 * g;
    add(sfx, s + i, v); add(send, s + i, v * 0.2);
  }
}
function riser(t, dur, g = 1) {
  const s = Math.floor(t * SR), len = Math.floor(dur * SR);
  let lp = 0, ph = 0;
  for (let i = 0; i < len; i++) {
    const k = i / len;
    const fc = 200 * Math.pow(40, k), a = Math.exp((-2 * Math.PI * fc) / SR);
    const n = rnd(); lp = (1 - a) * n + a * lp;
    ph += (2 * Math.PI * (220 * Math.pow(4, k))) / SR;
    const v = (lp * 0.7 + Math.sin(ph) * 0.12) * Math.pow(k, 2.2) * 0.55 * g;
    add(sfx, s + i, v, v); add(send, s + i, v * 0.4);
  }
}
function impact(t, g = 1) {
  const s = Math.floor(t * SR), len = Math.floor(2.4 * SR);
  let ph = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR, f = 38 + 60 * Math.exp(-x * 9);
    ph += (2 * Math.PI * f) / SR;
    const n = rnd(); lp += (n - lp) * 0.08;
    const v = (Math.sin(ph) * Math.exp(-x * 1.6) * 0.9 + lp * Math.exp(-x * 6) * 1.2) * g;
    add(sfx, s + i, v, v); add(send, s + i, v * 0.35);
  }
}
function typing(t0, t1) {
  for (let t = t0, k = 0; t < t1; t += 0.045 + ((k++ * 37) % 7) * 0.004) tick(t, 0.5, 2400 + ((k * 53) % 5) * 300, (k % 2 ? 0.15 : -0.15));
}

/* ---------------- arrangement ---------------- */
// D minor, i – VI – III – VII: Dm9, Bbmaj7, Fmaj7, C6/9. One chord per bar.
const prog = [
  { root: 38, notes: [50, 53, 57, 60, 64] },
  { root: 34, notes: [50, 53, 57, 58, 62] },
  { root: 41, notes: [48, 53, 57, 60, 64] },
  { root: 36, notes: [48, 52, 55, 57, 62] },
];
const DROP = 3.5, BREAK = 26.75, END = 27.35;

// intro pad (filtered), then the full pad
chord(0, 3.5, [50, 53, 57, 64], 0.9, 700);
for (let b = 0; ; b++) {
  const t = DROP + b * BAR;
  if (t >= BREAK) break;
  const c = prog[b % 4];
  chord(t, Math.min(BAR, BREAK - t) + 0.25, c.notes, 1, 1500 + 400 * Math.sin(b));
}
// end-card chord, open and long
chord(END, LEN - END, [50, 57, 60, 64, 69], 1.25, 2400);

// the four words of the hook land on plucks, then a lift on "All in one place."
[[0.9, 62], [1.4, 65], [1.9, 69], [2.4, 72]].forEach(([t, n], i) => { pluck(t, n, 1.1, i % 2 ? 0.35 : -0.35, 5); pluck(t, n - 12, 0.5, 0, 6); });
pluck(2.92, 74, 1.1, 0, 3); pluck(2.92, 69, 0.8, -0.3, 3); pluck(2.92, 65, 0.7, 0.3, 3);
whoosh(0.05, 1.2, 0.55, -0.9, 0.9, 200, 4000);
riser(2.0, 1.5, 0.55);

// groove
for (let b = 0; ; b++) {
  const bt = DROP + b * BAR;
  if (bt >= BREAK) break;
  const c = prog[b % 4];
  for (let q = 0; q < 16; q++) {
    const t = bt + q * (BEAT / 4);
    if (t >= BREAK) break;
    if (q % 4 === 0) kick(t, q === 0 ? 1 : 0.92);
    if (q % 4 === 2) hat(t, 1, q === 14 && b % 2 === 1, 0.25);
    if (q === 4 || q === 12) clap(t, 0.75);
    shaker(t, q % 2 ? 0.7 : 1);
    // log drum: a syncopated amapiano figure on the chord root
    if ([0, 3, 6, 10, 13].includes(q)) logDrum(t, c.root + (q === 10 ? 12 : q === 13 ? 7 : 0), q === 0 ? 1 : 0.8, q === 13 ? 0.2 : 0.3);
  }
  // a little marimba-like answer at the end of every other bar
  if (b % 2 === 1) [[14, 0], [15, 1]].forEach(([q, k]) => pluck(bt + q * BEAT / 4, c.notes[3 + k] + 12, 0.45, 0.4, 9));
}

// UI sounds, on the picture's cue times
whoosh(3.4, 0.7, 0.7, 0.4, -0.2);        // laptop rises
tick(5.75, 1, 3400, 0.3);                  // click "Beauty"
whoosh(5.95, 0.55, 0.45, 0.6, -0.6, 500, 7000); // page swap
tick(8.5, 1, 3400, -0.1);                  // click the serum
whoosh(8.75, 1.5, 0.75, -0.6, 0.7, 250, 5000);  // card flies to the phone
pop(11.0, 0.9);                             // 30 ml
pop(12.0, 1);                               // Add to bag
pluck(12.75, 81, 0.8, 0.4, 8); pluck(12.85, 86, 0.6, 0.4, 8); // badge
whoosh(13.85, 0.5, 0.45, 0.6, -0.6, 600, 8000); // to checkout
typing(14.5, 15.3);
pop(15.75, 0.9); pop(16.25, 1);
whoosh(16.45, 0.5, 0.35, 0, 0, 300, 2500); // sheet rises
[16.9, 17.05, 17.2, 17.35].forEach((t) => tick(t, 0.6, 2600));
bell(17.55, 74, 1, -0.2); bell(17.7, 81, 0.9, 0.2);        // payment confirmed
whoosh(18.35, 0.5, 0.45, 0.6, -0.6, 600, 8000);  // to tracking
bell(20.4, 79, 0.55, 0.3); bell(20.52, 84, 0.45, 0.3);     // notification
bell(22.95, 69, 0.9, -0.2); bell(23.07, 74, 0.8, 0); bell(23.19, 81, 0.8, 0.2); // delivered
whoosh(23.95, 0.9, 0.6, -0.7, 0.7);                         // both devices
riser(25.3, 1.45, 0.8);
whoosh(26.7, 0.8, 1.1, -1, 1, 150, 9000);                   // the wipe
impact(END, 0.85);
bell(END, 62, 0.6, 0); bell(28.0, 74, 0.5, -0.3); bell(28.25, 81, 0.45, 0.3);

/* ---------------- mix ---------------- */
// Pump the pad and keys under the kick.
const duck = new Float32Array(N).fill(1);
for (let t = DROP; t < BREAK; t += BEAT) {
  const s = Math.floor(t * SR);
  for (let i = 0; i < SR * 0.4 && s + i < N; i++) duck[s + i] = Math.min(duck[s + i], 1 - 0.55 * Math.exp(-(i / SR) * 9));
}
// Schroeder reverb on the send bus.
function reverb(src) {
  const out = [new Float32Array(N), new Float32Array(N)];
  const combs = [1557, 1617, 1491, 1422], aps = [225, 556];
  for (let ch = 0; ch < 2; ch++) {
    const x = src[ch], y = out[ch], spread = ch * 23;
    for (const d0 of combs) {
      const d = d0 + spread, buf = new Float32Array(d); let idx = 0, lp = 0;
      for (let i = 0; i < N; i++) { const o = buf[idx]; lp = o * 0.75 + lp * 0.25; buf[idx] = x[i] + lp * 0.8; idx = (idx + 1) % d; y[i] += o * 0.25; }
    }
    for (const d0 of aps) {
      const d = d0 + spread, buf = new Float32Array(d); let idx = 0;
      for (let i = 0; i < N; i++) { const b = buf[idx], v = -y[i] + b; buf[idx] = y[i] + b * 0.5; y[i] = v; idx = (idx + 1) % d; }
    }
  }
  return out;
}
const verb = reverb(send);
const mix = [new Float32Array(N), new Float32Array(N)];
for (let ch = 0; ch < 2; ch++) {
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let v = drums[ch][i] * 0.9 + bass[ch][i] * 0.85 + pad[ch][i] * duck[i] * 1.0 + keys[ch][i] * (0.6 + 0.4 * duck[i]) + sfx[ch][i] * 0.85 + verb[ch][i] * 0.55;
    if (t > LEN - 0.6) v *= (LEN - t) / 0.6;
    mix[ch][i] = v;
  }
}
let peak = 0;
for (let ch = 0; ch < 2; ch++) for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mix[ch][i]));
const gain = 1.35 / peak;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) for (let ch = 0; ch < 2; ch++) {
  const v = Math.tanh(mix[ch][i] * gain) * 0.89; // gentle saturation, about -1 dBFS
  pcm.writeInt16LE(Math.round(v * 32767), 44 + (i * 2 + ch) * 2);
}
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out', 'music.wav'), pcm);
console.log('out/music.wav');
