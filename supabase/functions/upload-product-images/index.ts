import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET_ID = "indiehub-product-images";
const TABLE = "product_images";
const BRANDS_TABLE = "brands";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UploadResult {
  filename: string;
  articleCode: string | null;
  storagePath: string;
  pageNumber: number | null;
  columnNumber: number | null;
  status: "uploaded" | "skipped" | "error";
  error?: string;
  publicUrl?: string;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function parseArticleCode(filename: string): {
  articleCode: string | null;
  pageNumber: number | null;
  columnNumber: number | null;
} {
  const base = baseName(filename).replace(/\.[^.]+$/, "");
  const code = base.match(/^(ART_\d+(?:\.\d+)?)/i);
  const page = base.match(/_P(\d+)/i);
  const column = base.match(/_C(\d+)/i);
  return {
    articleCode: code ? code[1].toUpperCase() : null,
    pageNumber: page ? parseInt(page[1], 10) : null,
    columnNumber: column ? parseInt(column[1], 10) : null,
  };
}

function sanitizeFilename(filename: string): string | null {
  const base = baseName(filename);
  if (!base || base.includes("..") || base.includes("\0")) return null;
  if (!/^[\w.\- ]+\.png$/i.test(base)) return null;
  return base;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") as string;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  // --- Authentication: validate the user's JWT ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "No autorizado: falta el token de sesión" }, 401);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return jsonResponse({ error: "No autorizado: token vacío" }, 401);
  }

  // Use the anon key to validate the user's token against Supabase Auth
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return jsonResponse({ error: "No autorizado: sesión inválida o expirada" }, 401);
  }

  // --- Authorization ---
  // Currently any authenticated user can upload. When admin roles are implemented,
  // check userData.user.app_metadata.role === 'admin' here.
  // Do NOT use user_metadata (user-editable) for authorization.

  // --- Parse multipart form ---
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "No se pudo leer el formulario multipart" }, 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return jsonResponse({ error: "No se encontró ningún archivo en la petición" }, 400);
  }

  const brandIdRaw = formData.get("brand_id");
  const brandId = typeof brandIdRaw === "string" ? brandIdRaw.trim() : null;

  if (!brandId || !UUID_RE.test(brandId)) {
    return jsonResponse({ error: "Falta un brand_id válido (formato UUID)" }, 400);
  }

  // --- File validation ---
  const safeName = sanitizeFilename(file.name);
  if (!safeName) {
    return jsonResponse({ error: "Nombre de archivo inválido" }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return jsonResponse({ error: `El archivo excede el tamaño máximo de ${MAX_FILE_SIZE / 1024 / 1024} MB` }, 400);
  }

  const contentType = (file.type || "image/png").toLowerCase();
  if (contentType !== "image/png") {
    return jsonResponse({ error: `Tipo de contenido inválido: ${file.type}. Debe ser image/png.` }, 400);
  }

  const result: UploadResult = {
    filename: safeName,
    articleCode: null,
    storagePath: "",
    pageNumber: null,
    columnNumber: null,
    status: "error",
  };

  try {
    const { articleCode, pageNumber, columnNumber } = parseArticleCode(safeName);
    result.articleCode = articleCode;
    result.pageNumber = pageNumber;
    result.columnNumber = columnNumber;
    result.storagePath = safeName;

    // --- Service-role client: only created after authentication ---
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify the brand exists
    const { data: brandRow, error: brandError } = await supabase
      .from(BRANDS_TABLE)
      .select("id")
      .eq("id", brandId)
      .maybeSingle();

    if (brandError || !brandRow) {
      result.error = "La marca especificada no existe";
      return jsonResponse({ result });
    }

    // Check for duplicates
    const { data: existing } = await supabase
      .from(TABLE)
      .select("id, storage_path")
      .eq("storage_path", safeName)
      .eq("brand_id", brandId)
      .maybeSingle();

    if (existing) {
      result.status = "skipped";
      const { data: pub } = supabase.storage.from(BUCKET_ID).getPublicUrl(safeName);
      result.publicUrl = pub.publicUrl;
      return jsonResponse({ result });
    }

    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_ID)
      .upload(safeName, fileBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      result.error = `Error al subir al bucket: ${uploadError.message}`;
      return jsonResponse({ result });
    }

    let displayOrder = 0;
    if (articleCode) {
      const { count, error: countError } = await supabase
        .from(TABLE)
        .select("id", { count: "exact", head: true })
        .eq("article_code", articleCode)
        .eq("brand_id", brandId);

      if (countError) {
        const { error: rmError } = await supabase.storage.from(BUCKET_ID).remove([safeName]);
        result.error = `Error al contar imágenes existentes: ${countError.message}${rmError ? ` (cleanup: ${rmError.message})` : ""}`;
        return jsonResponse({ result });
      }
      displayOrder = count ?? 0;
    }

    const { error: dbError } = await supabase.from(TABLE).insert({
      article_code: articleCode,
      original_filename: safeName,
      storage_path: safeName,
      page_number: pageNumber,
      column_number: columnNumber,
      display_order: displayOrder,
      brand_id: brandId,
    });

    if (dbError) {
      const { error: rmError } = await supabase.storage.from(BUCKET_ID).remove([safeName]);
      if (rmError) {
        result.error = `Error en base de datos: ${dbError.message}; no se pudo eliminar el archivo del bucket: ${rmError.message}`;
      } else {
        result.error = `Error en base de datos (archivo eliminado del bucket): ${dbError.message}`;
      }
      return jsonResponse({ result });
    }

    result.status = "uploaded";
    const { data: pub } = supabase.storage.from(BUCKET_ID).getPublicUrl(safeName);
    result.publicUrl = pub.publicUrl;
    return jsonResponse({ result });
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Error desconocido en el servidor";
    return jsonResponse({ result });
  }
});
