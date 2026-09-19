/**
 * Word-grid geometry for the Ayah Assembly game.
 *
 * This lives outside the component so it can be verified directly. The properties that matter are
 * pure arithmetic — cards must never overlap (even while they float), never leave the stage, and
 * never hide under the assembly tray — and they are exactly what the previous fixed 4-column
 * layout violated: with a pinned 110x52 card in a 460px stage, Al-Baqarah 2:282 (~50 words)
 * stacked thirteen rows of 52px cards into ~21px each, painting the words on top of one another.
 *
 * `scripts/verify-ayah-assembly-layout.ts` pins the invariants below across word counts and
 * viewport widths.
 */

/** Stage height in CSS pixels for a short ayah. */
export const STAGE_HEIGHT = 460;
/** Height the floating assembly tray occupies at the bottom of the stage, plus its margin. */
export const TRAY_RESERVE = 108;
export const STAGE_PAD_X = 24;
export const STAGE_PAD_TOP = 14;
/** How far a card drifts from its base position each frame. Gaps below reserve this much. */
export const DRIFT_X = 12;
export const DRIFT_Y = 9;
/** Cell gap. Kept wider than twice the drift, with 3px of clearance per side. */
export const CARD_GAP_X = DRIFT_X * 2 + 6;
export const CARD_GAP_Y = DRIFT_Y * 2 + 6;
export const NATURAL_CARD_W = 110;
export const NATURAL_CARD_H = 52;
export const NATURAL_ASPECT = NATURAL_CARD_W / NATURAL_CARD_H;
export const MAX_CARD_W = 180;
export const MAX_CARD_H = 60;
export const MAX_COLS = 10;
/** Below this card height the transliteration is dropped; at that size it is unreadable. */
export const TRANSLIT_MIN_CARD_H = 44;
export const MIN_ARABIC_FONT_PX = 10;
/** The narrowest stage the games support; a layout that works here works at any wider size. */
export const MIN_STAGE_WIDTH = 320;
/** Card size the stage keeps growing to reach, so a word stays legible and tappable. */
export const MIN_USABLE_CARD_W = 56;
export const MIN_USABLE_CARD_H = 28;
export const MAX_STAGE_HEIGHT = 1200;

export interface WordGridPlan {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  cardW: number;
  cardH: number;
  padX: number;
  padY: number;
}

/**
 * Gives a dense ayah a taller stage instead of forcing it into the 460px box.
 *
 * The height is grown until `MIN_STAGE_WIDTH` still gets a legible card, because a grid of N words
 * needs more rows — and therefore more height — the narrower the screen. Solving for the narrowest
 * viewport keeps this a pure function of the word count: no measurement, no resize feedback loop,
 * and one board height for a given surah. On a wide screen the spare room is absorbed by the
 * card-size cap, so the board simply has looser spacing.
 *
 * Sized from the surah's *longest* ayah (the caller passes that), so the height does not change
 * between the verses of one surah.
 */
export function stageHeightForWordCount(wordCount: number): number {
  if (wordCount <= 12) return STAGE_HEIGHT;

  let height = STAGE_HEIGHT;
  while (height < MAX_STAGE_HEIGHT) {
    const grid = planWordGrid(MIN_STAGE_WIDTH, height, wordCount);
    if (grid.cardW >= MIN_USABLE_CARD_W && grid.cardH >= MIN_USABLE_CARD_H) break;
    height = Math.min(MAX_STAGE_HEIGHT, height + 20);
  }
  return height;
}

/**
 * Lays a verse's words onto a grid whose cards never overlap.
 *
 * The card size is derived from the cell it sits in — `cell - gap`, where the gap is wider than
 * the render loop's drift — so two neighbouring cards cannot touch however far they float. The
 * column count is solved from the stage's own proportions rather than pinned, so a long ayah
 * widens into more columns instead of piling up.
 *
 * That derivation is why there is no minimum card size: clamping a card *up* past its cell would
 * reintroduce overlap, which is the bug this replaced. A dense verse on a narrow screen therefore
 * gets small cards, and the taller stage from `stageHeightForWordCount` is what keeps them usable.
 */
export function planWordGrid(stageWidth: number, stageHeight: number, wordCount: number): WordGridPlan {
  const usableW = Math.max(200, stageWidth - STAGE_PAD_X * 2);
  const usableH = Math.max(160, stageHeight - TRAY_RESERVE - STAGE_PAD_TOP);

  // The column count whose cells come closest to the card's natural proportions, from
  // cols * rows ≈ wordCount and (usableW / cols) / (usableH / rows) = NATURAL_ASPECT.
  const idealCols = Math.sqrt((usableW * wordCount) / (NATURAL_ASPECT * usableH));
  const cols = Math.max(1, Math.min(wordCount, MAX_COLS, Math.round(idealCols)));
  const rows = Math.ceil(wordCount / cols);

  const cellW = usableW / cols;
  const cellH = usableH / rows;

  return {
    cols,
    rows,
    cellW,
    cellH,
    cardW: Math.min(MAX_CARD_W, cellW - CARD_GAP_X),
    cardH: Math.min(MAX_CARD_H, cellH - CARD_GAP_Y),
    padX: STAGE_PAD_X,
    padY: STAGE_PAD_TOP,
  };
}

/** Arabic size for a card. The caller additionally shrinks it until the word measures inside. */
export function arabicFontSize(cardHeight: number): number {
  return Math.max(MIN_ARABIC_FONT_PX, Math.min(22, cardHeight * 0.42));
}

export function translitFontSize(cardHeight: number): number {
  return Math.max(7, Math.min(10, cardHeight * 0.19));
}

export function shouldShowTranslit(cardHeight: number): boolean {
  return cardHeight >= TRANSLIT_MIN_CARD_H;
}
