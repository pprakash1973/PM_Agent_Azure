/**
 * Shared text chunker for locally-extracted documents (TXT / MD / CSV / XLSX,
 * and the DI fallback path). PDF/DOCX parsed by Azure Document Intelligence use
 * `diResultToChunks` in azure-di.ts instead, which is layout-aware.
 *
 * Produces ~500-char segments with locator metadata, matching the DocumentChunk
 * shape so both paths persist identically.
 */
export interface TextChunk {
  chunkIndex: number;
  pageNumber: number;
  charStart: number;
  charEnd: number;
  sectionTitle: string | null;
  text: string;
  tokenCount: number;
}

export function chunkText(text: string): TextChunk[] {
  const CHARS_PER_PAGE = 3000;
  const TARGET_CHUNK = 500;

  const paragraphs = text.split(/\n{2,}/);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  let globalChar = 0;
  let currentText = "";
  let currentStart = 0;
  let currentSection: string | null = null;

  function flush() {
    const t = currentText.trim();
    if (!t) return;
    const charStart = currentStart;
    const charEnd = charStart + t.length;
    chunks.push({
      chunkIndex: chunkIndex++,
      pageNumber: Math.floor(charStart / CHARS_PER_PAGE) + 1,
      charStart,
      charEnd,
      sectionTitle: currentSection,
      text: t,
      tokenCount: Math.ceil(t.length / 4),
    });
    currentText = "";
  }

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) { globalChar += para.length + 2; continue; }

    // Detect section headings (all-caps lines or lines ending with ":" under 80 chars)
    if ((trimmed === trimmed.toUpperCase() && trimmed.length < 80 && /[A-Z]/.test(trimmed))
      || (trimmed.endsWith(":") && trimmed.length < 80)) {
      flush();
      currentSection = trimmed;
      globalChar += para.length + 2;
      continue;
    }

    if (currentText.length + trimmed.length > TARGET_CHUNK) flush();

    if (!currentText) currentStart = globalChar;
    currentText += (currentText ? " " : "") + trimmed;
    globalChar += para.length + 2;
  }
  flush();
  return chunks;
}
