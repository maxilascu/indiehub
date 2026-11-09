// Processor core: types and PDF processing logic.
// Independent of Supabase. Operates on raw bytes and returns structured results.

export const PROCESSOR_VERSION = "pdf-local-v3";

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

  // Bytes are used internally by process-import.
  // They are intentionally ignored by assetsToRpc().
  data?: Uint8Array;
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

// ---------------------------------------------------------
// Binary helpers
// ---------------------------------------------------------

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

async function sha256Hex(
  data: Uint8Array,
): Promise<string> {
  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-256",
      data,
    );

  const hashArray =
    new Uint8Array(
      hashBuffer,
    );

  return Array.from(
    hashArray,
  )
    .map((b) =>
      b.toString(16).padStart(2, "0"),
    )
    .join("");
}

function writeUint32BE(
  value: number,
): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function concatBytes(
  ...arrays: Uint8Array[]
): Uint8Array {
  const total = arrays.reduce(
    (sum, array) =>
      sum + array.length,
    0,
  );

  const result =
    new Uint8Array(total);

  let offset = 0;

  for (const array of arrays) {
    result.set(
      array,
      offset,
    );

    offset +=
      array.length;
  }

  return result;
}

function crc32(
  data: Uint8Array,
): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc ^= byte;

    for (let i = 0; i < 8; i++) {
      crc =
        (crc >>> 1) ^
        (0xedb88320 &
          -(crc & 1));
    }
  }

  return (
    (crc ^ 0xffffffff) >>>
    0
  );
}

function pngChunk(
  type: string,
  data: Uint8Array,
): Uint8Array {
  const typeBytes =
    new TextEncoder().encode(
      type,
    );

  const crcData =
    concatBytes(
      typeBytes,
      data,
    );

  return concatBytes(
    writeUint32BE(
      data.length,
    ),
    typeBytes,
    data,
    writeUint32BE(
      crc32(
        crcData,
      ),
    ),
  );
}

/**
 * PDF.js often exposes decoded image pixels rather than
 * the original compressed JPEG/PNG bytes.
 *
 * We normalize those pixels to PNG so the resulting asset
 * can always be uploaded as a normal image file.
 */
async function rawPixelsToPng(
  data: Uint8Array,
  width: number,
  height: number,
  kind: number,
): Promise<Uint8Array> {
  let channels: number;

  if (kind === 1) {
    // PDF.js grayscale 1bpp.
    channels = 1;
  } else if (kind === 2) {
    // PDF.js RGB 24bpp.
    channels = 3;
  } else if (kind === 3) {
    // PDF.js RGBA 32bpp.
    channels = 4;
  } else {
    throw new Error(
      `Tipo de imagen PDF.js no soportado: ${kind}`,
    );
  }

  const expected =
    width *
    height *
    channels;

  if (
    data.length <
    expected
  ) {
    throw new Error(
      `Datos de imagen incompletos: ${data.length}/${expected} bytes`,
    );
  }

  let rgba =
    new Uint8Array(
      width *
        height *
        4,
    );

  if (channels === 4) {
    rgba.set(
      data.subarray(
        0,
        rgba.length,
      ),
    );
  } else if (
    channels === 3
  ) {
    let source = 0;
    let target = 0;

    for (
      let i = 0;
      i <
        width *
          height;
      i++
    ) {
      rgba[target++] =
        data[source++];
      rgba[target++] =
        data[source++];
      rgba[target++] =
        data[source++];
      rgba[target++] =
        255;
    }
  } else {
    // Grayscale.
    for (
      let i = 0;
      i <
        width *
          height;
      i++
    ) {
      const value =
        data[i];

      const target =
        i * 4;

      rgba[target] =
        value;
      rgba[target + 1] =
        value;
      rgba[target + 2] =
        value;
      rgba[target + 3] =
        255;
    }
  }

  // PNG scanlines need one filter byte per row.
  const scanlineLength =
    width * 4 + 1;

  const scanlines =
    new Uint8Array(
      scanlineLength *
        height,
    );

  for (
    let y = 0;
    y < height;
    y++
  ) {
    const rowStart =
      y *
      scanlineLength;

    scanlines[rowStart] =
      0;

    scanlines.set(
      rgba.subarray(
        y *
          width *
          4,
        (y + 1) *
          width *
          4,
      ),
      rowStart + 1,
    );
  }

  const compressed =
    await compressDeflate(
      scanlines,
    );

  const signature =
    new Uint8Array([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
    ]);

  const ihdr =
    new Uint8Array(
      13,
    );

  ihdr.set(
    writeUint32BE(
      width,
    ),
    0,
  );

  ihdr.set(
    writeUint32BE(
      height,
    ),
    4,
  );

  ihdr[8] =
    8; // bit depth

  ihdr[9] =
    6; // RGBA

  ihdr[10] =
    0;

  ihdr[11] =
    0;

  ihdr[12] =
    0;

  return concatBytes(
    signature,
    pngChunk(
      "IHDR",
      ihdr,
    ),
    pngChunk(
      "IDAT",
      compressed,
    ),
    pngChunk(
      "IEND",
      new Uint8Array(),
    ),
  );
}

