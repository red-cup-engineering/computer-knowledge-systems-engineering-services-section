export interface FcaObject<Id> {
  id: Id;
  attrs: ReadonlySet<string>;
}

export interface FormalConcept<Id> {
  intent: string[];
  extent: Id[];
}

export const ATTRIBUTE_CEILING: number;
export const CONCEPT_CEILING: number;

export interface ComputeHallsResult<Id> {
  concepts: FormalConcept<Id>[];
  fellBackToGreedy: boolean;
  fallbackReason: 'attribute-ceiling' | 'concept-ceiling' | null;
}

export function computeHalls<Id>(
  objects: readonly FcaObject<Id>[],
  idOf: (id: Id) => string,
): ComputeHallsResult<Id>;
