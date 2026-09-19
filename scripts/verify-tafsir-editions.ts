/**
 * Curated-edition check.
 *
 * `lib/tafsir/editions.ts` pins the CDN slugs the lessons are taught from, on purpose: a renamed
 * upstream slug must not silently change which commentary a child reads. The cost of pinning is
 * that the pins can rot, so `fetchEditionsIndex` exists to check them against the live index —
 * and until now nothing called it, so that check never ran.
 *
 * This script runs it: every curated edition is looked up in `tafsir/editions.json`, and each one
 * is then fetched for a real verse so a slug that exists in the index but serves nothing is
 * caught too.
 *
 * Usage: `bun scripts/verify-tafsir-editions.ts` — prints a per-edition report and exits
 * non-zero when any curated edition is missing or unreadable. Needs network access.
 */

import {
  ASBAB_EDITION,
  ENGLISH_EDITION,
  SCHOLARLY_EDITION,
  TAMIL_EDITION,
  type TafsirEditionDefinition,
} from '@/lib/tafsir/editions';
import { fetchEditionsIndex, fetchTafsirAyah } from '@/lib/tafsir/tafsirClient';

/** A verse every one of these editions is known to carry, and one only Asbab al-Nuzul has. */
const SAMPLE = { surah: 2, ayah: 255 };

interface Finding {
  edition: string;
  message: string;
}

async function main(): Promise<void> {
  const failures: Finding[] = [];
  const notes: Finding[] = [];

  const curated: readonly TafsirEditionDefinition[] = [
    ENGLISH_EDITION,
    TAMIL_EDITION,
    SCHOLARLY_EDITION,
    ASBAB_EDITION,
  ];

  console.log('Reading the live edition index…');
  let index: Awaited<ReturnType<typeof fetchEditionsIndex>>;
  try {
    index = await fetchEditionsIndex();
  } catch (error: unknown) {
    console.error(
      'The edition index could not be read, so nothing was verified:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }

  const bySlug = new Map(index.map((entry) => [entry.slug, entry]));
  console.log(`Index carries ${index.length} editions.`);

  for (const edition of curated) {
    const row = bySlug.get(edition.slug);
    if (!row) {
      failures.push({ edition: edition.slug, message: 'the live index no longer lists this slug' });
      continue;
    }
    if (row.id !== edition.id) {
      failures.push({
        edition: edition.slug,
        message: `the index now reports id ${row.id}, but this build pins ${edition.id}`,
      });
      continue;
    }
    if (row.name !== edition.name) {
      notes.push({
        edition: edition.slug,
        message: `name upstream is "${row.name}", this build displays "${edition.name}"`,
      });
    }
    if (row.language_name.toLowerCase().slice(0, 2) !== edition.language) {
      failures.push({
        edition: edition.slug,
        message: `the index reports language "${row.language_name}", but the build labels it "${edition.language}"`,
      });
    }
  }

  console.log('\nFetching one verse from each curated edition…');
  for (const edition of curated) {
    try {
      const record = await fetchTafsirAyah(edition, SAMPLE.surah, SAMPLE.ayah);
      if (record === null) {
        // Legitimate for the sparse edition, and only for it.
        if (edition.sparse) {
          notes.push({
            edition: edition.slug,
            message: `no entry for ${SAMPLE.surah}:${SAMPLE.ayah} (expected: this edition is sparse)`,
          });
        } else {
          failures.push({
            edition: edition.slug,
            message: `no entry for ${SAMPLE.surah}:${SAMPLE.ayah}, and this edition is not sparse`,
          });
        }
        continue;
      }
      console.log(
        `  ✓ ${edition.slug} — ${record.text.length} characters for ${SAMPLE.surah}:${SAMPLE.ayah}`
      );
    } catch (error: unknown) {
      failures.push({
        edition: edition.slug,
        message: `could not be fetched: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (notes.length > 0) {
    console.log('\nNotes (not failures):');
    for (const note of notes) console.log(`  ${note.edition}: ${note.message}`);
  }

  if (failures.length > 0) {
    console.error('\nFailures:');
    for (const failure of failures) console.error(`  ${failure.edition}: ${failure.message}`);
    console.error('\nUpdate lib/tafsir/editions.ts to match upstream before shipping.');
    process.exit(1);
  }

  console.log('\nEvery curated edition is present upstream and serves a verse.');
}

void main();
