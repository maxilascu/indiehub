// Processor core: types and PDF processing logic.
// Independent of Supabase. Operates on raw bytes and returns structured results.

export const PROCESSOR_VERSION = "pdf-local-v2";

export type AssetType =
  | "source"
  | "product_image"
  | "logo"
  | "decorative"
  | "unknown";

export interface ExtractedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  hasText: boolean;
  imageCount: number;
  textItems: ExtractedTextItem[];
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
  onProgress?: (
    progress: number,
    stage: string,
  ) => Promise<void>;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(
      i,
      Math.min(i + chunk, bytes.length),
    );

    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data,
  );

  const hashArray = new Uint8Array(hashBuffer);

  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------
// Text detection
// ---------------------------------------------------------

const PRICE_REGEX =
  /\$\s*([\d.]+(?:[,.]\d{1,2})?)/g;

const CODE_REGEX =
  /\b(ART[_-]?\d+(?:[._-]\d+)?|[A-Z]{2,5}[-_]?\d{2,5})\b/gi;

const SIZE_KEYWORDS =
  /\b(talles?|sizes?)\s*[:\-]?\s*([0-9a-zA-Z,.\-/ ]{2,60})/gi;

const CURRENCY_HINTS =
  /\b(ARS|USD|\$|U\$D|pesos?|d[oó]lares?)\b/i;

const CURRENCY_MAP: Record<string, string> = {
  usd: "USD",
  u$d: "USD",
  dolares: "USD",
  dólares: "USD",
  ars: "ARS",
  pesos: "ARS",
  $: "ARS",
};

function detectCurrency(text: string): string {
  const match = text.match(CURRENCY_HINTS);

  if (!match) return "";

  return (
    CURRENCY_MAP[match[1].toLowerCase()] ??
    "ARS"
  );
}

function detectSizes(text: string): string[] {
  const regex = new RegExp(
    SIZE_KEYWORDS.source,
    SIZE_KEYWORDS.flags,
  );

  const match = regex.exec(text);

  if (!match) return [];

  return match[2]
    .split(/[,;/]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function isProbablyProductName(text: string): boolean {
  const normalized = normalizeText(text);

  if (normalized.length < 3) return false;

  const lower = normalized.toLowerCase();

  const excluded = [
    "contacto",
    "whatsapp",
    "instagram",
    "facebook",
    "www.",
    "condiciones",
    "formas de pago",
    "envíos",
    "envios",
    "sucursales",
    "dirección",
    "direccion",
    "teléfono",
    "telefono",
    "horarios",
    "colección",
    "coleccion",
    "artículos publicados",
    "articulos publicados",
    "categorías",
    "categorias",
    "referencias verificadas",
    "copyright",
  ];

  if (excluded.some((word) => lower.includes(word))) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------

function groupTextItemsIntoLines(
  items: ExtractedTextItem[],
): string[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 4) {
      return a.y - b.y;
    }

    return a.x - b.x;
  });

  const lines: ExtractedTextItem[][] = [];

  for (const item of sorted) {
    const previous = lines[lines.length - 1];

    if (!previous) {
      lines.push([item]);
      continue;
    }

    const reference = previous[previous.length - 1];

    const sameLine =
      Math.abs(item.y - reference.y) <=
      Math.max(3, item.height * 0.5);

    if (sameLine) {
      previous.push(item);
    } else {
      lines.push([item]);
    }
  }

  return lines.map((line) =>
    line
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function getItemsText(
  items: ExtractedTextItem[],
): string {
  return items
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) > 4) {
        return a.y - b.y;
      }

      return a.x - b.x;
    })
    .map((item) => item.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function distanceBetweenItems(
  a: ExtractedTextItem,
  b: ExtractedTextItem,
): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;

  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;

  return Math.sqrt(
    Math.pow(ax - bx, 2) +
      Math.pow(ay - by, 2),
  );
}

// ---------------------------------------------------------
// Candidate detection
// ---------------------------------------------------------

