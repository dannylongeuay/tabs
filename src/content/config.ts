import { defineCollection, z } from "astro:content";
import type { Loader } from "astro/loaders";
import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { parseSongBody, PARSER_VERSION } from "../lib/parseSong";

const SONGS_DIR = fileURLToPath(new URL("./songs", import.meta.url));

// Zod shapes for the parsed body so `entry.data.sections` is fully typed.
const chordSegment = z.object({ chord: z.string(), text: z.string() });
const row = z.union([
  z.object({ segments: z.array(chordSegment) }),
  z.object({ chords: z.array(z.string()) }),
]);
const section = z.object({ name: z.string(), rows: z.array(row) });

// Frontmatter is the single source of metadata. `title` and `artist` are
// required — a song missing either fails the build, so the directory and search
// always have something to show.
const songSchema = z.object({
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  key: z.string().optional(),
  capo: z.union([z.number(), z.string()]).optional(),
  tuning: z.string().optional(),
  tags: z.array(z.string()).optional(),
  year: z.number().optional(),
  source: z.string().optional(),
  sections: z.array(section),
});

// Custom loader: read each `*.txt`, split frontmatter from body with
// gray-matter, parse the body into sections, and store frontmatter + sections.
// The slug comes from the filename.
const songsLoader: Loader = {
  name: "songs",
  load: async ({ store, parseData, generateDigest, logger }) => {
    store.clear();
    let files: string[];
    try {
      files = (await readdir(SONGS_DIR)).filter((f) => f.endsWith(".txt"));
    } catch {
      logger.warn(`No songs directory found at ${SONGS_DIR}`);
      return;
    }

    for (const file of files) {
      const slug = basename(file, ".txt");
      const raw = await readFile(join(SONGS_DIR, file), "utf-8");
      const { data: frontmatter, content } = matter(raw);
      const sections = parseSongBody(content);
      const data = await parseData({
        id: slug,
        data: { ...frontmatter, sections },
      });
      store.set({
        id: slug,
        data,
        // Mix in PARSER_VERSION so cached sections are invalidated when the
        // parser changes, not only when a song's raw text changes.
        digest: generateDigest(`${PARSER_VERSION}:${raw}`),
      });
    }
  },
};

const songs = defineCollection({
  loader: songsLoader,
  schema: songSchema,
});

export const collections = { songs };
