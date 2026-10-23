import type { TrackDef } from './types';

/**
 * SUNSET VALLEY — Easy.
 * A flowing valley sprint: four wide sweepers, one creek jump and a long
 * drag to the finish. Generous width, no rails, very forgiving.
 */
export const sunsetValley: TrackDef = {
  id: 'sunset-valley',
  name: 'SUNSET VALLEY',
  tagline: 'Wide sweepers · creek jump · valley sun',
  difficulty: 'Easy',
  pieces: [
    { kind: 'straight', length: 80 },
    { kind: 'curve', length: 105, angle: 0.55, bank: 0.05, width: 16 },
    { kind: 'straight', length: 95 },
    { kind: 'curve', length: 95, angle: -0.85, bank: 0.05, width: 16 },
    { kind: 'straight', length: 85 },
    { kind: 'ramp', length: 28, rise: 3.6 },
    { kind: 'gap', length: 18 },
    { kind: 'straight', length: 60 },
    { kind: 'curve', length: 125, angle: 1.0, bank: 0.08, width: 16 },
    { kind: 'straight', length: 80 },
    { kind: 'curve', length: 100, angle: -1.15, bank: 0.08, width: 16 },
    { kind: 'straight', length: 70, slope: 0.03 },
    { kind: 'curve', length: 115, angle: 1.2, bank: 0.08, width: 16 },
    { kind: 'straight', length: 95, boost: true },
    { kind: 'curve', length: 95, angle: -0.6, width: 16 },
    { kind: 'straight', length: 180 },
    { kind: 'curve', length: 80, angle: 0.35, width: 16 },
    { kind: 'straight', length: 90 }
  ],
  checkpoints: [0.24, 0.48, 0.72],
  palette: {
    skyTop: '#2a7fd0',
    skyBottom: '#ffd7a3',
    fog: '#f2cfae',
    ground: '#79bb52',
    road: '#666e80',
    curbA: '#f7f7f2',
    curbB: '#e2463a',
    accent: '#ffc93c',
    rail: '#c8d2df',
    sun: '#fff1cf'
  },
  scenery: { seed: 20240517, style: 'valley', density: 190 },
  groundY: -2,
  ambient: '#ffe6c2'
};