function detectCandidates(
  pages: ExtractedPage[],
): {
  candidates: ProductCandidate[];
  warnings: string[];
} {
  const candidates: ProductCandidate[] = [];
  const warnings: string[] = [];

  let index = 0;

  for (const page of pages) {
    if (
      !page.hasText ||
      page.text.trim().length < 5
    ) {
      continue;
    }

    const lines = groupTextItemsIntoLines(
      page.textItems,
    );

    const pageText = normalizeText(
      page.text,
    );

    const priceMatches = [
      ...pageText.matchAll(
        new RegExp(
          PRICE_REGEX.source,
          PRICE_REGEX.flags,
        ),
      ),
    ];

    const codeMatches = [
      ...pageText.matchAll(
        new RegExp(
          CODE_REGEX.source,
          CODE_REGEX.flags,
        ),
      ),
    ];

    const pageSizes = detectSizes(pageText);

    // -----------------------------------------------------
    // No price
    // -----------------------------------------------------

    if (priceMatches.length === 0) {
      const hasCode =
        codeMatches.length > 0;

      const hasSize =
        pageSizes.length > 0;

      // Evita convertir páginas editoriales,
      // institucionales o de portada en productos.
      if (!hasCode && !hasSize) {
        continue;
      }

      const candidateName =
        lines.find(isProbablyProductName) ??
        "";

      if (!candidateName) {
        continue;
      }

      const codeMatch =
        codeMatches[0];

      candidates.push({
        item_index: index++,
        source_page: page.pageNumber,
        raw_text: pageText.slice(0, 5000),
        external_id: codeMatch
          ? codeMatch[0]
              .toUpperCase()
              .replace(/[_]/g, "-")
          : "",
        name: candidateName.slice(0, 200),
        price: null,
        currency:
          detectCurrency(pageText) ||
          "ARS",
        description: lines
          .filter(
            (line) =>
              line !== candidateName,
          )
          .slice(0, 5)
          .join(" ")
          .slice(0, 500),
        sizes: pageSizes,
        image_codes: [],
        confidence: hasCode
          ? 0.55
          : 0.4,
        warnings: [
          "Sin precio detectado",
          ...(hasCode
            ? []
            : [
                "Código de artículo no detectado",
              ]),
        ],
      });

      continue;
    }

    // -----------------------------------------------------
    // Pages with prices
    // -----------------------------------------------------

    for (
      let priceIndex = 0;
      priceIndex < priceMatches.length;
      priceIndex++
    ) {
      const priceMatch =
        priceMatches[priceIndex];

      const priceStr =
        priceMatch[1]
          .replace(/\./g, "")
          .replace(",", ".");

      const price =
        parseFloat(priceStr);

      if (
        Number.isNaN(price) ||
        price <= 0
      ) {
        continue;
      }

      // Posición aproximada del precio
      // dentro del texto.
      const priceText =
        priceMatch[0];

      let runningIndex = 0;
      let priceItem:
        | ExtractedTextItem
        | undefined;

      for (
        const item of page.textItems
      ) {
        const itemStart =
          runningIndex;

        const itemEnd =
          runningIndex +
          item.text.length;

        if (
          itemStart <=
            pageText.indexOf(
              priceText,
              runningIndex,
            ) &&
          itemEnd >=
            pageText.indexOf(
              priceText,
              runningIndex,
            )
        ) {
          priceItem =
            item;
          break;
        }

        runningIndex =
          itemEnd + 1;
      }

      // Si no podemos localizar espacialmente
      // el precio, mantenemos un fallback
      // basado en texto.
      let nearbyItems =
        page.textItems;

      if (priceItem) {
        nearbyItems =
          page.textItems.filter(
            (item) =>
              distanceBetweenItems(
                priceItem!,
                item,
              ) < 220,
          );
      }

      const nearbyText =
        getItemsText(
          nearbyItems,
        );

      const nearbyCode =
        nearbyText.match(
          new RegExp(
            CODE_REGEX.source,
            "i",
          ),
        );

      const nearbySizes =
        detectSizes(
          nearbyText,
        );

      const nearbyLines =
        groupTextItemsIntoLines(
          nearbyItems,
        );

      const candidateName =
        nearbyLines.find(
          (line) =>
            line !== priceText &&
            !line.match(
              PRICE_REGEX,
            ) &&
            isProbablyProductName(
              line,
            ),
        ) ??
        "";

      if (!candidateName) {
        warnings.push(
          `Precio detectado en página ${page.pageNumber}, pero no se pudo determinar un nombre de producto.`,
        );
      }

      const confidence =
        nearbyCode
          ? 0.85
          : candidateName
            ? 0.65
            : 0.4;

      candidates.push({
        item_index: index++,
        source_page:
          page.pageNumber,
        raw_text:
          nearbyText.slice(
            0,
            2000,
          ),
        external_id:
          nearbyCode
            ? nearbyCode[0]
                .toUpperCase()
                .replace(
                  /[_]/g,
                  "-",
                )
            : "",
        name:
          candidateName.slice(
            0,
            200,
          ),
        price,
        currency:
          detectCurrency(
            nearbyText,
          ) ||
          "ARS",
        description:
          nearbyLines
            .filter(
              (line) =>
                line !==
                candidateName &&
                !line.match(
                  PRICE_REGEX,
                ),
            )
            .slice(0, 5)
            .join(" ")
            .slice(
              0,
              500,
            ),
        sizes:
          nearbySizes,
        image_codes: [],
        confidence,
        warnings:
          nearbyCode
            ? []
            : [
                "Código de artículo no detectado",
              ],
      });
    }
  }

  if (
    candidates.length === 0
  ) {
    warnings.push(
      "No se detectaron candidatos de producto en el texto.",
    );
  }

  return {
    candidates,
    warnings,
  };
}

