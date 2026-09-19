import { db, type BookmarkRecord, type NoteRecord, type ReadingPosition } from '@/lib/db';
import { track } from '@/lib/telemetry/events';

/**
 * Bookmarks, notes and the reading position.
 *
 * All three are learner data (included in backups) keyed by `surah:ayah`, matching the
 * SRS tables so a verse's state, bookmark and note can be joined by one key.
 */

export const DEFAULT_COLLECTION = '';
export const DEFAULT_COLLECTION_LABEL = 'Saved';

let positionTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPosition: ReadingPosition | null = null;
const POSITION_WRITE_DELAY_MS = 800;

/**
 * Records where the learner is reading. Coalesced: the observer fires for every ayah that
 * scrolls into view, and one write per settle is enough. The pending value is flushed on
 * `pagehide` so leaving the tab mid-scroll still keeps the position.
 */
export function saveReadingPosition(surah: number, ayah: number): void {
  if (typeof window === 'undefined') return;
  pendingPosition = { surah, ayah, updatedAt: new Date().toISOString() };
  if (positionTimer) clearTimeout(positionTimer);
  positionTimer = setTimeout(() => {
    positionTimer = null;
    void flushReadingPosition();
  }, POSITION_WRITE_DELAY_MS);
}

/**
 * The last position actually written.
 *
 * Scrolling away from an ayah and back re-fires the observer with the position it already saved,
 * and each save is a profile write plus a ledger row. Comparing against this makes a repeat of the
 * settled position a no-op, so a learner reading up and down one passage does not generate a write
 * per settle. It is only updated on success, so a failed write is retried.
 */
let lastWrittenPosition: { surah: number; ayah: number } | null = null;

export async function flushReadingPosition(): Promise<void> {
  const position = pendingPosition;
  pendingPosition = null;
  if (!position) return;
  if (lastWrittenPosition?.surah === position.surah && lastWrittenPosition.ayah === position.ayah) {
    return;
  }
  try {
    const existing = await db.userProfile.get('default_user');
    // Never create a partial profile from the reader (same rule as reader preferences).
    if (!existing) return;
    await db.userProfile.update('default_user', { readingPosition: position });
    lastWrittenPosition = { surah: position.surah, ayah: position.ayah };
    track('reader.position_saved', { surah: position.surah, ayah: position.ayah });
  } catch (error: unknown) {
    console.warn('Reading position could not be saved:', error);
  }
}

/**
 * Registers the flush-on-leave handler exactly once.
 *
 * The listener is registered at module scope, which is already once per page load — but this
 * module is re-evaluated on every hot update in development, and each evaluation added another
 * permanent `pagehide` listener. The flag lives on `window` so it survives the re-evaluation that a
 * module-local one would not.
 */
const PAGEHIDE_FLAG = '__nurulquran_position_flush_installed__';

function installPagehideFlush(): void {
  if (typeof window === 'undefined') return;
  const scope = window as unknown as Record<string, unknown>;
  if (scope[PAGEHIDE_FLAG]) return;
  scope[PAGEHIDE_FLAG] = true;

  window.addEventListener('pagehide', () => {
    if (positionTimer) {
      clearTimeout(positionTimer);
      positionTimer = null;
    }
    void flushReadingPosition();
  });
}

installPagehideFlush();

export function verseKeyOf(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

/** Adds a bookmark, or removes it when it already exists in that collection. */
export async function toggleBookmark(
  surah: number,
  ayah: number,
  collection: string = DEFAULT_COLLECTION
): Promise<'added' | 'removed'> {
  const verseKey = verseKeyOf(surah, ayah);
  const existing = await db.bookmarks.get(verseKey);
  if (existing && existing.collection === collection) {
    await db.bookmarks.delete(verseKey);
    track('bookmark.removed', { verseKey });
    return 'removed';
  }
  const record: BookmarkRecord = {
    verseKey,
    surah,
    ayah,
    collection: collection.trim().slice(0, 80),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await db.bookmarks.put(record);
  track('bookmark.created', { verseKey, collection: record.collection || DEFAULT_COLLECTION_LABEL });
  return 'added';
}

export async function moveBookmark(verseKey: string, collection: string): Promise<void> {
  await db.bookmarks.update(verseKey, { collection: collection.trim().slice(0, 80) });
}

export async function removeBookmark(verseKey: string): Promise<void> {
  await db.bookmarks.delete(verseKey);
  track('bookmark.removed', { verseKey });
}

/** Distinct collection names in use, default first. */
export async function listCollections(): Promise<string[]> {
  const rows = await db.bookmarks.toArray();
  const names = new Set<string>();
  for (const row of rows) names.add(row.collection);
  const sorted = Array.from(names).filter((name) => name !== DEFAULT_COLLECTION).sort();
  return [DEFAULT_COLLECTION, ...sorted];
}

/** Saves a note; an empty note deletes the row. */
export async function saveNote(surah: number, ayah: number, text: string): Promise<void> {
  const verseKey = verseKeyOf(surah, ayah);
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    await db.notes.delete(verseKey);
    return;
  }
  const record: NoteRecord = {
    verseKey,
    surah,
    ayah,
    text: trimmed.slice(0, 20_000),
    updatedAt: new Date().toISOString(),
  };
  await db.notes.put(record);
  track('note.saved', { verseKey, length: record.text.length });
}

export function collectionLabel(name: string): string {
  return name === DEFAULT_COLLECTION ? DEFAULT_COLLECTION_LABEL : name;
}
