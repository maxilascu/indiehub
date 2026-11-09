// Processor core: types and PDF processing logic.
// Independent of Supabase. Operates on raw bytes and returns structured results.

export const PROCESSOR_VERSION = "pdf-local-v1";

export type AssetType = "source" | "product_image" | "logo" | "decorative" | "unknown";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  hasText: boolean;
  imageCount: number;
}

export interface DetectedAsset {
  asset_type: AssetType;
  source_page: number;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  sha256: string;
  processing_status: "extracted" | "detected" | "failed";
  metadata: Record<string, unknown>;
  item_index: number | null;
}

export interface ProductCandidate {
  item_index: number;
  source_page: number;
  raw_text: string;
  external_id: string;
  name: string;
  price: number | null;
  currency: string;
  description: string;
  sizes: string[];
  image_codes: string[];
  confidence: number;
  warnings: string[];
}

export interface ProcessingResult {
  pages: ExtractedPage[];
  assets: DetectedAsset[];
  candidates: ProductCandidate[];
  needsOcr: boolean;
  warnings: string[];
}

export interface ProcessPdfParams {
  pdfBytes: Uint8Array;
  brandId: string;
  jobId: string;
  onProgress?: (progress: number, stage: string) => Promise<void>;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Candidate detection from text ---

const PRICE_REGEX = /\$\s*([\d.]+(?:[,.]\d{1,2})?)/g;
const CODE_REGEX = /\b(ART[_-]?\d+(?:[._-]\d+)?|[A-Z]{2,5}[-_]?\d{2,5})\b/gi;
const SIZE_KEYWORDS = /\b(talles?|sizes?)\s*[:\-]?\s*([0-9a-zA-Z,.\-/ ]{2,60})/gi;
const CURRENCY_HINTS = /\b(ARS|USD|\$|U\$D|pesos?|d[oó]lares?)\b/i;
const CURRENCY_MAP: Record<string, string> = {
  usd: "USD", u$d: "USD", dolares: "USD", dólares: "USD",
  ars: "ARS", pesos: "ARS", "$": "ARS",
};

function detectCurrency(text: string): string {
  const match = text.match(CURRENCY_HINTS);
  if (!match) return "";
  return CURRENCY_MAP[match[1].toLowerCase()] ?? "ARS";
}

function detectSizes(text: string): string[] {
  const match = SIZE_KEYWORDS.exec(text);
  if (!match) return [];
  return match[2].split(/[,;/]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

function detectCandidates(
  pages: ExtractedPage[],
  brandId: string,
  jobId: string,
): { candidates: ProductCandidate[]; warnings: string[] } {
  const candidates: ProductCandidate[] = [];
  const warnings: string[] = [];
  let index = 0;

  for (const page of pages) {
    if (!page.hasText || page.text.trim().length < 5) continue;

    const lines = page.text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // Try to find product blocks by looking for price markers.
    const priceMatches = [...page.text.matchAll(PRICE_REGEX)];
    if (priceMatches.length === 0) {
      // If a page has text but no prices, still generate a candidate with the page text.
      if (page.text.trim().length > 20) {
        const codeMatch = page.text.match(CODE_REGEX);
        candidates.push({
          item_index: index++,
          source_page: page.pageNumber,
          raw_text: page.text.trim().slice(0, 5000),
          external_id: codeMatch ? codeMatch[0].toUpperCase().replace(/[_]/g, "-") : "",
          name: lines[0].slice(0, 200),
          price: null,
          currency: detectCurrency(page.text),
          description: lines.slice(1, 6).join(" ").slice(0, 500),
          sizes: detectSizes(page.text),
          image_codes: [],
          confidence: 0.3,
          warnings: ["Sin precio detectado"],
        });
      }
      continue;
    }

    // Group lines around each price match into product candidates.
    for (const priceMatch of priceMatches) {
      const priceStr = priceMatch[1].replace(/\./g, "").replace(",", ".");
      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) continue;

      // Find the price position in the full text to extract surrounding context.
      const priceIdx = priceMatch.index ?? 0;
      const contextStart = Math.max(0, priceIdx - 300);
      const contextEnd = Math.min(page.text.length, priceIdx + 100);
      const context = page.text.slice(contextStart, contextEnd);
      const contextLines = context.split(/\n/).map((l) => l.trim()).filter(Boolean);

      const codeMatch = context.match(CODE_REGEX);
      const name = contextLines.find((l) => l.length > 3 && !l.match(/^\$/)) ?? contextLines[0] ?? "";
      const desc = contextLines.filter((l) => l !== name && !l.match(/^\$/)).join(" ").slice(0, 500);

      candidates.push({
        item_index: index++,
        source_page: page.pageNumber,
        raw_text: context.slice(0, 2000),
        external_id: codeMatch ? codeMatch[0].toUpperCase().replace(/[_]/g, "-") : "",
        name: name.slice(0, 200),
        price,
        currency: detectCurrency(context) || "ARS",
        description: desc,
        sizes: detectSizes(context),
        image_codes: [],
        confidence: codeMatch ? 0.6 : 0.4,
        warnings: codeMatch ? [] : ["Código de artículo no detectado"],
      });
    }
  }

  if (candidates.length === 0) {
    warnings.push("No se detectaron candidatos de producto en el texto.");
  }

  return { candidates, warnings };
}

export async function processPdf(params: ProcessPdfParams): Promise<ProcessingResult> {
  const { pdfBytes, brandId, jobId, onProgress } = params;
  const warnings: string[] = [];
  const pages: ExtractedPage[] = [];
  const assets: DetectedAsset[] = [];

  // Dynamic import of pdfjs-dist. Deno can fetch from npm.
  const pdfjs = await import("npm:pdfjs-dist@4.7.76");

  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;

  if (totalPages === 0) {
    await loadingTask.destroy();
    return { pages: [], assets: [], candidates: [], needsOcr: false, warnings: ["El PDF no tiene páginas."] };
  }

  await onProgress?.(10, "Leyendo PDF");

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const pageProgress = 10 + Math.floor(((i - 1) / totalPages) * 70);
    await onProgress?.(pageProgress, `Procesando página ${i} de ${totalPages}`);

    let textContent = "";
    let hasText = false;
    try {
      const text = await page.getTextContent();
      textContent = text.items
        .map((item: unknown) => {
          if (typeof item === "object" && item !== null && "str" in item) {
            return String((item as { str: string }).str);
          }
          return "";
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      hasText = textContent.length > 5;
    } catch {
      warnings.push(`No se pudo extraer texto de la página ${i}.`);
    }

    let imageCount = 0;
    try {
      // OperatorList contains image operations.
      const ops = await page.getOperatorList();
      const OPS = pdfjs.OPS;
      for (const op of ops.fnArray) {
        if (op === OPS.paintImageXObject || op === OPS.paintInlineImage || op === OPS.paintImageMaskXObject) {
          imageCount++;
        }
      }
    } catch {
      // Non-fatal: we just won't count images on this page.
    }

    pages.push({ pageNumber: i, text: textContent, hasText, imageCount });
    page.cleanup();
  }

  await onProgress?.(82, "Analizando imágenes embebidas");

  // Detect assets: we register image placeholders per page.
  // Actual image byte extraction from pdfjs requires accessing page.objs,
  // which is complex. For v1 we register detected assets with processing_status="detected".
  for (const page of pages) {
    if (page.imageCount === 0) continue;
    for (let imgIdx = 0; imgIdx < page.imageCount; imgIdx++) {
      const assetId = `page${page.pageNumber}_img${imgIdx}`;
      const storagePath = `derived/${brandId}/${jobId}/${assetId}.webp`;
      assets.push({
        asset_type: imgIdx === 0 && page.imageCount === 1 ? "product_image" : "unknown",
        source_page: page.pageNumber,
        original_filename: assetId,
        storage_path: storagePath,
        mime_type: "image/webp",
        file_size: 0,
        width: null,
        height: null,
        sha256: "",
        processing_status: "detected",
        metadata: { page: page.pageNumber, image_index: imgIdx },
        item_index: null,
      });
    }
  }

  await onProgress?.(90, "Detectando candidatos");

  // Determine if the PDF needs OCR (scanned, no selectable text).
  const pagesWithText = pages.filter((p) => p.hasText).length;
  const needsOcr = pagesWithText === 0 && totalPages > 0;

  if (needsOcr) {
    warnings.push("PDF sin texto extraíble; requiere OCR.");
  }

  const { candidates, warnings: candidateWarnings } = detectCandidates(pages, brandId, jobId);
  warnings.push(...candidateWarnings);

  await onProgress?.(95, "Generando resultados");

  return { pages, assets, candidates, needsOcr, warnings };
}

// --- Serialization to RPC format ---

export function candidatesToItems(candidates: ProductCandidate[]): unknown[] {
  return candidates.map((c) => ({
    item_index: c.item_index,
    external_id: c.external_id,
    raw_data: {
      source_page: c.source_page,
      raw_text: c.raw_text,
    },
    normalized_data: {
      name: c.name,
      price: c.price,
      currency: c.currency,
      description: c.description,
      sizes: c.sizes,
      image_codes: c.image_codes,
    },
    confidence: c.confidence,
    proposed_action: "create",
    validation_errors: [] as string[],
    warnings: c.warnings,
  }));
}

export function assetsToRpc(assets: DetectedAsset[]): unknown[] {
  return assets.map((a) => ({
    asset_type: a.asset_type,
    item_index: a.item_index,
    storage_path: a.storage_path,
    original_filename: a.original_filename,
    mime_type: a.mime_type,
    file_size: a.file_size > 0 ? String(a.file_size) : "",
    page_number: String(a.source_page),
    sha256: a.sha256,
    width: a.width ? String(a.width) : "",
    height: a.height ? String(a.height) : "",
    processing_status: a.processing_status,
    metadata: a.metadata,
  }));
}

export { uint8ToBase64, sha256Hex };
