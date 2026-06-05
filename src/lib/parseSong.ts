// Parser for the custom song-tab body format.
//
// A song file is YAML frontmatter (split off upstream by gray-matter) followed
// by a body of sections. Each section starts with a `[Name]` header line and
// contains chord/lyric pairs:
//
//   [Verse 1]
//   C           G        Am
//   This is a line of lyrics here
//
// The chord line sits directly above the lyric line; each chord's *column*
// determines which syllable it belongs to. Lines without a chord line above
// them (e.g. an Intro) are rendered as bare chord runs.

export interface ChordSegment {
  /** Chord that sits above this run of lyric text ("" if none). */
  chord: string;
  /** The slice of lyric under (and after) the chord, up to the next chord. */
  text: string;
}

/** A paired chord-over-lyric line, split into positioned segments. */
export interface ChordLyricRow {
  segments: ChordSegment[];
}

/** A line of chords with no lyric beneath it (e.g. an intro/instrumental). */
export interface ChordsOnlyRow {
  chords: string[];
}

export type Row = ChordLyricRow | ChordsOnlyRow;

export interface Section {
  name: string;
  rows: Row[];
}

export function isChordsOnlyRow(row: Row): row is ChordsOnlyRow {
  return (row as ChordsOnlyRow).chords !== undefined;
}

/**
 * Bumped whenever the parsing logic changes. Mixed into the content-layer
 * digest (see content/config.ts) so cached `sections` are invalidated when the
 * parser changes even if a song's raw text does not.
 */
export const PARSER_VERSION = "1";

const SECTION_RE = /^\[(.+)\]\s*$/;

// A chord token: root note, optional accidental, optional quality/extension,
// optional slash bass. Deliberately strict so ordinary lyric words that happen
// to start with A–G ("And", "God", "Be", "Find") are *not* mistaken for chords.
const CHORD_RE =
  /^[A-G](#{1,2}|b{1,2})?(maj|min|m|M|dim|aug|sus|add|\+|°)?\d{0,2}(sus|add)?\d{0,2}(\/[A-G](#|b)?)?$/;

/** True when a line is non-empty and every token looks like a chord. */
function looksLikeChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length === 0 || tokens[0] === "") return false;
  return tokens.every((t) => CHORD_RE.test(t));
}

interface PositionedChord {
  col: number;
  chord: string;
}

/** Find each whitespace-delimited chord and its start column. */
function tokenizeChords(line: string): PositionedChord[] {
  const out: PositionedChord[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out.push({ col: m.index, chord: m[0] });
  }
  return out;
}

/**
 * Split a lyric line into segments aligned to the columns of the chords above
 * it. Each chord owns the lyric text from its column up to the next chord's
 * column. Leading lyric text before the first chord becomes an empty-chord
 * segment. Chords positioned past the end of the lyric still render above a run
 * of spaces.
 */
export function mapChordsToLyric(chordLine: string, lyric: string): ChordSegment[] {
  const chords = tokenizeChords(chordLine);
  if (chords.length === 0) {
    return [{ chord: "", text: lyric }];
  }

  // Make sure the lyric reaches at least far enough for the final chord to have
  // something (even just spaces) underneath it.
  const last = chords[chords.length - 1];
  const minLen = last.col + last.chord.length;
  let text = lyric;
  if (text.length < minLen) {
    text = text.padEnd(minLen, " ");
  }

  const segments: ChordSegment[] = [];

  // Lyric text before the first chord has no chord above it.
  if (chords[0].col > 0) {
    segments.push({ chord: "", text: text.slice(0, chords[0].col) });
  }

  for (let i = 0; i < chords.length; i++) {
    const start = chords[i].col;
    const end = i + 1 < chords.length ? chords[i + 1].col : text.length;
    let seg = text.slice(start, end);
    if (seg.length === 0) seg = " ";
    segments.push({ chord: chords[i].chord, text: seg });
  }

  return segments;
}

/**
 * Walk a section's lines into rows. A line is only paired as a chord line over
 * the lyric below it when it actually *looks* like chords; otherwise it is a
 * lyric-only line (rendered with an empty chord). This keeps consecutive lyric
 * lines, or a lyric whose chord line is separated by a blank, from having their
 * words silently tokenized as chords.
 */
function parseRows(lines: string[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    const isChordLine = looksLikeChordLine(line);
    if (isChordLine && next.trim() !== "") {
      // Chord line directly over a lyric line.
      rows.push({ segments: mapChordsToLyric(line, next) });
      i += 2;
    } else if (isChordLine) {
      // A lone chord line: bare chords (intro/instrumental).
      rows.push({ chords: tokenizeChords(line).map((c) => c.chord) });
      i += 1;
    } else {
      // Lyric text with no chords above it.
      rows.push({ segments: [{ chord: "", text: line }] });
      i += 1;
    }
  }
  return rows;
}

/**
 * Parse a song body (frontmatter already removed) into ordered sections. Lines
 * before the first `[Section]` header are collected into an unnamed leading
 * section if any are non-blank.
 */
export function parseSongBody(text: string): Section[] {
  const lines = text.split(/\r?\n/);
  const groups: { name: string; lines: string[] }[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const m = line.match(SECTION_RE);
    if (m) {
      const group = { name: m[1].trim(), lines: [] as string[] };
      groups.push(group);
      current = group.lines;
    } else {
      if (current === null) {
        if (line.trim() === "") continue;
        const group = { name: "", lines: [] as string[] };
        groups.push(group);
        current = group.lines;
      }
      current.push(line);
    }
  }

  return groups.map((group) => ({
    name: group.name,
    rows: parseRows(group.lines),
  }));
}
