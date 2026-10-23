import type { Vector3 } from 'three';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

/** Per-piece behaviour flags. */
export interface PieceFlags {
  /** Solid barriers on both sides instead of falling off. */
  rails?: boolean;
  /** Accelerator pad surface. */
  boost?: boolean;
  /** Full road width in metres (default 14). */
  width?: number;
}

export type TrackPiece =
  | { kind: 'straight'; length: number; slope?: number }
  | { kind: 'curve'; length: number; angle: number; bank?: number; slope?: number }
  | { kind: 'ramp'; length: number; rise: number }
  | { kind: 'loop'; radius: number; drift?: number }
  | { kind: 'gap'; length: number };

export type Piece = TrackPiece & PieceFlags;

export interface TrackPalette {
  skyTop: string;
  skyBottom: string;
  fog: string;
  ground: string;
  road: string;
  curbA: string;
  curbB: string;
  accent: string;
  rail: string;
  sun: string;
}

export interface SceneryConfig {
  seed: number;
  style: 'valley' | 'canyon' | 'ice';
  density: number;
}

export interface TrackDef {
  id: string;
  name: string;
  tagline: string;
  difficulty: Difficulty;
  pieces: Piece[];
  /** Normalised checkpoint positions (0..1 of total length). */
  checkpoints: number[];
  palette: TrackPalette;
  scenery: SceneryConfig;
  groundY: number;
  ambient: string;
}

export interface CenterlineSample {
  pos: Vector3;
  tangent: Vector3;
  right: Vector3;
  up: Vector3;
  halfWidth: number;
  s: number;
  /** Signed horizontal curvature (rad per metre, positive = left turn). */
  curvature: number;
  solid: boolean;
  boost: boolean;
  rails: boolean;
}

export interface LocalFrame {
  pos: Vector3;
  tangent: Vector3;
  right: Vector3;
  up: Vector3;
  halfWidth: number;
  s: number;
  curvature: number;
  solid: boolean;
  boost: boolean;
  rails: boolean;
}

export interface SurfaceHit extends LocalFrame {
  /** Lateral offset from the centreline in metres. */
  n: number;
  /** Signed height above the road surface along the local up axis. */
  height: number;
}
