/**
 * Shared vocabulary for recitation verdicts.
 *
 * Kept free of server-only dependencies (Zod, provider SDKs) so client components
 * and hooks can import the types without pulling validation code into the browser
 * bundle. `lib/api/schemas.ts` builds its Zod enums from these values.
 */

export const ACCURACY_RATINGS = ['Excellent', 'Good', 'Needs Practice', 'Polished'] as const;

export type AccuracyRating = (typeof ACCURACY_RATINGS)[number];

export function isAccuracyRating(value: unknown): value is AccuracyRating {
  return typeof value === 'string' && (ACCURACY_RATINGS as readonly string[]).includes(value);
}
