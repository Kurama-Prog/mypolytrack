import type { TrackDef } from './types';

/**
 * VERTEX LOOP — Hard.
 * The longest circuit: a full vertical loop, exposed ice bridges, three
 * accelerator pads and a blind crest before the finish.
 */
export const vertexLoop: TrackDef = {
  id: 'vertex-loop',
  name: 'VERTEX LOOP',
  tagline: 'Vertical loop · ice bridges · blind crest',
  difficulty: 'Hard',
  pieces: [
    { kind: 'straight', length: 140, slope: 0.01 },
    { kind: 'curve', length: 120, angle: 1.4, bank: 0.1, width: 15 },
    { kind: 'straight', length: 100 },
    { kind: 'curve', length: 95, angle: -1.0, bank: 0.12, width: 15 },
    { kind: 'straight', length: 140, slope: 0.05 },
    { kind: 'curve', length: 105, angle: 1.2, bank: 0.16, width: 14 },
    { kind: 'straight', length: 70, boost: true, width: 14 },
    { kind: 'loop', radius: 17, drift: 12, width: 12 },
    { kind: 'straight', length: 100, width: 14 },
    { kind: 'curve', length: 125, angle: -1.6, bank: 0.2, width: 14 },
    { kind: 'straight', length: 60, width: 10, rails: true },
    { kind: 'curve', length: 85, angle: 1.1, bank: 0.12, width: 12 },
    { kind: 'straight', length: 70, width: 10, rails: true },
    { kind: 'ramp', length: 30, rise: 5.2, width: 13 },
    { kind: 'gap', length: 28, width: 13 },
    { kind: 'straight', length: 100 },
    { kind: 'curve', length: 135, angle: 1.5, bank: 0.18, width: 15 },
    { kind: 'straight', length: 120, boost: true },
    { kind: 'curve', length: 95, angle: -1.2, bank: 0.14, width: 15 },
    { kind: 'straight', length: 130, slope: -0.04 },
    { kind: 'curve', length: 105, angle: 0.9, bank: 0.1, width: 16 },
    { kind: 'straight', length: 90 },
    { kind: 'curve', length: 90, angle: -0.45, width: 16 },
    { kind: 'straight', length: 150 }
  ],
  checkpoints: [0.12, 0.28, 0.45, 0.62, 0.8],
  palette: {
    skyTop: '#0a2a5e',
    skyBottom: '#8ed4ff',
    fog: '#b7dcf7',
    ground: '#e8f4ff',
    road: '#26374f',
    curbA: '#ffffff',
    curbB: '#ff3d8f',
    accent: '#2ec4ff',
    rail: '#9fe8ff',
    sun: '#ffffff'
  },
  scenery: { seed: 918273, style: 'ice', density: 210 },
  groundY: -8,
  ambient: '#d5ecff'
};
