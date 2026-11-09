import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  PROCESSOR_VERSION,
  processPdf,
  candidatesToItems,
  assetsToRpc,
  type ProcessingResult,
} from "./processor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IMPORT_BUCKET = "indiehub-imports";
const WORKER_ID = "edge-pdf-local-v1";

interface ProcessResponse {
  ok: boolean;
  job_id: string;
  outcome: "completed" | "needs_review" | "failed";
  items: number;
  assets: number;
  needs_ocr: boolean;
  warnings: string[];
  error?: string;
}

function jsonResponse(body: ProcessResponse, status = 200): Response {
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
    return jsonResponse({ ok: false, job_id: "", outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") as string;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ ok: false, job_id: "", outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: "Server misconfiguration" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, job_id: "", outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: "No autorizado: falta el token de sesión" }, 401);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return jsonResponse({ ok: false, job_id: "", outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: "No autorizado: token vacío" }, 401);
  }

  // Validate the user's JWT.
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse({ ok: false, job_id: "", outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: "Sesión inválida o expirada" }, 401);
  }

  // Parse body.
  let body: { job_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, job_id: "", outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: "Cuerpo de la petición inválido" }, 400);
  }

  const jobId = body.job_id?.trim();
  if (!jobId) {
    return jsonResponse({ ok: false, job_id: "", outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: "Falta job_id" }, 400);
  }

  // User client: calls processor RPCs with the user's JWT (has processor role).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Service client: downloads the PDF from the private bucket.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Claim the job via the existing processor RPC.
    const { data: claimData, error: claimError } = await userClient.rpc("processor_claim_import_job", {
      p_worker_id: WORKER_ID,
      p_processor_version: PROCESSOR_VERSION,
    });

    if (claimError) {
      return jsonResponse({ ok: false, job_id: jobId, outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: claimError.message }, 500);
    }

    // claimData is the claimed job or null. We need to verify it matches our job_id.
    const claimed = claimData as { job_id: string; brand_id: string; source_type: string; storage_path: string } | null;
    if (!claimed) {
      return jsonResponse({ ok: false, job_id: jobId, outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: "No hay importaciones en cola para procesar." }, 404);
    }

    // If the claimed job is not the one requested, we still process it (claim is FIFO).
    const actualJobId = claimed.job_id;
    const brandId = claimed.brand_id;
    const storagePath = claimed.storage_path;

    // Only process PDFs in v1.
    if (claimed.source_type !== "pdf") {
      await userClient.rpc("processor_finish_import_job", {
        p_job_id: actualJobId,
        p_worker_id: WORKER_ID,
        p_outcome: "needs_review",
        p_error: "",
        p_metadata: { note: "Tipo de fuente no soportado por pdf-local-v1" },
      });
      return jsonResponse({ ok: true, job_id: actualJobId, outcome: "needs_review", items: 0, assets: 0, needs_ocr: false, warnings: ["Tipo de fuente no soportado por esta versión del procesador."] });
    }

    // 2. Download the PDF from the private bucket.
    const { data: fileData, error: downloadError } = await serviceClient.storage
      .from(IMPORT_BUCKET)
      .download(storagePath);

    if (downloadError || !fileData) {
      await userClient.rpc("processor_finish_import_job", {
        p_job_id: actualJobId,
        p_worker_id: WORKER_ID,
        p_outcome: "failed",
        p_error: `No se pudo descargar el archivo: ${downloadError?.message ?? "desconocido"}`,
        p_metadata: {},
      });
      return jsonResponse({ ok: false, job_id: actualJobId, outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: "No se pudo descargar el archivo original." }, 500);
    }

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());

    // 3. Process the PDF.
    let result: ProcessingResult;
    try {
      result = await processPdf({
        pdfBytes,
        brandId,
        jobId: actualJobId,
        onProgress: async (progress, stage) => {
          await userClient.rpc("processor_update_import_progress", {
            p_job_id: actualJobId,
            p_worker_id: WORKER_ID,
            p_progress: progress,
            p_stage: stage,
            p_metadata: {},
          });
        },
      });
    } catch (procError) {
      const errorMsg = procError instanceof Error ? procError.message : "Error desconocido durante el procesamiento";
      await userClient.rpc("processor_finish_import_job", {
        p_job_id: actualJobId,
        p_worker_id: WORKER_ID,
        p_outcome: "failed",
        p_error: errorMsg,
        p_metadata: {},
      });
      return jsonResponse({ ok: false, job_id: actualJobId, outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: errorMsg }, 500);
    }

    // 4. Submit results.
    const items = candidatesToItems(result.candidates);
    const assets = assetsToRpc(result.assets);

    const { data: submitData, error: submitError } = await userClient.rpc("processor_submit_import_results", {
      p_job_id: actualJobId,
      p_worker_id: WORKER_ID,
      p_items: items,
      p_assets: assets,
    });

    if (submitError) {
      await userClient.rpc("processor_finish_import_job", {
        p_job_id: actualJobId,
        p_worker_id: WORKER_ID,
        p_outcome: "failed",
        p_error: `Error al guardar resultados: ${submitError.message}`,
        p_metadata: {},
      });
      return jsonResponse({ ok: false, job_id: actualJobId, outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: submitError.message }, 500);
    }

    const counts = submitData as { items: number; assets: number } | null;

    // 5. Finish the job.
    const outcome = result.needsOcr ? "needs_review" : result.candidates.length > 0 ? "needs_review" : "completed";
    const finishMetadata = {
      needs_ocr: result.needsOcr,
      pages_processed: result.pages.length,
      pages_with_text: result.pages.filter((p) => p.hasText).length,
      warnings: result.warnings,
    };

    const { error: finishError } = await userClient.rpc("processor_finish_import_job", {
      p_job_id: actualJobId,
      p_worker_id: WORKER_ID,
      p_outcome: outcome,
      p_error: result.needsOcr ? "PDF sin texto extraíble; requiere OCR." : "",
      p_metadata: finishMetadata,
    });

    if (finishError) {
      return jsonResponse({ ok: false, job_id: actualJobId, outcome: "failed", items: counts?.items ?? 0, assets: counts?.assets ?? 0, needs_ocr: result.needsOcr, warnings: result.warnings, error: finishError.message }, 500);
    }

    return jsonResponse({
      ok: true,
      job_id: actualJobId,
      outcome,
      items: counts?.items ?? 0,
      assets: counts?.assets ?? 0,
      needs_ocr: result.needsOcr,
      warnings: result.warnings,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Error desconocido";
    return jsonResponse({ ok: false, job_id: jobId, outcome: "failed", items: 0, assets: 0, needs_ocr: false, warnings: [], error: errorMsg }, 500);
  }
});
