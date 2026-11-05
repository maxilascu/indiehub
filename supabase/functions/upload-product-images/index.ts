import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET_ID = "indiehub-product-images";
const TABLE = "product_images";

interface UploadRequest {
  files: {
    name: string;
    contentType: string;
    data: string;
  }[];
}

interface UploadResult {
  filename: string;
  articleCode: string;
  storagePath: string;
  pageNumber: number | null;
  columnNumber: number | null;
  status: "uploaded" | "skipped" | "error";
  error?: string;
  publicUrl?: string;
}

function parseArticleCode(filename: string): {
  articleCode: string;
  pageNumber: number | null;
  columnNumber: number | null;
} {
  const base = filename.replace(/\.[^.]+$/, "");
  const match = base.match(/^(ART_\d+(?:_\d+)?)(?:_P(\d+))?(?:_C(\d+))?$/i);
  if (match) {
    return {
      articleCode: match[1].toUpperCase(),
      pageNumber: match[2] ? parseInt(match[2], 10) : null,
      columnNumber: match[3] ? parseInt(match[3], 10) : null,
    };
  }
  const fallback = base.split(/[_-]/).slice(0, 3).join("_");
  return { articleCode: fallback.toUpperCase(), pageNumber: null, columnNumber: null };
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
  const uploadSecret = Deno.env.get("INDIEHUB_UPLOAD_SECRET") as string;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server misconfiguration" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!uploadSecret) {
    return new Response(
      JSON.stringify({ error: "Upload secret not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const providedSecret = req.headers.get("X-Upload-Secret");
  if (!providedSecret || !timingSafeCompare(providedSecret, uploadSecret)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: UploadRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
    return new Response(
      JSON.stringify({ error: "No files provided" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const results: UploadResult[] = [];

  for (const file of body.files) {
    const result: UploadResult = {
      filename: file.name,
      articleCode: "",
      storagePath: "",
      pageNumber: null,
      columnNumber: null,
      status: "error",
    };

    try {
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith(".png")) {
        result.error = "Solo se permiten archivos PNG";
        results.push(result);
        continue;
      }

      const contentType = (file.contentType || "image/png").toLowerCase();
      if (contentType !== "image/png") {
        result.error = "El tipo de contenido debe ser image/png";
        results.push(result);
        continue;
      }

      const { articleCode, pageNumber, columnNumber } = parseArticleCode(file.name);
      result.articleCode = articleCode;
      result.pageNumber = pageNumber;
      result.columnNumber = columnNumber;
      result.storagePath = file.name;

      const { data: existing } = await supabase
        .from(TABLE)
        .select("id, storage_path")
        .eq("storage_path", file.name)
        .maybeSingle();

      if (existing) {
        result.status = "skipped";
        const { data: pub } = supabase.storage
          .from(BUCKET_ID)
          .getPublicUrl(file.name);
        result.publicUrl = pub.publicUrl;
        results.push(result);
        continue;
      }

      const fileBytes = decodeBase64(file.data);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_ID)
        .upload(file.name, fileBytes, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) {
        result.error = `Storage error: ${uploadError.message}`;
        results.push(result);
        continue;
      }

      const { data: countData } = await supabase
        .from(TABLE)
        .select("id", { count: "exact", head: true })
        .eq("article_code", articleCode);

      const currentCount = (countData as unknown[] | null)?.length ?? 0;

      const { error: dbError } = await supabase.from(TABLE).insert({
        article_code: articleCode,
        original_filename: file.name,
        storage_path: file.name,
        page_number: pageNumber,
        column_number: columnNumber,
        display_order: currentCount,
      });

      if (dbError) {
        const { error: rmError } = await supabase.storage
          .from(BUCKET_ID)
          .remove([file.name]);
        if (rmError) {
          result.error = `DB error: ${dbError.message}; cleanup failed: ${rmError.message}`;
        } else {
          result.error = `DB error (file removed): ${dbError.message}`;
        }
        results.push(result);
        continue;
      }

      result.status = "uploaded";
      const { data: pub } = supabase.storage
        .from(BUCKET_ID)
        .getPublicUrl(file.name);
      result.publicUrl = pub.publicUrl;
      results.push(result);
    } catch (err) {
      result.error = err instanceof Error ? err.message : "Unknown error";
      results.push(result);
    }
  }

  const uploaded = results.filter((r) => r.status === "uploaded").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  return new Response(
    JSON.stringify({
      results,
      summary: { uploaded, skipped, errors, total: results.length },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
