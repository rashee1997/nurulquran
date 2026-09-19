/**
 * Ayah Assembly layout check.
 *
 * `lib/games/word-layout.ts` decides where each word of an ayah sits on the game's canvas. Every
 * way that layout can fail is invisible to a type check and produces no error at runtime — it just
 * paints words on top of each other, or off the stage, or under the assembly tray:
 *
 *   1. **Cards never overlap, including while they float.** Each card drifts up to DRIFT_X /
 *      DRIFT_Y from its base position every frame, so a cell has to reserve that much clearance on
 *      each side. The layout this replaced pinned four columns and a 110x52 card inside a 460px
 *      stage, so Al-Baqarah 2:282 (~50 words) stacked thirteen rows of 52px cards into ~21px of
 *      space each — an unreadable pile. That is the class of bug this file exists to catch.
 *   2. **Cards stay on the stage and clear of the tray.** The assembly tray is absolutely
 *      positioned over the bottom of the stage, so anything laid out beneath it is hidden and
 *      untappable.
 *   3. **The grid actually holds every word, at a usable size.** `stageHeightForWordCount` grows
 *      the stage until the narrowest supported viewport still gets a card at least
 *      `MIN_USABLE_CARD_W` x `MIN_USABLE_CARD_H`, so no width in the swept range may fall below
 *      that. A card 12px tall is technically non-overlapping and still unplayable.
 *   4. **The text sizing rules stay sane**: the Arabic floor holds, and the transliteration is
 *      dropped on cards too short for it rather than crammed in at an illegible size.
 *
 * Word counts 1..60 are swept because the longest ayah in the mushaf (2:282) runs around 50 words
 * by whitespace, and the game draws verses from all 114 surahs. Widths cover a small phone through
 * a wide desktop.
 *
 * Not asserted: the 18-frame shake on a wrong tap nudges a card by up to 6px, which on the densest
 * boards can clip a neighbour for a fraction of a second. Only one card shakes at a time and it
 * draws last, so that is accepted rather than reserved for in the gaps.
 *
 * Usage: `bun scripts/verify-ayah-assembly-layout.ts` — prints a report and exits non-zero on any
 * failure. Offline.
 */

import {
  CARD_GAP_X,
  CARD_GAP_Y,
  DRIFT_X,
  DRIFT_Y,
  MAX_CARD_H,
  MAX_CARD_W,
  MAX_COLS,
  MAX_STAGE_HEIGHT,
  MIN_ARABIC_FONT_PX,
  MIN_USABLE_CARD_H,
  MIN_USABLE_CARD_W,
  STAGE_HEIGHT,
  TRAY_RESERVE,
  arabicFontSize,
  planWordGrid,
  shouldShowTranslit,
  stageHeightForWordCount,
  translitFontSize,
} from '@/lib/games/word-layout';

/** Small phone through wide desktop. */
const WIDTHS = [320, 360, 414, 768, 960, 1280, 1600];
const MIN_WORDS = 1;
const MAX_WORDS = 60;

/**
 * Sanity floors, not design clamps. The layout deliberately has no minimum card size — clamping a
 * card up past its cell is what reintroduces overlap — so these only catch a degenerate collapse.
 * Measured sizes are reported below so the ergonomics stay visible instead of assumed.
 */
const SANITY_CARD_W = 24;
const SANITY_CARD_H = 8;


interface Failure {
  scenario: string;
  message: string;
}

const failures: Failure[] = [];

function fail(scenario: string, message: string): void {
  failures.push({ scenario, message });
}

function assert(condition: boolean, scenario: string, message: string): void {
  if (!condition) fail(scenario, message);
}

function approxEqual(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(a - b) <= tolerance;
}

/* ------------------------------ grid invariants ---------------------------- */

