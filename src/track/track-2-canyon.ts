import type { TrackDef } from './types';

/**
 * NEON CANYON — Medium.
 * A technical canyon run: narrow railed ledges, two cliff gaps, big banked
 * sweepers and accelerator pads right before the jumps.
 */
export const neonCanyon: TrackDef = {
  id: 'neon-canyon',
  name: 'NEON CANYON',
  tagline: 'Cliff gaps · banked sweepers · neon dusk',
  difficulty: 'Medium',
  pieces: [
    { kind: 'straight', length: 70 },
    { kind: 'curve', length: 105, angle: -0.75, bank: 0.12 },
    { kind: 'straight', length: 80 },
    { kind: 'curve', length: 90, angle: 0.65, bank: 0.14 },
    { kind: 'straight', length: 70, boost: true },
    { kind: 'ramp', length: 28, rise: 4.4 },
    { kind: 'gap', length: 24 },
    { kind: 'straight', length: 75 },
    { kind: 'curve', length: 115, angle: 1.25, bank: 0.18, width: 14 },
    { kind: 'straight', length: 55, width: 11, rails: true },
    { kind: 'curve', length: 75, angle: -0.95, bank: 0.1, width: 13 },
    { kind: 'straight', length: 90 },
    { kind: 'ramp', length: 24, rise: 3.2 },
    { kind: 'gap', length: 22 },
    { kind: 'straight', length: 65, boost: true },
    { kind: 'curve', length: 105, angle: 1.0, bank: 0.16 },
    { kind: 'straight', length: 100 },
    { kind: 'curve', length: 100, angle: -1.35, bank: 0.2 },
    { kind: 'straight', length: 65, width: 11, rails: true },
    { kind: 'curve', length: 85, angle: 0.8, bank: 0.12 },
    { kind: 'straight', length: 150 },
    { kind: 'curve', length: 90, angle: -0.55, bank: 0.1 },
    { kind: 'straight', length: 120 },
    { kind: 'curve', length: 85, angle: 0.4 },
    { kind: 'straight', length: 110 }
  ],
  checkpoints: [0.2, 0.4, 0.6, 0.8],
  palette: {
    skyTop: '#241542',
    skyBottom: '#ff7a5c',
    fog: '#b4636b',
    ground: '#8c4a33',
    road: '#3a3446',
    curbA: '#ffc93c',
    curbB: '#ff5a3c',
    accent: '#2ec4ff',
    rail: '#2ec4ff',
    sun: '#ffb27a'
  },
  scenery: { seed: 771209, style: 'canyon', density: 200 },
  groundY: -34,
  ambient: '#c07a8e'
};
