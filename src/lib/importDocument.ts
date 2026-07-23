import mammoth from "mammoth";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ensureSlotIds } from "./contentSlots";
import { markdownToHtml } from "./documentUtils";

GlobalWorkerOptions.workerSrc = pdfWorker;

function sanitizeImportedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html || "<p></p>", "text/html");
  doc.querySelectorAll("script, iframe, object, embed, link, meta").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        el.removeAttribute(attr.name);
      }
    }
  });
  const body = doc.body.innerHTML.trim();
  return body || "<p></p>";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** DOCX → slotted HTML via mammoth. */
export async function docxToHtml(bytes: Uint8Array): Promise<string> {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      ignoreEmptyParagraphs: true,
      convertImage: mammoth.images.imgElement(() =>
        Promise.resolve({ src: "" }),
      ),
    },
  );
  const html = sanitizeImportedHtml(result.value);
  if (!html.replace(/<[^>]+>/g, "").trim()) {
    throw new Error("DOCX contained no readable text");
  }
  return ensureSlotIds(html);
}

interface PdfGlyph {
  str: string;
  x: number;
  /** PDF user-space Y (origin bottom-left; larger = higher on page). */
  y: number;
  width: number;
  height: number;
}

interface PdfLine {
  y: number;
  height: number;
  text: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Join glyph runs on one line using horizontal gaps (no forced spaces / ligature breaks). */
function joinGlyphsOnLine(glyphs: PdfGlyph[]): string {
  const ordered = [...glyphs].sort((a, b) => a.x - b.x || b.y - a.y);
  let text = "";
  for (let i = 0; i < ordered.length; i += 1) {
    const g = ordered[i];
    const chunk = g.str;
    if (!chunk) continue;
    if (!text) {
      text = chunk;
      continue;
    }

    const prev = ordered[i - 1];
    const gap = g.x - (prev.x + prev.width);
    const spaceThreshold = Math.max(prev.height, g.height) * 0.15;
    const endsSpace = /\s$/.test(text);
    const startsSpace = /^\s/.test(chunk);

    if (endsSpace || startsSpace) {
      text += chunk;
    } else if (gap > spaceThreshold) {
      text += ` ${chunk}`;
    } else {
      // Adjacent runs (incl. fl/fi ligature fragments) — concatenate.
      text += chunk;
    }
  }
  return text.replace(/[ \t]+/g, " ").trim();
}

/**
 * Cluster glyphs into visual lines on a single page.
 * Must never mix pages — PDFs reuse Y ranges on every page.
 */
function glyphsToLines(glyphs: PdfGlyph[]): PdfLine[] {
  if (glyphs.length === 0) return [];

  const sorted = [...glyphs].sort((a, b) => b.y - a.y || a.x - b.x);
  const buckets: PdfGlyph[][] = [];

  for (const g of sorted) {
    const bucket = buckets.find((line) => {
      const ref = line[0];
      const tol = Math.max(ref.height, g.height) * 0.55;
      return Math.abs(ref.y - g.y) <= tol;
    });
    if (bucket) bucket.push(g);
    else buckets.push([g]);
  }

  return buckets
    .map((lineGlyphs) => {
      const ys = lineGlyphs.map((g) => g.y);
      const heights = lineGlyphs.map((g) => g.height);
      return {
        y: median(ys),
        height: median(heights) || 10,
        text: joinGlyphsOnLine(lineGlyphs),
      };
    })
    .filter((l) => l.text.length > 0);
}

function linesToHtmlBlocks(lines: PdfLine[]): string[] {
  if (lines.length === 0) return [];

  const heights = lines.map((l) => l.height);
  const med = median(heights) || 10;
  const parts: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
    paragraph = [];
    if (!text) return;
    parts.push(`<p>${escapeHtml(text)}</p>`);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    // PDF Y decreases going down the page.
    const gap = next ? line.y - next.y : Infinity;
    const short = line.text.length < 72;
    const isHeading = short && line.height >= med * 1.25 && !line.text.startsWith("●");

    if (isHeading) {
      flushParagraph();
      const tag = line.height >= med * 1.6 ? "h1" : "h2";
      parts.push(`<${tag}>${escapeHtml(line.text)}</${tag}>`);
      continue;
    }

    // Bullet lines start their own paragraph.
    if (line.text.startsWith("●") || line.text.startsWith("•")) {
      flushParagraph();
      parts.push(`<p>${escapeHtml(line.text)}</p>`);
      continue;
    }

    paragraph.push(line.text);
    if (!next || gap > line.height * 1.45) {
      flushParagraph();
    }
  }
  flushParagraph();
  return parts;
}

/** PDF → slotted HTML. Processes each page independently (never sort Y across pages). */
export async function pdfToHtml(bytes: Uint8Array): Promise<string> {
  // pdf.js may transfer/detach the ArrayBuffer — always pass a standalone copy.
  const data = Uint8Array.from(bytes);
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const glyphs: PdfGlyph[] = [];

    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str?.trim() || !raw.transform) continue;
      const [a, , , d, e, f] = raw.transform as number[];
      const height = Math.abs(d || a || raw.height || 10);
      const width =
        typeof raw.width === "number" && raw.width > 0
          ? raw.width
          : Math.max(height * raw.str.length * 0.45, 0);
      glyphs.push({
        str: raw.str,
        x: e ?? 0,
        y: f ?? 0,
        width,
        height,
      });
    }

    if (glyphs.length === 0) continue;

    const lines = glyphsToLines(glyphs);
    parts.push(...linesToHtmlBlocks(lines));
  }

  if (parts.length === 0) {
    throw new Error(
      "PDF has no text layer (scanned image). Upload a DOCX or paste into a template instead.",
    );
  }

  const html = sanitizeImportedHtml(parts.join("\n"));
  if (!html.replace(/<[^>]+>/g, "").trim()) {
    throw new Error("PDF conversion produced empty content");
  }
  return ensureSlotIds(html);
}

export type ImportKind = "pdf" | "docx" | "markdown" | "txt";

export function detectImportKind(fileName: string): ImportKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

export async function bytesToHtml(
  bytes: Uint8Array,
  kind: ImportKind,
  textFallback?: string,
): Promise<string> {
  if (kind === "markdown" || kind === "txt") {
    return markdownToHtml(textFallback ?? new TextDecoder().decode(bytes));
  }
  if (kind === "docx") return docxToHtml(bytes);
  return pdfToHtml(bytes);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
