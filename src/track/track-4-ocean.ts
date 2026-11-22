import type { TrackDef } from './types';

/**
 * OCEAN BRIDGE — Very Hard. (~4.07 km)
 *
 * A suspension bridge across open water: long sweepers, two wall-style corners
 * banked to ~69°, three full 360° vertical loops and two kinds of timed
 * machinery. Hazard positions are arc lengths in metres, so they sit exactly
 * on the straights below.
 */
export const oceanBridge: TrackDef = {
  id: 'ocean-bridge',
  name: 'OCEAN BRIDGE',
  tagline: 'Vertical loops · wall runs · timed machinery',
  difficulty: 'Very Hard',
  pieces: [
    { kind: 'straight', length: 150, slope: 0.01 },
    { kind: 'curve', length: 170, angle: 1.75, bank: 0.16, width: 16 },
    { kind: 'straight', length: 90 },
    { kind: 'curve', length: 150, angle: -1.6, bank: 0.16, width: 15 },
    { kind: 'straight', length: 110, boost: true, width: 15 },
    // Loop 1 — fed by the boost pad at 560 m.
    { kind: 'loop', radius: 17, drift: 12, width: 12 },
    { kind: 'straight', length: 45, width: 14 },
    { kind: 'curve', length: 190, angle: 2.1, bank: 0.18, width: 15 },
    { kind: 'straight', length: 80, width: 14 },
    { kind: 'straight', length: 34, width: 14 },
    { kind: 'straight', length: 68, width: 14 },
    { kind: 'curve', length: 200, angle: -1.9, bank: 0.2, width: 15 },
    { kind: 'curve', length: 130, angle: 1.25, bank: 1.2, bankRamp: 30, rails: true, width: 14 },
    { kind: 'straight', length: 90, rails: true, width: 14 },
    { kind: 'curve', length: 130, angle: -1.25, bank: 1.2, bankRamp: 30, rails: true, width: 14 },
    { kind: 'straight', length: 100 },
    { kind: 'ramp', length: 28, rise: 4.6, width: 15 },
    { kind: 'gap', length: 26, width: 15 },
    { kind: 'straight', length: 90 },
    { kind: 'curve', length: 205, angle: 2.3, bank: 0.22, width: 15 },
    { kind: 'straight', length: 100, boost: true },
    // Loop 2 — after the long right-hander and its boost straight.
    { kind: 'loop', radius: 17, drift: 12, width: 12 },
    { kind: 'straight', length: 60, width: 14 },
    { kind: 'curve', length: 170, angle: -1.7, bank: 0.16, width: 15 },
    { kind: 'straight', length: 110 },
    { kind: 'straight', length: 30, width: 14 },
    { kind: 'straight', length: 80, width: 14 },
    { kind: 'curve', length: 210, angle: 1.95, bank: 0.2, width: 15 },
    { kind: 'straight', length: 70, width: 13 },
    { kind: 'straight', length: 28, width: 13 },
    { kind: 'straight', length: 100 },
    { kind: 'curve', length: 180, angle: -1.85, bank: 0.18, width: 15 },
    { kind: 'straight', length: 100, boost: true },
    // Loop 3 — smaller radius, tighter line.
    { kind: 'loop', radius: 16, drift: 11, width: 12 },
    { kind: 'curve', length: 140, angle: 1.5, bank: 0.14, width: 16 },
    { kind: 'straight', length: 100, slope: -0.02 },
    { kind: 'curve', length: 110, angle: -0.9, bank: 0.1, width: 16 },
    { kind: 'straight', length: 80 }
  ],
  checkpoints: [0.113, 0.241, 0.44, 0.516, 0.705, 0.836],
  hazards: [
    // 1092–1126 m — deck folds open over the water, right after the sweepers.
    { kind: 'collapse', at: 1092, length: 34, period: 3.8, duty: 0.58 },
    // 1150 m — alternating gate before the banking section.
    { kind: 'gate', at: 1150, period: 4, duty: 0.5 },
    // 2680 m — second gate, ahead of the middle folding deck.
    { kind: 'gate', at: 2680, period: 4.4, phase: 0.25, duty: 0.5 },
    // 2740–2770 m — second folding deck.
    { kind: 'collapse', at: 2740, length: 30, period: 4.2, phase: 0.4, duty: 0.58 },
    // 3130–3158 m — third folding deck, just before the last sweeper.
    { kind: 'collapse', at: 3130, length: 28, period: 3.6, phase: 0.2, duty: 0.6 }
  ],
  palette: {
    skyTop: '#0d3f6e',
    skyBottom: '#93efe4',
    fog: '#b7e9ef',
    ground: '#1f7ba8',
    road: '#2b3340',
    curbA: '#ffffff',
    curbB: '#ff5a3c',
    accent: '#ffc93c',
    rail: '#e8f4ff',
    sun: '#fff6d8'
  },
  scenery: { seed: 447193, style: 'ocean', density: 260 },
  groundY: -46,
  ambient: '#c3ecff'
};
