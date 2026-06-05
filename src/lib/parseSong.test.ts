import { describe, it, expect } from "vitest";
import {
  parseSongBody,
  mapChordsToLyric,
  isChordsOnlyRow,
  type ChordLyricRow,
  type ChordsOnlyRow,
} from "./parseSong";

describe("parseSongBody — section splitting", () => {
  it("splits on [Section] headers and preserves order", () => {
    const body = `[Intro]
C  G

[Verse 1]
C        G
Hello there world`;
    const sections = parseSongBody(body);
    expect(sections.map((s) => s.name)).toEqual(["Intro", "Verse 1"]);
  });

  it("collects pre-header content into an unnamed leading section", () => {
    const body = `C        G
Leading line here

[Verse]
C
Body`;
    const sections = parseSongBody(body);
    expect(sections[0].name).toBe("");
    expect(sections[1].name).toBe("Verse");
  });

  it("ignores blank lines before the first header", () => {
    const body = `

[Verse]
C
Hi`;
    const sections = parseSongBody(body);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("Verse");
  });
});

describe("parseSongBody — row pairing", () => {
  it("pairs a chord line with the lyric line below it", () => {
    const sections = parseSongBody(`[Verse]
C        G
Hello there world`);
    const rows = sections[0].rows;
    expect(rows).toHaveLength(1);
    expect(isChordsOnlyRow(rows[0])).toBe(false);
    const segments = (rows[0] as ChordLyricRow).segments;
    expect(segments.map((s) => s.chord)).toEqual(["C", "G"]);
  });

  it("treats a lone non-blank line as a chords-only row", () => {
    const sections = parseSongBody(`[Intro]
C  G  Am  F`);
    const row = sections[0].rows[0];
    expect(isChordsOnlyRow(row)).toBe(true);
    expect((row as ChordsOnlyRow).chords).toEqual(["C", "G", "Am", "F"]);
  });

  it("handles multiple pairs separated by blank lines", () => {
    const sections = parseSongBody(`[Verse]
C
One

G
Two`);
    expect(sections[0].rows).toHaveLength(2);
  });

  it("keeps two consecutive lyric lines as lyric-only rows", () => {
    const sections = parseSongBody(`[Verse]
Hello there friend
World today`);
    const rows = sections[0].rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !isChordsOnlyRow(r))).toBe(true);
    expect((rows[0] as ChordLyricRow).segments).toEqual([
      { chord: "", text: "Hello there friend" },
    ]);
    expect((rows[1] as ChordLyricRow).segments).toEqual([
      { chord: "", text: "World today" },
    ]);
  });

  it("does not turn a lyric line into chords when a blank separates it from its chord line", () => {
    const sections = parseSongBody(`[Verse]
C  G

And then some words`);
    const rows = sections[0].rows;
    // Lone chord line stays chords-only; the lyric is a lyric-only row, NOT
    // tokenized into "chords".
    expect(isChordsOnlyRow(rows[0])).toBe(true);
    expect(isChordsOnlyRow(rows[1])).toBe(false);
    expect((rows[1] as ChordLyricRow).segments).toEqual([
      { chord: "", text: "And then some words" },
    ]);
  });

  it("treats a line of real chords above lyrics as a chord line", () => {
    const sections = parseSongBody(`[Verse]
Am   F   C   G
And God I know I'm one`);
    const row = sections[0].rows[0];
    expect(isChordsOnlyRow(row)).toBe(false);
    expect((row as ChordLyricRow).segments.map((s) => s.chord)).toEqual([
      "Am",
      "F",
      "C",
      "G",
    ]);
  });
});

describe("mapChordsToLyric — column → segment mapping", () => {
  it("attaches each chord to the lyric beginning at its column", () => {
    //           col 0       col 12
    const segs = mapChordsToLyric("C           G", "Hello there world");
    expect(segs).toEqual([
      { chord: "C", text: "Hello there " },
      { chord: "G", text: "world" },
    ]);
  });

  it("emits a leading empty-chord segment for text before the first chord", () => {
    const segs = mapChordsToLyric("      G", "Hello world");
    expect(segs[0]).toEqual({ chord: "", text: "Hello " });
    expect(segs[1].chord).toBe("G");
    expect(segs[1].text).toBe("world");
  });

  it("returns one empty-chord segment when there are no chords", () => {
    const segs = mapChordsToLyric("", "just lyrics");
    expect(segs).toEqual([{ chord: "", text: "just lyrics" }]);
  });

  it("gives chords past the lyric end a run of spaces so they still render", () => {
    const segs = mapChordsToLyric("C       G", "Short");
    expect(segs[0].chord).toBe("C");
    expect(segs[segs.length - 1].chord).toBe("G");
    // The trailing chord still has (whitespace) text to render above.
    expect(segs[segs.length - 1].text.length).toBeGreaterThan(0);
  });
});
