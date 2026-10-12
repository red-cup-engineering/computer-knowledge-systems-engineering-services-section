import type { Door, Grade, Hall, Kata, Room, RoomId } from './types.d.ts';

export function autoKataPath(hall: Hall, doors: readonly Door[], rooms: readonly Room[]): RoomId[];
export function makeAutoKata(hall: Hall, doors: readonly Door[], rooms: readonly Room[]): Kata;

export type KataOutcome = 'again' | 'hard' | 'good' | 'easy';

export interface KataCardResult {
  outcome: KataOutcome;
  responseTimeMs: number;
  tFastMs: number;
}

export function scoreCard(result: KataCardResult): number;
export function kataRatio(results: readonly KataCardResult[]): number;
export const BELT_THRESHOLDS: ReadonlyArray<{ belt: string; min: number }>;
export function beltForRatio(ratio: number): string;
export function awardedBelt(lastThreeRatios: readonly number[]): string;
export function ratioToGrade(ratio: number): Grade;
