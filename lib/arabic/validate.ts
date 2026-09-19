/**
 * Arabic Lab — curriculum integrity checks.
 *
 * Runs over the authored data (lexicon, dialogs, curriculum) and reports every invariant the
 * dual-track model depends on. Deliberately dependency-free so it can run in a dev route, a
 * script, or Phase 6 CI without a test runner.
 *
 * `npm run verify:arabic` (or `bun lib/arabic/validate.ts`) prints the report and exits non-zero
 * when anything is broken.
 */

import { ARABIC_ALPHABET } from '@/lib/audio/alphabet-audio';
import { ARABIC_DIALOGS } from './dialogs';
import { ARABIC_LEXICON } from './lexicon';
import { ARABIC_LAB_LEVELS } from './curriculum';
import type { IrabCase, IrabSign } from './types';

export interface ArabicLabIntegrityIssue {
  code:
    | 'duplicate-id'
    | 'missing-entry'
    | 'missing-dialog'
    | 'anchor-invariant'
    | 'ayah-range'
    | 'options-invalid'
    | 'build-tokens'
    | 'unknown-letter'
    | 'irab-mismatch'
    | 'tamil-missing'
    | 'xp-mismatch'
    | 'rule-pair-missing'
    | 'level-mismatch'
    | 'unused-dialog'
    | 'empty-collection';
  path: string;
  message: string;
}

const TAMIL_PATTERN = /[\u0B80-\u0BFF]/;

/** Case → which signs may legitimately mark it. */
const ALLOWED_SIGNS: Record<IrabCase, readonly IrabSign[]> = {
  rafʿ: ['damma', 'waw', 'alif', 'none'],
  nasb: ['fatha', 'ya', 'kasra', 'none'],
  jarr: ['kasra', 'ya', 'fatha'],
  jazm: ['sukun', 'none'],
  mabnī: ['none'],
};

function hasTamil(value: string | undefined): boolean {
  return typeof value === 'string' && TAMIL_PATTERN.test(value);
}

function findDuplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

