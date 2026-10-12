import type { CardKind, Door, ReviewCard, Room } from './types.d.ts';

export interface ExerciseMatch {
  question: string;
  answer: string;
}

export function extractExercises(body: string): ExerciseMatch[];

export interface AliasSpan {
  start: number;
  end: number;
  matched: string;
}

export function findAliasSpan(text: string, aliases: readonly string[]): AliasSpan | null;

export function generateCardsForRoom(
  room: Room,
  dependencyDoors: readonly Door[],
  roomTitleOf: (id: string) => string,
): ReviewCard[];
