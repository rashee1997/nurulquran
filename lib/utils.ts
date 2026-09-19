import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Uniform Fisher–Yates shuffle.
 *
 * Quiz builders previously used `sort(() => 0.5 - Math.random())`, which is not a
 * uniform shuffle: comparison-based shuffling leaves the correct answer in the
 * first position noticeably more often than chance, so learners could pass an
 * exercise by always tapping the top option. Returns a new array.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = result[i]
    const target = result[j]
    if (current === undefined || target === undefined) continue
    result[i] = target
    result[j] = current
  }
  return result
}