export function validateArabicLabCurriculum(): ArabicLabIntegrityIssue[] {
  const issues: ArabicLabIntegrityIssue[] = [];
  const push = (
    code: ArabicLabIntegrityIssue['code'],
    path: string,
    message: string
  ): void => {
    issues.push({ code, path, message });
  };

  const entryIds = new Set(ARABIC_LEXICON.map((entry) => entry.id));
  const dialogIds = new Set(ARABIC_DIALOGS.map((dialog) => dialog.id));
  const letterIds = new Set(ARABIC_ALPHABET.map((letter) => letter.id));
  const usedDialogIds = new Set<string>();

  // ---- Lexicon -----------------------------------------------------------
  if (ARABIC_LEXICON.length === 0) {
    push('empty-collection', 'lexicon', 'The lexicon is empty.');
  }
  for (const id of findDuplicates(ARABIC_LEXICON.map((entry) => entry.id))) {
    push('duplicate-id', `lexicon.${id}`, `Duplicate lexicon entry id "${id}".`);
  }

  for (const entry of ARABIC_LEXICON) {
    const path = `lexicon.${entry.id}`;

    if (entry.requiresAnchor && !entry.quranic) {
      push('anchor-invariant', path, 'requiresAnchor is true but no Quranic anchor is present.');
    }
    if (entry.derivedFromEntryId && !entryIds.has(entry.derivedFromEntryId)) {
      push(
        'missing-entry',
        path,
        `derivedFromEntryId "${entry.derivedFromEntryId}" is not in the lexicon.`
      );
    }
    if (entry.quranic) {
      const { ref, irab } = entry.quranic;
      if (ref.surah < 1 || ref.surah > 114 || ref.ayah < 1) {
        push('ayah-range', path, `Ayah reference ${ref.surah}:${ref.ayah} is out of range.`);
      }
      if (!ALLOWED_SIGNS[irab.case].includes(irab.sign)) {
        push(
          'irab-mismatch',
          path,
          `Case "${irab.case}" cannot be marked by sign "${irab.sign}".`
        );
      }
      if (!hasTamil(irab.explanationTa) || !hasTamil(irab.spokenNoteTa)) {
        push('tamil-missing', path, 'The iʿrāb explanation / spoken note is missing its Tamil bridge.');
      }
      if (!entry.quranic.ayahTextUthmani.includes(entry.quranic.token.replace(/^بِ/, ''))) {
        push(
          'anchor-invariant',
          path,
          `Token "${entry.quranic.token}" does not appear in the recorded ayah text.`
        );
      }
    }

    if (!hasTamil(entry.spoken.glossTa)) {
      push('tamil-missing', path, 'spoke.glossTa is missing or has no Tamil characters.');
    }
    if (!hasTamil(entry.bridge.noteTa)) {
      push('tamil-missing', path, 'bridge.noteTa is missing or has no Tamil characters.');
    }
    if (entry.root && !hasTamil(entry.root.meaningTa)) {
      push('tamil-missing', path, 'root.meaningTa is missing or has no Tamil characters.');
    }
  }

  // ---- Dialogs -----------------------------------------------------------
  for (const id of findDuplicates(ARABIC_DIALOGS.map((dialog) => dialog.id))) {
    push('duplicate-id', `dialogs.${id}`, `Duplicate dialog id "${id}".`);
  }
  for (const dialog of ARABIC_DIALOGS) {
    const path = `dialogs.${dialog.id}`;
    if (dialog.turns.length === 0) {
      push('empty-collection', path, 'Dialog has no turns.');
    }
    for (const targetId of dialog.targetEntryIds) {
      if (!entryIds.has(targetId)) {
        push('missing-entry', path, `targetEntryIds references unknown entry "${targetId}".`);
      }
    }
    for (const [index, turn] of dialog.turns.entries()) {
      if (!hasTamil(turn.glossTa)) {
        push('tamil-missing', `${path}.turn${index + 1}`, 'Turn is missing its Tamil gloss.');
      }
      if (!turn.arabicMsa.trim()) {
        push('empty-collection', `${path}.turn${index + 1}`, 'Turn has no MSA text.');
      }
    }
  }

  // ---- Curriculum --------------------------------------------------------
  const levelIds = ARABIC_LAB_LEVELS.map((level) => level.id);
  for (const id of findDuplicates(levelIds)) {
    push('duplicate-id', `levels.${id}`, `Duplicate level id "${id}".`);
  }

  const lessonIds: string[] = [];
  const activityIds: string[] = [];

  for (const [levelIndex, level] of ARABIC_LAB_LEVELS.entries()) {
    const levelPath = `levels.${level.id}`;
    if (level.lessons.length === 0) {
      push('empty-collection', levelPath, 'Level has no lessons.');
    }
    if (level.index !== levelIndex + 1) {
      push('level-mismatch', levelPath, `index ${level.index} does not match position ${levelIndex + 1}.`);
    }
    if (!hasTamil(level.summaryTa)) {
      push('tamil-missing', levelPath, 'Level summaryTa is missing Tamil characters.');
    }
    const previous = ARABIC_LAB_LEVELS[levelIndex - 1];
    if (previous && level.requiredXp < previous.requiredXp) {
      push('level-mismatch', levelPath, 'requiredXp decreases compared to the previous level.');
    }

    for (const lesson of level.lessons) {
      const lessonPath = `levels.${level.id}.${lesson.id}`;
      lessonIds.push(lesson.id);

      if (lesson.level !== level.id) {
        push('level-mismatch', lessonPath, `lesson.level "${lesson.level}" ≠ "${level.id}".`);
      }
      if (lesson.activities.length === 0) {
        push('empty-collection', lessonPath, 'Lesson has no activities.');
      }
      if (!hasTamil(lesson.objectiveTa)) {
        push('tamil-missing', lessonPath, 'Lesson objectiveTa is missing Tamil characters.');
      }
      if (!level.tracks.includes(lesson.track)) {
        push('level-mismatch', lessonPath, `Track "${lesson.track}" is not declared on the level.`);
      }

      const needsRulePair = lesson.track === 'grammar' || lesson.track === 'register';
      if (needsRulePair && !lesson.rulePair) {
        push(
          'rule-pair-missing',
          lessonPath,
          'Grammar/register lessons must state a rulePair (classical ↔ spoken).'
        );
      }
      if (lesson.rulePair) {
        for (const [field, value] of Object.entries({
          ruleNameTa: lesson.rulePair.ruleNameTa,
          transferNoteTa: lesson.rulePair.transferNoteTa,
          classicalNoteTa: lesson.rulePair.classical.noteTa,
          spokenNoteTa: lesson.rulePair.spoken.noteTa,
        })) {
          if (!hasTamil(value)) {
            push('tamil-missing', `${lessonPath}.rulePair.${field}`, `${field} is missing Tamil characters.`);
          }
        }
      }

      const activityXp = lesson.activities.reduce((sum, activity) => sum + activity.xpReward, 0);
      if (activityXp !== lesson.xpReward) {
        push(
          'xp-mismatch',
          lessonPath,
          `xpReward ${lesson.xpReward} ≠ sum of activity XP ${activityXp}.`
        );
      }

      for (const activity of lesson.activities) {
        const activityPath = `${lessonPath}.${activity.id}`;
        activityIds.push(activity.id);

        // Pure motor drills (stroke_trace) intentionally need no vocabulary; everything else
        // must point at the lexical spine so the two registers stay paired.
        if (activity.entryIds.length === 0 && activity.type !== 'stroke_trace') {
          push('missing-entry', activityPath, 'Activity references no lexicon entries.');
        }
        for (const entryId of activity.entryIds) {
          if (!entryIds.has(entryId)) {
            push('missing-entry', activityPath, `Activity references unknown entry "${entryId}".`);
          }
        }
        if (!hasTamil(activity.instructionTa)) {
          push('tamil-missing', activityPath, 'instructionTa is missing Tamil characters.');
        }

        switch (activity.type) {
          case 'irab_parse':
          case 'register_compare':
          case 'tashkeel_placement':
          case 'letter_join':
          case 'sarf_match': {
            if (activity.options.length < 2) {
              push('options-invalid', activityPath, 'Needs at least two options.');
            }
            if (!activity.options.includes(activity.correctAnswer)) {
              push('options-invalid', activityPath, 'correctAnswer is not one of the options.');
            }
            if (findDuplicates(activity.options).length > 0) {
              push('options-invalid', activityPath, 'Options contain duplicates.');
            }
            if (!hasTamil(activity.explanationTa)) {
              push('tamil-missing', activityPath, 'explanationTa is missing Tamil characters.');
            }
            break;
          }
          case 'spoken_build': {
            const expected = [...activity.tokens].sort().join(' ');
            const actual = activity.correctAnswer.split(/\s+/).sort().join(' ');
            if (expected !== actual) {
              push(
                'build-tokens',
                activityPath,
                `correctAnswer "${activity.correctAnswer}" is not a permutation of tokens [${activity.tokens.join(', ')}].`
              );
            }
            if (!hasTamil(activity.explanationTa)) {
              push('tamil-missing', activityPath, 'explanationTa is missing Tamil characters.');
            }
            break;
          }
          case 'stroke_trace': {
            if (!letterIds.has(activity.writing.letterId)) {
              push(
                'unknown-letter',
                activityPath,
                `writing.letterId "${activity.writing.letterId}" is not an ARABIC_ALPHABET id.`
              );
            }
            break;
          }
          case 'dialogue_listen': {
            if (!dialogIds.has(activity.dialogId)) {
              push('missing-dialog', activityPath, `Unknown dialogId "${activity.dialogId}".`);
            }
            usedDialogIds.add(activity.dialogId);
            break;
          }
          case 'dictation': {
            if (!activity.dictationText.trim()) {
              push('empty-collection', activityPath, 'dictationText is empty.');
            }
            if (!hasTamil(activity.explanationTa)) {
              push('tamil-missing', activityPath, 'explanationTa is missing Tamil characters.');
            }
            break;
          }
        }
      }
    }
  }

  for (const id of findDuplicates(lessonIds)) {
    push('duplicate-id', 'lessons', `Duplicate lesson id "${id}".`);
  }
  for (const id of findDuplicates(activityIds)) {
    push('duplicate-id', 'activities', `Duplicate activity id "${id}".`);
  }
  for (const dialog of ARABIC_DIALOGS) {
    if (!usedDialogIds.has(dialog.id)) {
      push('unused-dialog', `dialogs.${dialog.id}`, 'Dialog is not referenced by any activity.');
    }
  }

  return issues;
}

