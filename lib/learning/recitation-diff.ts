import { normalizeForSearch } from '@/lib/quran/arabic-text';
import type { RecitationMistakeKind } from '@/lib/db';

/**
 * Word-level alignment of a recitation transcript against the verse it should be.
 *
 * The transcript comes from speech recognition and the reference from the verified text.
 * Both are normalised (diacritics and orthographic variants removed) and aligned with a
 * Levenshtein-style dynamic programme over *words*, so the output names which reference
 * words were skipped, which were replaced by something else, and which extra words were
 * inserted. The model never supplies scripture; it only supplies what it heard.
 */

export interface AlignedWord {
  /** 1-based index in the reference verse; 0 for an inserted word with no reference. */
  wordIndex: number;
  expected: string;
  heard?: string;
  status: 'match' | RecitationMistakeKind;
}

export interface RecitationDiff {
  words: AlignedWord[];
  matched: number;
  total: number;
  /** 0–100, share of reference words recited correctly. */
  accuracy: number;
  mistakes: AlignedWord[];
}

function tokens(text: string): string[] {
  return normalizeForSearch(text)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** Two normalised words count as the same when they differ by at most one edit (ASR slack). */
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length < 4 || b.length < 4) return false;
  // Single edit check (insertion, deletion or substitution).
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  edits += a.length - i + (b.length - j);
  return edits <= 1;
}

export function diffRecitation(referenceText: string, transcript: string, referenceWords?: readonly string[]): RecitationDiff {
  const reference = referenceWords ? referenceWords.map((w) => normalizeForSearch(w)).filter(Boolean) : tokens(referenceText);
  const display = referenceWords ? [...referenceWords] : referenceText.trim().split(/\s+/);
  const heard = tokens(transcript);

  const n = reference.length;
  const m = heard.length;
  // dp[i][j] = minimal cost aligning reference[0..i) with heard[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i;
  for (let j = 1; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const substitution = dp[i - 1][j - 1] + (similar(reference[i - 1], heard[j - 1]) ? 0 : 1);
      dp[i][j] = Math.min(substitution, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }

  const aligned: AlignedWord[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const isSimilar = similar(reference[i - 1], heard[j - 1]);
      if (dp[i][j] === dp[i - 1][j - 1] + (isSimilar ? 0 : 1)) {
        aligned.push({
          wordIndex: i,
          expected: display[i - 1] ?? reference[i - 1],
          heard: heard[j - 1],
          status: isSimilar ? 'match' : 'substituted',
        });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      aligned.push({ wordIndex: i, expected: display[i - 1] ?? reference[i - 1], status: 'skipped' });
      i--;
      continue;
    }
    aligned.push({ wordIndex: 0, expected: '', heard: heard[j - 1], status: 'inserted' });
    j--;
  }
  aligned.reverse();

  const matched = aligned.filter((w) => w.status === 'match').length;
  const mistakes = aligned.filter((w) => w.status !== 'match');
  return {
    words: aligned,
    matched,
    total: n,
    accuracy: n === 0 ? 0 : Math.round((matched / n) * 100),
    mistakes,
  };
}

/** Maps recitation accuracy to the 0–5 grading scale used by the scheduler. */
export function qualityFromAccuracy(accuracy: number, mistakes: number): number {
  if (accuracy >= 100) return 5;
  if (accuracy >= 90 && mistakes <= 1) return 4;
  if (accuracy >= 75) return 3;
  if (accuracy >= 50) return 2;
  return 1;
}