// ---------------------------------------------------------
// PDF processing
// ---------------------------------------------------------

export async function processPdf(
  params: ProcessPdfParams,
): Promise<ProcessingResult> {
  const {
    pdfBytes,
    brandId,
    jobId,
    onProgress,
  } = params;

  const warnings: string[] = [];
  const pages: ExtractedPage[] = [];
  const assets: DetectedAsset[] = [];

  const pdfjs =
    await import(
      "npm:pdfjs-dist@4.7.76"
    );

  const loadingTask =
    pdfjs.getDocument({
      data: pdfBytes,
      isEvalSupported:
        false,
      useSystemFonts:
        true,
    });

  const doc =
    await loadingTask.promise;

  const totalPages =
    doc.numPages;

  if (
    totalPages === 0
  ) {
    await loadingTask.destroy();

    return {
      pages: [],
      assets: [],
      candidates: [],
      needsOcr: false,
      warnings: [
        "El PDF no tiene páginas.",
      ],
    };
  }

  await onProgress?.(
    10,
    "Leyendo PDF",
  );

  for (
    let i = 1;
    i <= totalPages;
    i++
  ) {
    const page =
      await doc.getPage(i);

    const pageProgress =
      10 +
      Math.floor(
        ((i - 1) /
          totalPages) *
          70,
      );

    await onProgress?.(
      pageProgress,
      `Procesando página ${i} de ${totalPages}`,
    );

    let textContent = "";
    let hasText = false;

    const textItems:
      ExtractedTextItem[] =
      [];

    try {
      const text =
        await page.getTextContent();

      for (
        const rawItem of
          text.items
      ) {
        if (
          typeof rawItem !==
            "object" ||
          rawItem === null ||
          !(
            "str" in
            rawItem
          )
        ) {
          continue;
        }

        const item =
          rawItem as {
            str: string;
            transform?: number[];
            width?: number;
            height?: number;
          };

        const value =
          String(
            item.str ??
              "",
          ).trim();

        if (!value) {
          continue;
        }

        const transform =
          Array.isArray(
            item.transform,
          )
            ? item.transform
            : [];

        const x =
          Number(
            transform[4] ??
              0,
          );

        const y =
          Number(
            transform[5] ??
              0,
          );

        const width =
          Number(
            item.width ??
              0,
          );

        const height =
          Number(
            item.height ??
              0,
          );

        textItems.push({
          text: value,
          x,
          y,
          width,
          height,
        });
      }

      textContent =
        getItemsText(
          textItems,
        );

      hasText =
        textContent.length >
        5;
    } catch {
      warnings.push(
        `No se pudo extraer texto de la página ${i}.`,
      );
    }

    let imageCount =
      0;

    try {
      const ops =
        await page.getOperatorList();

      const OPS =
        pdfjs.OPS;

      for (
        const op of
          ops.fnArray
      ) {
        if (
          op ===
            OPS.paintImageXObject ||
          op ===
            OPS.paintInlineImage ||
          op ===
            OPS.paintImageMaskXObject
        ) {
          imageCount++;
        }
      }
    } catch {
      // No fatal.
    }

    pages.push({
      pageNumber:
        i,
      text:
        textContent,
      hasText,
      imageCount,
      textItems,
    });

    page.cleanup();
  }

  await onProgress?.(
    82,
    "Analizando imágenes embebidas",
  );

  // Por ahora mantenemos detección de imágenes.
  // La extracción física de bytes de las imágenes
  // se incorporará en una etapa posterior,
  // una vez validada la extracción de layout.
  for (
    const page of
      pages
  ) {
    if (
      page.imageCount ===
      0
    ) {
      continue;
    }

    for (
      let imgIdx = 0;
      imgIdx <
        page.imageCount;
      imgIdx++
    ) {
      const assetId =
        `page${page.pageNumber}_img${imgIdx}`;

      const storagePath =
        `derived/${brandId}/${jobId}/${assetId}.webp`;

      assets.push({
        asset_type:
          imgIdx === 0 &&
          page.imageCount ===
            1
            ? "product_image"
            : "unknown",
        source_page:
          page.pageNumber,
        original_filename:
          assetId,
        storage_path:
          storagePath,
        mime_type:
          "image/webp",
        file_size:
          0,
        width:
          null,
        height:
          null,
        sha256:
          "",
        processing_status:
          "detected",
        metadata: {
          page:
            page.pageNumber,
          image_index:
            imgIdx,
        },
        item_index:
          null,
      });
    }
  }

  await onProgress?.(
    90,
    "Detectando candidatos",
  );

  const pagesWithText =
    pages.filter(
      (p) =>
        p.hasText,
    ).length;

  const needsOcr =
    pagesWithText ===
      0 &&
    totalPages >
      0;

  if (
    needsOcr
  ) {
    warnings.push(
      "PDF sin texto extraíble; requiere OCR.",
    );
  }

  const {
    candidates,
    warnings:
      candidateWarnings,
  } =
    detectCandidates(
      pages,
    );

  warnings.push(
    ...candidateWarnings,
  );

  await onProgress?.(
    95,
    "Generando resultados",
  );

  return {
    pages,
    assets,
    candidates,
    needsOcr,
    warnings,
  };
}