/** Throws with a readable summary when the authored data breaks an invariant. */
export function assertArabicLabIntegrity(): void {
  const issues = validateArabicLabCurriculum();
  if (issues.length === 0) return;
  const report = issues.map((issue) => `  [${issue.code}] ${issue.path}: ${issue.message}`).join('\n');
  throw new Error(`Arabic Lab curriculum integrity failed (${issues.length}):\n${report}`);
}

export function summarizeArabicLabCurriculum(): {
  levels: number;
  lessons: number;
  activities: number;
  entries: number;
  anchored: number;
  dialogs: number;
  issues: number;
} {
  const lessons = ARABIC_LAB_LEVELS.flatMap((level) => level.lessons);
  return {
    levels: ARABIC_LAB_LEVELS.length,
    lessons: lessons.length,
    activities: lessons.reduce((sum, lesson) => sum + lesson.activities.length, 0),
    entries: ARABIC_LEXICON.length,
    anchored: ARABIC_LEXICON.filter((entry) => entry.quranic).length,
    dialogs: ARABIC_DIALOGS.length,
    issues: validateArabicLabCurriculum().length,
  };
}

// ---------------------------------------------------------------------------
// Standalone runner: `bun lib/arabic/validate.ts`
// ---------------------------------------------------------------------------
const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((arg) => arg.endsWith('validate.ts') || arg.endsWith('validate.js'));

if (isDirectRun) {
  const summary = summarizeArabicLabCurriculum();
  const issues = validateArabicLabCurriculum();
  console.log('Arabic Lab curriculum:', summary);
  if (issues.length === 0) {
    console.log('✔ All integrity checks passed.');
  } else {
    console.error(`✘ ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`  [${issue.code}] ${issue.path}: ${issue.message}`);
    }
    process.exitCode = 1;
  }
}
