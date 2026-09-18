/**
 * Lesson pronunciation coverage check.
 *
 * Every activity that shows Arabic should be able to *play* that Arabic without an AI service —
 * that is the whole point of `lib/learning/pronunciation`. This script resolves the Arabic of every
 * activity in the curriculum (each `promptArabic`, every Arabic multiple-choice option, and the
 * verse each instruction quotes) and reports what each one resolves to.
 *
 * It is a network check: text without a verified anchor is located in the Mus'haf through the
 * Quran.com text service. Two things are treated as failures, because both would break the promise
 * silently:
 *   - an activity with a `quranAnchor` that does not resolve to a recorded recitation (broken data),
 *   - a looked-up match whose clip does not exist on the word-by-word CDN (wrong numbering).
 * Text that legitimately has no recording (mnemonics, rule names) is listed as informational, not
 * as a failure — the UI reports those to the learner by name.
 *
 * `bun scripts/verify-lesson-pronunciation.ts` prints the report and exits non-zero when any check
 * fails.
 */

import { CURRICULUM_LEVELS, type Activity } from '@/lib/learning/curriculum';
import type { RecitationSpan } from '@/lib/quran/word-audio';
import {
  firstArabicPhrase,
  pronunciationItems,
  pronunciationSource,
  resolvePronunciation,
  type Pronunciation,
} from '@/lib/learning/pronunciation';

interface Finding {
  path: string;
  text: string;
  resolution: Pronunciation;
}

interface Failure {
  path: string;
  message: string;
}

const findings: Finding[] = [];
const failures: Failure[] = [];

function label(resolution: Pronunciation): string {
  if (resolution.kind === 'quran') {
    return `${pronunciationSource(resolution).label} (${resolution.route}) ${resolution.verseKey} words ${
      resolution.positions[0]
    }-${resolution.positions[resolution.positions.length - 1]}`;
  }
  if (resolution.kind === 'letters') {
    const missing = resolution.missing.length > 0 ? ` (+ missing: ${resolution.missing.join(', ')})` : '';
    return `Letters: ${resolution.letters.map((meta) => meta.nameEn).join(' + ')}${missing}`;
  }
  return `None — ${resolution.reason}`;
}

async function clipExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-64' } });
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}

async function inspect(
  path: string,
  text: string,
  options: { anchor?: RecitationSpan; requireAnchor?: boolean } = {}
): Promise<void> {
  const resolution = await resolvePronunciation(text, { anchor: options.anchor });
  findings.push({ path, text, resolution });

  if (options.requireAnchor) {
    if (resolution.kind !== 'quran') {
      failures.push({ path, message: `Anchored example does not resolve to a recitation: ${label(resolution)}` });
      return;
    }
    if (resolution.route !== 'anchor') {
      failures.push({
        path,
        message: `The anchor was not usable and had to be looked up — check its word count against "${text}".`,
      });
      return;
    }
    const items = pronunciationItems(resolution);
    if (items.length !== resolution.words.length) {
      failures.push({ path, message: `Only ${items.length} of ${resolution.words.length} words have a clip.` });
    }
    return;
  }

  // A looked-up run is only trustworthy if the numbering it produced addresses real clips.
  if (resolution.kind === 'quran' && resolution.route === 'verified') {
    const items = pronunciationItems(resolution);
    if (items.length !== resolution.words.length) {
      failures.push({ path, message: `Only ${items.length} of ${resolution.words.length} looked-up words have a clip.` });
      return;
    }
    const first = items[0].sources[0];
    const last = items[items.length - 1].sources[0];
    const [firstOk, lastOk] = await Promise.all([clipExists(first), clipExists(last)]);
    if (!firstOk || !lastOk) {
      failures.push({
        path,
        message: `Looked-up clips are missing on the CDN (${firstOk ? '' : first} ${lastOk ? '' : last}).`,
      });
    }
  }
}

async function inspectActivity(path: string, activity: Activity): Promise<void> {
  if (activity.promptArabic) {
    await inspect(path, activity.promptArabic, {
      anchor: activity.quranAnchor,
      requireAnchor: activity.quranAnchor !== undefined,
    });
  }

  for (const [index, option] of (activity.options ?? []).entries()) {
    // Options the lab can voice: Arabic only. English rule names are prose.
    if (/[\u0600-\u06FF]/.test(option)) {
      await inspect(`${path} option ${index + 1}`, option);
    }
  }

  const quoted = firstArabicPhrase(activity.instruction);
  if (quoted) {
    await inspect(`${path} instruction quote`, quoted);
  }
}

async function main(): Promise<void> {
  const jobs: Array<{ path: string; activity: Activity }> = [];
  for (const level of CURRICULUM_LEVELS) {
    for (const lesson of level.lessons) {
      for (const activity of lesson.activities) {
        jobs.push({ path: `L${level.level} ${lesson.id}/${activity.id}`, activity });
      }
    }
  }

  const batchSize = 4;
  for (let index = 0; index < jobs.length; index += batchSize) {
    await Promise.all(jobs.slice(index, index + batchSize).map((job) => inspectActivity(job.path, job.activity)));
  }

  const byKind = (kind: Pronunciation['kind']): number =>
    findings.filter((finding) => finding.resolution.kind === kind).length;
  const verified = findings.filter(
    (finding) => finding.resolution.kind === 'quran' && finding.resolution.route === 'verified'
  ).length;

  console.log(`Lesson Arabic resolved to recordings: ${findings.length - byKind('none')}/${findings.length}`);
  console.log(`  Anchored Qur'an runs: ${byKind('quran') - verified}`);
  console.log(`  Looked-up Qur'an runs: ${verified}`);
  console.log(`  Letter runs: ${byKind('letters')}`);

  const unresolved = findings.filter((finding) => finding.resolution.kind === 'none');
  if (unresolved.length > 0) {
    console.log('\nNo recording (each is reported to the learner by name):');
    for (const finding of unresolved) {
      console.log(`  ${finding.path}: "${finding.text}"`);
    }
  }

  const lookedUp = findings.filter(
    (finding) => finding.resolution.kind === 'quran' && finding.resolution.route === 'verified'
  );
  if (lookedUp.length > 0) {
    console.log('\nLocated in the Mus\u2019haf:');
    for (const finding of lookedUp) {
      console.log(`  ${finding.path}: "${finding.text}" -> ${label(finding.resolution)}`);
    }
  }

  if (failures.length > 0) {
    console.error('\nFailures:');
    for (const failure of failures) {
      console.error(`  ${failure.path}: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log('\nEvery anchored example and looked-up run resolves to a real recording.');
}

void main();