function checkGrid(stageWidth: number, wordCount: number): void {
  const stageHeight = stageHeightForWordCount(wordCount);
  const grid = planWordGrid(stageWidth, stageHeight, wordCount);
  const scenario = `${stageWidth}px / ${wordCount} words`;

  // The grid has to hold every word, and use cells rather than one row of 60.
  assert(
    grid.cols * grid.rows >= wordCount,
    scenario,
    `grid ${grid.cols}x${grid.rows} cannot hold ${wordCount} words`
  );
  assert(grid.cols <= MAX_COLS, scenario, `cols ${grid.cols} exceeds the ${MAX_COLS}-column cap`);
  assert(grid.cols <= wordCount, scenario, `cols ${grid.cols} exceeds the ${wordCount} words available`);
  assert(grid.rows >= 1 && grid.cols >= 1, scenario, `degenerate grid ${grid.cols}x${grid.rows}`);

  assert(
    approxEqual(grid.padX + grid.cols * grid.cellW, stageWidth - grid.padX),
    scenario,
    'the grid does not span the usable width, so cells and padding disagree'
  );

  // Horizontal: neighbouring card centres are cellW apart. Two cards touch when the half-extent
  // plus the drift reaches the next centre.
  const halfSlackX = (grid.cellW - grid.cardW) / 2;
  assert(
    halfSlackX >= DRIFT_X,
    scenario,
    `only ${halfSlackX.toFixed(1)}px of side clearance for a ${DRIFT_X}px drift — cards can overlap`
  );
  const halfSlackY = (grid.cellH - grid.cardH) / 2;
  assert(
    halfSlackY >= DRIFT_Y,
    scenario,
    `only ${halfSlackY.toFixed(1)}px of vertical clearance for a ${DRIFT_Y}px drift — rows can overlap`
  );

  // Bounds, at the extremes of the drift.
  const leftEdge = grid.padX + grid.cellW / 2 - grid.cardW / 2 - DRIFT_X;
  const rightEdge =
    grid.padX + (grid.cols - 1) * grid.cellW + grid.cellW / 2 + grid.cardW / 2 + DRIFT_X;
  const topEdge = grid.padY + grid.cellH / 2 - grid.cardH / 2 - DRIFT_Y;
  const bottomEdge =
    grid.padY + (grid.rows - 1) * grid.cellH + grid.cellH / 2 + grid.cardH / 2 + DRIFT_Y;

  assert(leftEdge >= 0, scenario, `cards drift ${(-leftEdge).toFixed(1)}px off the left edge`);
  assert(
    rightEdge <= stageWidth,
    scenario,
    `cards drift ${(rightEdge - stageWidth).toFixed(1)}px off the right edge`
  );
  assert(topEdge >= 0, scenario, `cards drift ${(-topEdge).toFixed(1)}px above the stage`);
  assert(
    bottomEdge <= stageHeight - TRAY_RESERVE,
    scenario,
    `cards reach ${bottomEdge.toFixed(1)}px down a ${stageHeight}px stage, under the ${TRAY_RESERVE}px tray`
  );

  assert(grid.cardW >= SANITY_CARD_W, scenario, `card width ${grid.cardW.toFixed(1)}px collapsed`);
  assert(grid.cardH >= SANITY_CARD_H, scenario, `card height ${grid.cardH.toFixed(1)}px collapsed`);
  // The stage height exists to guarantee these at any width in the swept range.
  assert(
    grid.cardW >= MIN_USABLE_CARD_W,
    scenario,
    `card width ${grid.cardW.toFixed(1)}px is below the usable minimum (${MIN_USABLE_CARD_W}px)`
  );
  assert(
    grid.cardH >= MIN_USABLE_CARD_H,
    scenario,
    `card height ${grid.cardH.toFixed(1)}px is below the usable minimum (${MIN_USABLE_CARD_H}px)`
  );
  assert(grid.cardW <= MAX_CARD_W, scenario, `card width ${grid.cardW.toFixed(1)}px exceeds the cap`);
  assert(grid.cardH <= MAX_CARD_H, scenario, `card height ${grid.cardH.toFixed(1)}px exceeds the cap`);

  // The gaps must leave room for the drift by construction; if these constants drift apart the
  // clearance maths above stops being meaningful.
  assert(
    CARD_GAP_X >= DRIFT_X * 2,
    scenario,
    `CARD_GAP_X ${CARD_GAP_X} no longer covers two drift extents (${DRIFT_X * 2})`
  );
  assert(
    CARD_GAP_Y >= DRIFT_Y * 2,
    scenario,
    `CARD_GAP_Y ${CARD_GAP_Y} no longer covers two drift extents (${DRIFT_Y * 2})`
  );

  return;
}

