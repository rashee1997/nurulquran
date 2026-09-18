'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bookmark, StickyNote, FolderPlus, Trash2, ArrowRight, BookOpen } from 'lucide-react';
import { db } from '@/lib/db';
import { SURAHS } from '@/lib/quran/surahs';
import {
  collectionLabel,
  DEFAULT_COLLECTION,
  moveBookmark,
  removeBookmark,
  saveNote,
} from '@/lib/quran/library';

function surahName(id: number): string {
  return SURAHS.find((surah) => surah.id === id)?.nameSimple ?? `Surah ${id}`;
}

/**
 * The learner's library: bookmarks grouped by collection, and notes grouped by surah.
 * Everything here is a live view over IndexedDB; edits made in the reader appear at once.
 */
export default function LibraryPage() {
  const bookmarks = useLiveQuery(() => db.bookmarks.orderBy('createdAt').reverse().toArray(), [], []);
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray(), [], []);
  const position = useLiveQuery(
    async () => (await db.userProfile.get('default_user'))?.readingPosition ?? null,
    [],
    null
  );

  const [tab, setTab] = useState<'bookmarks' | 'notes'>('bookmarks');
  const [newCollection, setNewCollection] = useState('');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const collections = useMemo(() => {
    const groups = new Map<string, typeof bookmarks>();
    groups.set(DEFAULT_COLLECTION, []);
    for (const bookmark of bookmarks) {
      const list = groups.get(bookmark.collection) ?? [];
      list.push(bookmark);
      groups.set(bookmark.collection, list);
    }
    return Array.from(groups.entries());
  }, [bookmarks]);

  const collectionNames = collections.map(([name]) => name);

  const notesBySurah = useMemo(() => {
    const groups = new Map<number, typeof notes>();
    for (const note of notes) {
      const list = groups.get(note.surah) ?? [];
      list.push(note);
      groups.set(note.surah, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [notes]);

  return (
    <div id="library-page" className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border space-y-3 shadow-xs">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-subtle text-secondary-strong text-xs font-semibold">
          <Bookmark className="w-3.5 h-3.5" />
          <span>Library</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Bookmarks, collections and notes
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl">
          Saved ayahs and your own reflections, kept on this device and included in backups.
        </p>

        {position && (
          <Link
            href={`/quran/${position.surah}#ayah-${position.ayah}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:bg-primary-hover transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            <span>
              Continue reading {surahName(position.surah)} {position.surah}:{position.ayah}
            </span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-card border border-border w-fit">
        <button
          type="button"
          onClick={() => setTab('bookmarks')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            tab === 'bookmarks' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Bookmarks ({bookmarks.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('notes')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            tab === 'notes' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Notes ({notes.length})
        </button>
      </div>

      {tab === 'bookmarks' && (
        <div className="space-y-5">
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              // A collection exists once a bookmark is filed in it; the name is only kept
              // in the input until then.
              setNewCollection(newCollection.trim());
            }}
          >
            <FolderPlus className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="new-collection" className="sr-only">
              New collection name
            </label>
            <input
              id="new-collection"
              value={newCollection}
              onChange={(event) => setNewCollection(event.target.value)}
              placeholder="New collection name (e.g. Salah, Duas)"
              maxLength={80}
              className="flex-1 text-xs px-3 py-2 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </form>
          <p className="text-[11px] text-muted-foreground -mt-3">
            Type a name, then use “Move to” on any bookmark to file it there.
          </p>

          {bookmarks.length === 0 && (
            <div className="p-8 rounded-2xl bg-card border border-dashed border-border text-center space-y-2">
              <p className="text-sm font-semibold text-foreground">No bookmarks yet</p>
              <p className="text-xs text-muted-foreground">
                Tap the bookmark icon on any ayah in the reader to save it here.
              </p>
              <Link href="/quran" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                Open the reader <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {collections.map(([name, items]) =>
            items.length === 0 && name !== DEFAULT_COLLECTION ? null : (
              <section key={name || 'default'} className="space-y-2">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>{collectionLabel(name)}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground">{items.length}</span>
                </h2>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing in this collection yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((bookmark) => (
                      <li
                        key={bookmark.verseKey}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-card border border-border text-xs"
                      >
                        <Link
                          href={`/quran/${bookmark.surah}#ayah-${bookmark.ayah}`}
                          className="font-bold text-foreground hover:text-primary"
                        >
                          {surahName(bookmark.surah)} {bookmark.surah}:{bookmark.ayah}
                        </Link>
                        <div className="flex items-center gap-2">
                          <label className="sr-only" htmlFor={`move-${bookmark.verseKey}`}>
                            Move bookmark to collection
                          </label>
                          <select
                            id={`move-${bookmark.verseKey}`}
                            value={bookmark.collection}
                            onChange={(event) => void moveBookmark(bookmark.verseKey, event.target.value)}
                            className="text-[11px] px-2 py-1 rounded-lg bg-surface border border-border text-foreground"
                          >
                            {[...collectionNames, ...(newCollection && !collectionNames.includes(newCollection) ? [newCollection] : [])].map(
                              (option) => (
                                <option key={option || 'default'} value={option}>
                                  Move to: {collectionLabel(option)}
                                </option>
                              )
                            )}
                          </select>
                          <button
                            type="button"
                            onClick={() => void removeBookmark(bookmark.verseKey)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-danger-strong hover:bg-danger-subtle"
                            aria-label={`Remove bookmark ${bookmark.surah}:${bookmark.ayah}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="space-y-5">
          {notes.length === 0 && (
            <div className="p-8 rounded-2xl bg-card border border-dashed border-border text-center space-y-2">
              <p className="text-sm font-semibold text-foreground">No notes yet</p>
              <p className="text-xs text-muted-foreground">
                Use the note icon on an ayah to write what you understood from it.
              </p>
            </div>
          )}

          {notesBySurah.map(([surah, items]) => (
            <section key={surah} className="space-y-2">
              <h2 className="text-sm font-bold text-foreground">
                {surahName(surah)} <span className="text-muted-foreground font-medium">· {items.length}</span>
              </h2>
              <ul className="space-y-2">
                {items.map((note) => {
                  const isEditing = editingNote === note.verseKey;
                  return (
                    <li key={note.verseKey} className="p-4 rounded-xl bg-card border border-border space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <Link href={`/quran/${note.surah}#ayah-${note.ayah}`} className="font-bold text-foreground hover:text-primary">
                          Ayah {note.surah}:{note.ayah}
                        </Link>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={noteDraft}
                            onChange={(event) => setNoteDraft(event.target.value)}
                            rows={4}
                            className="w-full text-sm p-3 rounded-xl bg-surface border border-border text-foreground outline-hidden focus:ring-2 focus:ring-primary/40"
                            aria-label={`Edit note for ${note.surah}:${note.ayah}`}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await saveNote(note.surah, note.ayah, noteDraft);
                                setEditingNote(null);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingNote(null)}
                              className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{note.text}</p>
                          <div className="flex gap-3 text-[11px] font-semibold">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNote(note.verseKey);
                                setNoteDraft(note.text);
                              }}
                              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                            >
                              <StickyNote className="w-3 h-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveNote(note.surah, note.ayah, '')}
                              className="text-muted-foreground hover:text-danger-strong inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