// ---------------------------------------------------------
// RPC serialization
// ---------------------------------------------------------

export function candidatesToItems(
  candidates: ProductCandidate[],
): unknown[] {
  return candidates.map(
    (c) => ({
      item_index:
        c.item_index,
      external_id:
        c.external_id,
      raw_data: {
        source_page:
          c.source_page,
        raw_text:
          c.raw_text,
      },
      normalized_data: {
        name:
          c.name,
        price:
          c.price,
        currency:
          c.currency,
        description:
          c.description,
        sizes:
          c.sizes,
        image_codes:
          c.image_codes,
      },
      confidence:
        c.confidence,
      proposed_action:
        "create",
      validation_errors:
        [],
      warnings:
        c.warnings,
    }),
  );
}

export function assetsToRpc(
  assets: DetectedAsset[],
): unknown[] {
  return assets.map(
    (a) => ({
      asset_type:
        a.asset_type,
      item_index:
        a.item_index,
      storage_path:
        a.storage_path,
      original_filename:
        a.original_filename,
      mime_type:
        a.mime_type,
      file_size:
        a.file_size >
        0
          ? String(
              a.file_size,
            )
          : "",
      page_number:
        String(
          a.source_page,
        ),
      sha256:
        a.sha256,
      width:
        a.width
          ? String(
              a.width,
            )
          : "",
      height:
        a.height
          ? String(
              a.height,
            )
          : "",
      processing_status:
        a.processing_status,
      metadata:
        a.metadata,
    }),
  );
}

export {
  uint8ToBase64,
  sha256Hex,
};