/* ------------------------------ stage sizing ------------------------------- */

function checkStageSizing(): void {
  assert(
    stageHeightForWordCount(4) === STAGE_HEIGHT,
    'stage height',
    'a short ayah should get the base stage height'
  );
  assert(
    stageHeightForWordCount(60) > stageHeightForWordCount(50),
    'stage height',
    'the stage should keep growing with word count'
  );

  // Every height must stay inside the stage's range. Monotonicity is deliberately NOT asserted:
  // the column count is solved from the stage's shape, so one more word can land on a grid that
  // fits the base height (17 words at 320px packs into three columns and needs no growth, while 16
  // lands on two and does). That is a smaller board for a longer ayah — not a defect.
  for (let words = MIN_WORDS; words <= MAX_WORDS; words++) {
    const height = stageHeightForWordCount(words);
    assert(
      height >= STAGE_HEIGHT && height <= MAX_STAGE_HEIGHT,
      `stage height / ${words} words`,
      `height ${height}px is outside the stage's range`
    );
  }
}

/* ------------------------------- text sizing ------------------------------- */

function checkTextSizing(): void {
  const scenario = 'text sizing';
  assert(
    arabicFontSize(10) >= MIN_ARABIC_FONT_PX,
    scenario,
    'the Arabic size floor is not being held'
  );
  assert(arabicFontSize(1000) <= 22, scenario, 'Arabic text can grow past the display size');
  assert(
    arabicFontSize(60) >= arabicFontSize(30),
    scenario,
    'Arabic size should not shrink as the card grows'
  );

  assert(
    translitFontSize(10) >= 7 && translitFontSize(1000) <= 10,
    scenario,
    'transliteration size escaped its 7..10px range'
  );

  assert(
    !shouldShowTranslit(43) && shouldShowTranslit(44),
    scenario,
    'the transliteration cutoff no longer drops short cards'
  );

  // On every short card the transliteration must be off, or it is painted at an illegible size.
  for (const width of WIDTHS) {
    for (let words = MIN_WORDS; words <= MAX_WORDS; words++) {
      const grid = planWordGrid(width, stageHeightForWordCount(words), words);
      if (grid.cardH < 44) {
        assert(
          !shouldShowTranslit(grid.cardH),
          `${width}px / ${words} words`,
          'transliteration would be drawn on a card too short for it'
        );
      }
    }
  }
}

/* --------------------------------- report ---------------------------------- */

/** Printed so the trade-off between stage height and card size stays visible, not assumed. */
function reportErgonomics(): void {
  const samples = [4, 7, 9, 15, 25, 40, 50];

  console.log('Card size per scenario (card W x H px, Arabic px, stage px):');
  for (const width of WIDTHS) {
    const parts: string[] = [];
    for (const words of samples) {
      const height = stageHeightForWordCount(words);
      const grid = planWordGrid(width, height, words);
      const arabic = arabicFontSize(grid.cardH);
      parts.push(
        `${words}w: ${grid.cardW.toFixed(0)}x${grid.cardH.toFixed(0)} (${arabic.toFixed(0)}px, ${height})`
      );
    }
    console.log(`  ${String(width).padStart(4)}px  ${parts.join('   ')}`);
  }
}

/* ---------------------------------- run ----------------------------------- */

function main(): void {
  console.log('Checking the Ayah Assembly word-grid layout…\n');

  let scenarios = 0;
  for (const width of WIDTHS) {
    for (let words = MIN_WORDS; words <= MAX_WORDS; words++) {
      checkGrid(width, words);
      scenarios += 1;
    }
  }
  checkStageSizing();
  checkTextSizing();

  console.log(`\nChecked ${scenarios} width/word-count combinations.`);
  reportErgonomics();

  if (failures.length > 0) {
    console.error('\nThe Ayah Assembly layout broke an invariant:');
    for (const failure of failures) console.error(`  [${failure.scenario}] ${failure.message}`);
    process.exit(1);
  }

  console.log('\nEvery word card stays on the stage, clear of the tray, and out of its neighbours.');
}

main();
