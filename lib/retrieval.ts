import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Server-side only — never import this from a client component.
//
// Lexical retrieval over the AquaPure knowledge base (Demo 3). TF-IDF vectors
// with cosine similarity: no embeddings endpoint, no vector database, no extra
// npm dependency — plain TypeScript is plenty for a knowledge base this size.
// Cosine similarity is naturally normalized to 0..1, so a fixed relevance
// threshold works: query words that don't occur anywhere in the documents
// (e.g. "Brita", "kettle") enlarge the query vector without matching anything,
// which pushes the score of off-topic questions toward 0.

const CONTENT_DIR = path.join(process.cwd(), "content", "aquapure");
// ~200 tokens per chunk (≈ 4 chars/token), so a top-3 result stays small.
const MAX_CHUNK_CHARS = 800;

// Below this best-chunk score the grounded bot answers with the fallback
// without calling the model at all. Tuned against the demo's preset questions
// (in-scope questions score 0.24+, out-of-scope ones 0.05 or less); override
// with GROUNDING_THRESHOLD if the knowledge base changes.
const DEFAULT_THRESHOLD = 0.12;

export function groundingThreshold(): number {
  const raw = Number(process.env.GROUNDING_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : DEFAULT_THRESHOLD;
}

export type RetrievedChunk = {
  title: string; // source doc title (plus section) — shown in the debug panel
  text: string;
  score: number; // cosine similarity, 0..1
};

/* ---------- tokenizing ---------- */

// Tiny stopword list: just enough that "what do you think of…" style filler
// doesn't dominate short queries.
const STOPWORDS = new Set(
  "a an and are as at be by can do does for from how i if in is it my of on or our so that the this to was we what when where which who why will with you your".split(
    " ",
  ),
);

// Light plural folding so "filters" matches "filter" — real stemming would be
// overkill for a three-document knowledge base.
function fold(token: string): string {
  if (token.length > 3 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(fold);
}

/* ---------- index (built once per server instance, cached in memory) ---------- */

type Chunk = { title: string; text: string; vector: Map<string, number>; norm: number };
type Index = { chunks: Chunk[]; idf: Map<string, number>; maxIdf: number };

let cachedIndex: Index | null = null;

function tfWeights(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  // Sublinear tf so a word repeated ten times doesn't count ten times.
  const weights = new Map<string, number>();
  for (const [t, c] of counts) weights.set(t, 1 + Math.log(c));
  return weights;
}

function buildIndex(): Index {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  const raw: { title: string; text: string }[] = [];

  for (const file of files) {
    const content = readFileSync(path.join(CONTENT_DIR, file), "utf8");
    const docTitle =
      content.match(/^#\s+(.+)$/m)?.[1].trim() ?? file.replace(/\.md$/, "");

    // Split on section headings, then pack paragraphs into ~200-token chunks
    // so every chunk keeps its doc + section title for the debug panel.
    const sections = content.split(/^##\s+/m);
    for (const section of sections) {
      const [firstLine, ...rest] = section.split("\n");
      const isPreamble = firstLine.startsWith("#");
      const sectionTitle = isPreamble ? null : firstLine.trim();
      const body = (isPreamble ? section.replace(/^#\s+.+$/m, "") : rest.join("\n")).trim();
      if (!body) continue;
      const title = sectionTitle ? `${docTitle} › ${sectionTitle}` : docTitle;

      let current = "";
      const flush = () => {
        if (current.trim()) raw.push({ title, text: current.trim() });
        current = "";
      };
      for (const para of body.split(/\n\s*\n/)) {
        if (current && current.length + para.length > MAX_CHUNK_CHARS) flush();
        current += (current ? "\n\n" : "") + para;
      }
      flush();
    }
  }

  // Document frequencies → smoothed IDF. Words present in every chunk score
  // near zero; words in a single chunk score highest.
  const df = new Map<string, number>();
  const tokenized = raw.map((c) => {
    // Index the title too, so "AquaPure Home" matches its own section.
    const tokens = tokenize(`${c.title} ${c.text}`);
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
    return { ...c, tokens };
  });

  const n = tokenized.length;
  const idf = new Map<string, number>();
  for (const [t, f] of df) idf.set(t, Math.log(1 + (n - f + 0.5) / (f + 0.5)));
  const maxIdf = Math.log(1 + (n + 0.5) / 0.5); // idf assigned to unseen query words

  const chunks: Chunk[] = tokenized.map((c) => {
    const vector = new Map<string, number>();
    for (const [t, w] of tfWeights(c.tokens)) vector.set(t, w * (idf.get(t) ?? 0));
    let sq = 0;
    for (const w of vector.values()) sq += w * w;
    return { title: c.title, text: c.text, vector, norm: Math.sqrt(sq) || 1 };
  });

  return { chunks, idf, maxIdf };
}

function getIndex(): Index {
  cachedIndex ??= buildIndex();
  return cachedIndex;
}

/* ---------- search ---------- */

export function searchChunks(query: string, topK = 3): RetrievedChunk[] {
  const index = getIndex();

  const queryVector = new Map<string, number>();
  for (const [t, w] of tfWeights(tokenize(query))) {
    // Unseen words get the maximum IDF: they can't match any chunk, but they
    // still grow the query norm — off-topic questions sink toward 0.
    queryVector.set(t, w * (index.idf.get(t) ?? index.maxIdf));
  }
  let sq = 0;
  for (const w of queryVector.values()) sq += w * w;
  const queryNorm = Math.sqrt(sq) || 1;

  return index.chunks
    .map((chunk) => {
      let dot = 0;
      for (const [t, w] of queryVector) dot += w * (chunk.vector.get(t) ?? 0);
      return { title: chunk.title, text: chunk.text, score: dot / (queryNorm * chunk.norm) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
