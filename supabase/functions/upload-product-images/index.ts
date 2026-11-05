import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Upload-Secret",
};

const BUCKET_ID = "indiehub-product-images";
const TABLE = "product_images";

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
      JSON.stringify({ error: "Server misconfiguration: missing Supabase env vars" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!uploadSecret) {
    return new Response(
      JSON.stringify({ error: "El secreto INDIEHUB_UPLOAD_SECRET no está configurado. Andá a Supabase Dashboard → Edge Functions → Secrets y agregalo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const providedSecret = req.headers.get("X-Upload-Secret");
  if (!providedSecret || !timingSafeCompare(providedSecret, uploadSecret)) {
    return new Response(
      JSON.stringify({ error: "Clave de administración incorrecta" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(
      JSON.stringify({ error: "No se pudo leer el formulario multipart. Asegurate de enviar multipart/form-data." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return new Response(
      JSON.stringify({ error: "No se encontró ningún archivo en la petición" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const filename = file.name;
  const result: UploadResult = {
    filename,
    articleCode: "",
    storagePath: "",
    pageNumber: null,
    columnNumber: null,
    status: "error",
  };

  try {
    const lowerName = filename.toLowerCase();
    if (!lowerName.endsWith(".png")) {
      result.error = "Solo se permiten archivos PNG";
      return new Response(
        JSON.stringify({ result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = (file.type || "image/png").toLowerCase();
    if (contentType !== "image/png") {
      result.error = `Tipo de contenido inválido: ${file.type}. Debe ser image/png.`;
      return new Response(
        JSON.stringify({ result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { articleCode, pageNumber, columnNumber } = parseArticleCode(filename);
    result.articleCode = articleCode;
    result.pageNumber = pageNumber;
    result.columnNumber = columnNumber;
    result.storagePath = filename;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: existing } = await supabase
      .from(TABLE)
      .select("id, storage_path")
      .eq("storage_path", filename)
      .maybeSingle();

    if (existing) {
      result.status = "skipped";
      const { data: pub } = supabase.storage.from(BUCKET_ID).getPublicUrl(filename);
      result.publicUrl = pub.publicUrl;
      return new Response(
        JSON.stringify({ result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_ID)
      .upload(filename, fileBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      result.error = `Error al subir al bucket: ${uploadError.message}`;
      return new Response(
        JSON.stringify({ result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: countData, error: countError } = await supabase
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("article_code", articleCode);

    if (countError) {
      const { error: rmError } = await supabase.storage.from(BUCKET_ID).remove([filename]);
      result.error = `Error al contar imágenes existentes: ${countError.message}${rmError ? ` (cleanup: ${rmError.message})` : ""}`;
      return new Response(
        JSON.stringify({ result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentCount = (countData as unknown[] | null)?.length ?? 0;

    const { error: dbError } = await supabase.from(TABLE).insert({
      article_code: articleCode,
      original_filename: filename,
      storage_path: filename,
      page_number: pageNumber,
      column_number: columnNumber,
      display_order: currentCount,
    });

    if (dbError) {
      const { error: rmError } = await supabase.storage.from(BUCKET_ID).remove([filename]);
      if (rmError) {
        result.error = `Error en base de datos: ${dbError.message}; no se pudo eliminar el archivo del bucket: ${rmError.message}`;
      } else {
        result.error = `Error en base de datos (archivo eliminado del bucket): ${dbError.message}`;
      }
      return new Response(
        JSON.stringify({ result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    result.status = "uploaded";
    const { data: pub } = supabase.storage.from(BUCKET_ID).getPublicUrl(filename);
    result.publicUrl = pub.publicUrl;
    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Error desconocido en el servidor";
    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