async function compressDeflate(
  data: Uint8Array,
): Promise<Uint8Array> {
  const CompressionStreamCtor =
    globalThis
      .CompressionStream;

  if (
    typeof CompressionStreamCtor !==
    "undefined"
  ) {
    const stream =
      new CompressionStream(
        "deflate",
      );

    const writer =
      stream.writable.getWriter();

    await writer.write(
      data,
    );

    await writer.close();

    const response =
      new Response(
        stream.readable,
      );

    return new Uint8Array(
      await response.arrayBuffer(),
    );
  }

  throw new Error(
    "CompressionStream no disponible en este entorno.",
  );
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

const CURRENCY_MAP: Record<
  string,
  string
> = {
  usd: "USD",
  "u$d": "USD",
  dolares: "USD",
  dólares: "USD",
  ars: "ARS",
  pesos: "ARS",
  $: "ARS",
};

function detectCurrency(
  text: string,
): string {
  const match =
    text.match(
      CURRENCY_HINTS,
    );

  if (!match) {
    return "";
  }

  return (
    CURRENCY_MAP[
      match[1].toLowerCase()
    ] ??
    "ARS"
  );
}

function detectSizes(
  text: string,
): string[] {
  const regex =
    new RegExp(
      SIZE_KEYWORDS.source,
      SIZE_KEYWORDS.flags,
    );

  const match =
    regex.exec(
      text,
    );

  if (!match) {
    return [];
  }

  return match[2]
    .split(
      /[,;/]\s*/,
    )
    .map(
      (s) =>
        s.trim(),
    )
    .filter(Boolean)
    .slice(
      0,
      20,
    );
}

function normalizeText(
  value: string,
): string {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function isProbablyProductName(
  text: string,
): boolean {
  const normalized =
    normalizeText(
      text,
    );

  if (
    normalized.length <
    3
  ) {
    return false;
  }

  const lower =
    normalized.toLowerCase();

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

  if (
    excluded.some(
      (word) =>
        lower.includes(
          word,
        ),
    )
  ) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------

function sortTextItems(
  items: ExtractedTextItem[],
): ExtractedTextItem[] {
  return [
    ...items,
  ].sort(
    (a, b) => {
      if (
        Math.abs(
          a.y -
            b.y,
        ) > 4
      ) {
        return (
          a.y -
          b.y
        );
      }

      return (
        a.x -
        b.x
      );
    },
  );
}

function groupTextItemsIntoLines(
  items: ExtractedTextItem[],
): string[] {
  if (
    items.length ===
    0
  ) {
    return [];
  }

  const sorted =
    sortTextItems(
      items,
    );

  const lines:
    ExtractedTextItem[][] =
    [];

  for (
    const item of
      sorted
  ) {
    const previous =
      lines[
        lines.length -
          1
      ];

    if (
      !previous
    ) {
      lines.push([
        item,
      ]);
      continue;
    }

    const reference =
      previous[
        previous.length -
          1
      ];

    const sameLine =
      Math.abs(
        item.y -
          reference.y,
      ) <=
      Math.max(
        3,
        item.height *
          0.5,
      );

    if (
      sameLine
    ) {
      previous.push(
        item,
      );
    } else {
      lines.push([
        item,
      ]);
    }
  }

  return lines.map(
    (line) =>
      line
        .sort(
          (a, b) =>
            a.x -
            b.x,
        )
        .map(
          (item) =>
            item.text,
        )
        .join(
          " ",
        )
        .replace(
          /\s+/g,
          " ",
        )
        .trim(),
  );
}

function getItemsText(
  items: ExtractedTextItem[],
): string {
  return sortTextItems(
    items,
  )
    .map(
      (item) =>
        item.text,
    )
    .join(
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function distanceBetweenItems(
  a: ExtractedTextItem,
  b: ExtractedTextItem,
): number {
  const ax =
    a.x +
    a.width /
      2;

  const ay =
    a.y +
    a.height /
      2;

  const bx =
    b.x +
    b.width /
      2;

  const by =
    b.y +
    b.height /
      2;

  return Math.sqrt(
    Math.pow(
      ax -
        bx,
      2,
    ) +
      Math.pow(
        ay -
          by,
        2,
      ),
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
  const candidates: ProductCandidate[] =
    [];

  const warnings: string[] =
    [];

  let index = 0;

  for (
    const page of
      pages
  ) {
    if (
      !page.hasText ||
      page.text.trim()
        .length <
        5
    ) {
      continue;
    }

    const lines =
      groupTextItemsIntoLines(
        page.textItems,
      );

    const pageText =
      normalizeText(
        page.text,
      );

    const priceMatches =
      [
        ...pageText.matchAll(
          new RegExp(
            PRICE_REGEX.source,
            PRICE_REGEX.flags,
          ),
        ),
      ];

    const codeMatches =
      [
        ...pageText.matchAll(
          new RegExp(
            CODE_REGEX.source,
            CODE_REGEX.flags,
          ),
        ),
      ];

    const pageSizes =
      detectSizes(
        pageText,
      );

    if (
      priceMatches.length ===
      0
    ) {
      const hasCode =
        codeMatches.length >
        0;

      const hasSize =
        pageSizes.length >
        0;

      if (
        !hasCode &&
        !hasSize
      ) {
        continue;
      }

      const candidateName =
        lines.find(
          isProbablyProductName,
        ) ??
        "";

      if (
        !candidateName
      ) {
        continue;
      }

      const codeMatch =
        codeMatches[0];

      candidates.push({
        item_index:
          index++,
        source_page:
          page.pageNumber,
        raw_text:
          pageText.slice(
            0,
            5000,
          ),
        external_id:
          codeMatch
            ? codeMatch[0]
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
        price:
          null,
        currency:
          detectCurrency(
            pageText,
          ) ||
          "ARS",
        description:
          lines
            .filter(
              (line) =>
                line !==
                candidateName,
            )
            .slice(
              0,
              5,
            )
            .join(
              " ",
            )
            .slice(
              0,
              500,
            ),
        sizes:
          pageSizes,
        image_codes:
          [],
        confidence:
          hasCode
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

    for (
      let priceIndex = 0;
      priceIndex <
        priceMatches.length;
      priceIndex++
    ) {
      const priceMatch =
        priceMatches[
          priceIndex
        ];

      const priceStr =
        priceMatch[1]
          .replace(
            /\./g,
            "",
          )
          .replace(
            ",",
            ".",
          );

      const price =
        parseFloat(
          priceStr,
        );

      if (
        Number.isNaN(
          price,
        ) ||
        price <=
          0
      ) {
        continue;
      }

      const priceText =
        priceMatch[0];

      const occurrence =
        findNthTextOccurrence(
          page.textItems,
          priceText,
          priceIndex,
        );

      const priceItem =
        occurrence.item;

      let nearbyItems =
        page.textItems;

      if (
        priceItem
      ) {
        nearbyItems =
          page.textItems.filter(
            (item) =>
              distanceBetweenItems(
                priceItem,
                item,
              ) <
              220,
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
            line !==
              priceText &&
            !line.match(
              PRICE_REGEX,
            ) &&
            isProbablyProductName(
              line,
            ),
        ) ??
        "";

      if (
        !candidateName
      ) {
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
        item_index:
          index++,
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
            .slice(
              0,
              5,
            )
            .join(
              " ",
            )
            .slice(
              0,
              500,
            ),
        sizes:
          nearbySizes,
        image_codes:
          [],
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
    candidates.length ===
    0
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

function findNthTextOccurrence(
  items: ExtractedTextItem[],
  searchText: string,
  occurrenceIndex: number,
): {
  item:
    | ExtractedTextItem
    | undefined;
} {
  const sorted =
    sortTextItems(
      items,
    );

  let occurrence = 0;

  for (
    const item of
      sorted
  ) {
    if (
      item.text.includes(
        searchText,
      )
    ) {
      if (
        occurrence ===
        occurrenceIndex
      ) {
        return {
          item,
        };
      }

      occurrence++;
    }
  }

  return {
    item:
      undefined,
  };
}

// ---------------------------------------------------------
// PDF image extraction
// ---------------------------------------------------------

function getImageAssetType(
  width: number,
  height: number,
  pageText: string,
): AssetType {
  const area =
    width *
    height;

  const lower =
    pageText.toLowerCase();

  if (
    lower.includes(
      "logo",
    ) &&
    area <
      500_000
  ) {
    return "logo";
  }

  if (
    area >
    80_000
  ) {
    return "product_image";
  }

  if (
    area <
    20_000
  ) {
    return "decorative";
  }

  return "unknown";
}

async function extractPageImages(
  page: any,
  pageNumber: number,
  brandId: string,
  jobId: string,
  pageText: string,
  pdfjs: any,
): Promise<DetectedAsset[]> {
  const assets: DetectedAsset[] =
    [];

  let operatorList:
    | any
    | undefined;

  try {
    operatorList =
      await page.getOperatorList();
  } catch {
    return assets;
  }

  const OPS =
    pdfjs.OPS;

  const imageOps =
    new Set([
      OPS.paintImageXObject,
      OPS.paintInlineImage,
      OPS.paintImageMaskXObject,
    ]);

  let imageIndex = 0;

  for (
    let i = 0;
    i <
      operatorList.fnArray.length;
    i++
  ) {
    const op =
      operatorList.fnArray[i];

    if (
      !imageOps.has(
        op,
      )
    ) {
      continue;
    }

    const args =
      operatorList
        .argsArray[i];

    const imageName =
      args?.[0];

    if (
      typeof imageName !==
      "string"
    ) {
      continue;
    }

    try {
      const image =
        page.objs.get(
          imageName,
        );

      if (
        !image
      ) {
        continue;
      }

      const width =
        Number(
          image.width ??
            0,
        );

      const height =
        Number(
          image.height ??
            0,
        );

      if (
        width <=
          0 ||
        height <=
          0
      ) {
        continue;
      }

      const rawData =
        image.data;

      if (
        !rawData
      ) {
        continue;
      }

      const sourceBytes =
        rawData instanceof
        Uint8Array
          ? rawData
          : new Uint8Array(
              rawData,
            );

      const pngBytes =
        await rawPixelsToPng(
          sourceBytes,
          width,
          height,
          Number(
            image.kind ??
              3,
          ),
        );

      const sha256 =
        await sha256Hex(
          pngBytes,
        );

      const assetId =
        `page${pageNumber}_img${imageIndex}`;

      assets.push({
        asset_type:
          getImageAssetType(
            width,
            height,
            pageText,
          ),
        source_page:
          pageNumber,
        original_filename:
          `${assetId}.png`,
        storage_path:
          `derived/${brandId}/${jobId}/${assetId}.png`,
        mime_type:
          "image/png",
        file_size:
          pngBytes.length,
        width,
        height,
        sha256,
        processing_status:
          "extracted",
        metadata: {
          page:
            pageNumber,
          image_index:
            imageIndex,
          pdf_object_name:
            imageName,
          source_kind:
            Number(
              image.kind ??
                0,
            ),
        },
        item_index:
          null,
        data:
          pngBytes,
      });

      imageIndex++;
    } catch {
      // Una imagen individual que no pueda extraerse
      // no debe tumbar toda la importación.
    }
  }

  return assets;
}

// ---------------------------------------------------------
// Image → product association
// ---------------------------------------------------------

function associateImagesToCandidates(
  assets: DetectedAsset[],
  candidates: ProductCandidate[],
  pages: ExtractedPage[],
): void {
  for (
    const asset of
      assets
  ) {
    const page =
      pages.find(
        (p) =>
          p.pageNumber ===
          asset.source_page,
      );

    if (
      !page ||
      candidates.length ===
        0
    ) {
      continue;
    }

    const pageCandidates =
      candidates.filter(
        (candidate) =>
          candidate.source_page ===
          asset.source_page,
      );

    if (
      pageCandidates.length ===
        1
    ) {
      asset.item_index =
        pageCandidates[0]
          .item_index;

      continue;
    }

    // En esta primera versión,
    // si hay varios productos en una página
    // no hacemos una asociación agresiva.
    //
    // El siguiente paso puede usar las coordenadas
    // exactas de las imágenes y de los bloques
    // de producto.
  }
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

  const warnings: string[] =
    [];

  const pages: ExtractedPage[] =
    [];

  const assets: DetectedAsset[] =
    [];

  const pdfjs =
    await import(
      "npm:pdfjs-dist@4.7.76"
    );

  const loadingTask =
    pdfjs.getDocument({
      data:
        pdfBytes,
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
    totalPages ===
    0
  ) {
    await loadingTask.destroy();

    return {
      pages: [],
      assets: [],
      candidates: [],
      needsOcr:
        false,
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
    i <=
      totalPages;
    i++
  ) {
    const page =
      await doc.getPage(
        i,
      );

    const pageProgress =
      10 +
      Math.floor(
        ((i - 1) /
          totalPages) *
          65,
      );

    await onProgress?.(
      pageProgress,
      `Procesando página ${i} de ${totalPages}`,
    );

    let textContent =
      "";

    let hasText =
      false;

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
          rawItem ===
            null ||
          !(
            "str" in
            rawItem
          )
        ) {
          continue;
        }

        const item =
          rawItem as {
            str:
              string;
            transform?:
              number[];
            width?:
              number;
            height?:
              number;
          };

        const value =
          String(
            item.str ??
              "",
          ).trim();

        if (
          !value
        ) {
          continue;
        }

        const transform =
          Array.isArray(
            item.transform,
          )
            ? item.transform
            : [];

        textItems.push({
          text:
            value,
          x:
            Number(
              transform[4] ??
                0,
            ),
          y:
            Number(
              transform[5] ??
                0,
            ),
          width:
            Number(
              item.width ??
                0,
            ),
          height:
            Number(
              item.height ??
                0,
            ),
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
    78,
    "Extrayendo imágenes reales",
  );

  // PDF.js requiere acceso al objeto de página
  // para recuperar los recursos gráficos.
  //
  // Las páginas anteriores fueron limpiadas, por lo que
  // volvemos a abrirlas específicamente para extracción.
  for (
    let i = 1;
    i <=
      totalPages;
    i++
  ) {
    try {
      const page =
        await doc.getPage(
          i,
        );

      const pageData =
        pages.find(
          (p) =>
            p.pageNumber ===
            i,
        );

      if (
        pageData
      ) {
        const extracted =
          await extractPageImages(
            page,
            i,
            brandId,
            jobId,
            pageData.text,
            pdfjs,
          );

        assets.push(
          ...extracted,
        );
      }

      page.cleanup();
    } catch {
      warnings.push(
        `No se pudieron extraer las imágenes de la página ${i}.`,
      );
    }
  }

  await loadingTask.destroy();

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

  associateImagesToCandidates(
    assets,
    candidates,
    pages,
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
