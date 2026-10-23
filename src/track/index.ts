import type { TrackDef } from './types';
import { sunsetValley } from './track-1-valley';
import { neonCanyon } from './track-2-canyon';
import { vertexLoop } from './track-3-vertex';

export const TRACKS: TrackDef[] = [sunsetValley, neonCanyon, vertexLoop];

export function getTrackDef(id: string): TrackDef {
  return TRACKS.find((track) => track.id === id) ?? TRACKS[0];
}

export * from './types';
export { buildTrack, buildCenterline, disposeTrack } from './builder';
export { TrackQuery } from './query';
