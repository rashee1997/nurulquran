/**
 * The reciters the reader can play, with the upstream identifiers each edition needs.
 *
 * ## `bitrate` — the CDN path that serves this edition
 *
 * The islamic.network CDN publishes per-ayah recitations at `/quran/audio/{bitrate}/{edition}/{ayah}.mp3`,
 * and **the available bitrate differs per reciter**: Abdul Basit's murattal edition is published at
 * 192 and 64 kbps but not at 128, Sudais and ar-Rifai only at 192/64, Hudhaify's teaching edition
 * only at 64. Requesting the wrong rate answers HTTP 403, which is exactly how the player's old
 * hardcoded `/128/` path failed for Abdul Basit: the learner saw "This recitation could not be
 * loaded" no matter which ayah they chose.
 *
 * Every value below was verified by requesting a real clip and reading its bytes, across
 * 1:1, 2:255, 9:1, 18:10, 36:1, 55:1, 78:40, 112:1 and 114:6 — so a reciter listed here is a
 * reciter whose every ayah resolves. (For a few editions the *encoded* rate of the file differs
 * from its path — e.g. Maher al-Muaiqly's `/128/` clip is 192 kbps — which does not affect
 * playback or this app.)
 *
 * ## `recitationId` — measured word timings
 *
 * Quran.com publishes word-level alignments for some of these recordings
 * (`/recitations/{id}/by_chapter/{surah}?fields=segments`), and `lib/quran/word-timings.ts` uses
 * them to follow the Qari word by word.
 *
 * A pairing is only allowed here when the audio is the same recording, which was established by
 * comparing the actual files — never by matching reciter names. Two independent checks were used:
 * the byte length is identical to the Quran.com file, and the clip's real duration matches the
 * timeline its segments describe (which catches a different rendition of the same verse):
 *
 * | Edition                | islamic.network   | Quran.com / aligned file            | Verdict   |
 * | ---------------------- | ----------------- | ----------------------------------- | --------- |
 * | `ar.alafasy`           | `/128/`           | `Alafasy/mp3/`                      | identical |
 * | `ar.abdulbasitmurattal`| `/192/`           | `AbdulBaset/Murattal/mp3/`          | identical |
 * | `ar.abdurrahmaansudais`| `/192/`           | `Sudais/mp3/`                       | identical |
 * | `ar.shaatree`          | `/128/`           | `Shatri/mp3/`                       | identical |
 * | `ar.hanirifai`         | `/192/`           | `Rifai/mp3/`                        | identical |
 * | `ar.minshawi`          | `/128/`           | `Minshawi/Murattal/mp3/`            | identical |
 * | `ar.husary`            | `/128/`           | `Husary_64kbps/`                    | same master, transcoded |
 *
 * Rejected pairings, kept here so nobody re-adds them by name:
 *
 *  - **`ar.saoodshuraym`** — the only CDN copy is 64 kbps and runs ~75 s for 2:255 against a ~37 s
 *    alignment, i.e. not the same rendition. Offered without timings.
 *  - **`ar.husarymujawwad`** — 119 s against the 109 s of the *Muallim* alignment: a different
 *    rendition. Offered without timings.
 *  - **`ar.minshawimujawwad`** — the CDN serves the *Murattal* file under that name (byte-identical
 *    to `ar.minshawi`), so it is deliberately not offered: playing Murattal under a Mujawwad label
 *    would misrepresent the recitation.
 *  - Reciters with no complete per-ayah edition on the CDN (at-Tablawi, al-Banna, Mustafa Ismail,
 *    Yasser ad-Dossari, al-Qatami, Fares Abbad, Khalid al-Jalil, al-Juhani and others in the
 *    alquran.cloud index) are absent rather than broken.
 *
 * Reciters without a `recitationId` still play; their word highlight falls back to the length-based
 * estimate, and the player labels it as such.
 */
export interface ReciterOption {
  id: string;
  name: string;
  /** CDN path segment that serves this edition (see the table above — it is not always 128). */
  bitrate: 64 | 128 | 192;
  /** Quran.com recitation id for measured word timings; absent when the pairing is unverified. */
  recitationId?: number;
}

/** Bitrate used for an id this app does not know (e.g. one saved by an older version). */
const FALLBACK_BITRATE = 128;

const AUDIO_CDN = 'https://cdn.islamic.network/quran/audio';

export const DEFAULT_RECITER = 'ar.alafasy';

/** Ordered by how commonly the recitation is chosen, so the default sits first. */
export const RECITERS: readonly ReciterOption[] = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy', bitrate: 128, recitationId: 7 },
  { id: 'ar.abdulbasitmurattal', name: 'Abdul Basit (Murattal)', bitrate: 192, recitationId: 2 },
  { id: 'ar.abdurrahmaansudais', name: 'Abdur-Rahman as-Sudais', bitrate: 192, recitationId: 3 },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary', bitrate: 128, recitationId: 6 },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq Al-Minshawi', bitrate: 128, recitationId: 9 },
  { id: 'ar.shaatree', name: 'Abu Bakr Ash-Shaatree', bitrate: 128, recitationId: 4 },
  { id: 'ar.hanirifai', name: 'Hani ar-Rifai', bitrate: 192, recitationId: 5 },
  { id: 'ar.mahermuaiqly', name: 'Maher al-Muaiqly', bitrate: 128 },
  { id: 'ar.hudhaify', name: 'Ali Abdur-Rahman al-Hudhaify', bitrate: 128 },
  { id: 'ar.ahmedajamy', name: 'Ahmed ibn Ali al-Ajamy', bitrate: 128 },
  { id: 'ar.muhammadayyoub', name: 'Muhammad Ayyub', bitrate: 128 },
  { id: 'ar.muhammadjibreel', name: 'Muhammad Jibreel', bitrate: 128 },
  { id: 'ar.abdullahbasfar', name: 'Abdullah Basfar', bitrate: 192 },
  { id: 'ar.husarymujawwad', name: 'Mahmoud Khalil Al-Husary (Mujawwad)', bitrate: 128 },
  { id: 'ar.aymanswoaid', name: 'Ayman Sowaid (teaching pace)', bitrate: 64 },
];

const RECITER_BY_ID = new Map(RECITERS.map((reciter) => [reciter.id, reciter]));

export function getReciter(reciterId: string): ReciterOption | undefined {
  return RECITER_BY_ID.get(reciterId);
}

/** Human-readable name for an id, for lock-screen metadata and labels. */
export function reciterName(reciterId: string): string {
  return getReciter(reciterId)?.name ?? getReciter(DEFAULT_RECITER)?.name ?? 'Recitation';
}

/** Whether this reciter's word highlight follows measured timings rather than the estimate. */
export function hasMeasuredWordTimings(reciterId: string): boolean {
  return getReciter(reciterId)?.recitationId !== undefined;
}

/**
 * Recitation URL for one ayah, at the bitrate this reciter is actually published at.
 *
 * `globalAyahNumber` is the 1-based position of the ayah in the Mushaf (1-6236), which is how
 * the CDN addresses clips — not the within-surah number.
 */
export function reciterAudioUrl(reciterId: string, globalAyahNumber: number): string {
  const bitrate = getReciter(reciterId)?.bitrate ?? FALLBACK_BITRATE;
  return `${AUDIO_CDN}/${bitrate}/${reciterId}/${globalAyahNumber}.mp3`;
}
