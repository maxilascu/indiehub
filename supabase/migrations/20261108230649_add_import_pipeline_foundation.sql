/*
# Import pipeline foundation (Stage 2)

Adds the data contract between IndieHub Web/Supabase and the future local
processor. This migration does not create, change or delete any product,
brand or product image. The processor never writes to products, brands or
product_images; only the backend functions below write import staging data.

## 1. Changes to public.import_jobs (compatible, no data removed)
- Existing columns, rows and legacy status values are preserved
  (pending, parsing, extracted, reviewing, published, failed).
- status accepts the new values: queued, claimed, processing, needs_review,
  approved, applying, completed, cancelled.
- source_type accepts the new values: xlsx, xls, zip, website, api.
  Legacy values (excel, sheets, pdf, csv, image) are kept.
- New columns: processor_version, attempt_count, progress (0-100), stage,
  locked_at, locked_by, started_at, completed_at, metadata (object).
- Existing error_message is reused for failure text.
- Admins can read import_jobs. Processor-role users can read it too, so the
  storage policies can verify that a job is active.

## 2. New tables
- import_items: candidate products detected inside an import. Staging only.
- import_assets: files detected or derived during an import (source file,
  crops, images). Staging only.
- Both tables have RLS enabled, no write privileges for anon or
  authenticated, and SELECT for admins only.

## 3. Functions (SECURITY DEFINER, search_path = public, EXECUTE for authenticated only)
Admin (requires role admin):
- admin_create_import_job: creates a job and computes the namespaced storage path.
- admin_confirm_import_upload: moves a pending job to queued once the file exists in storage.
Processor (requires role processor):
- processor_claim_import_job: claims one job with a lease. Two workers cannot claim the same job.
- processor_update_import_progress: heartbeat, progress, stage.
- processor_submit_import_results: writes items and assets for a claimed job.
- processor_finish_import_job: completes, marks needs_review, or fails a claimed job.

## 4. Storage
- New private bucket indiehub-imports, with originals/ and derived/ folders.
- Admin can upload originals only to the exact path of a pending job, with no overwrite.
- Processor can read originals and derived files, and write derived files only
  under a claimed job's path.
- indiehub-product-images is not modified.

## 5. Audit
- Reuses public.audit_log with action 'import' and entity types import_job.

## 6. Important notes
1. The processor identity is a Supabase user holding the 'processor' role in
   user_roles. No service_role key is required by the processor.
2. A claimed or processing job whose heartbeat is older than 10 minutes can be
   reclaimed. After 3 attempts it is no longer reclaimed automatically.
3. Submitting results is idempotent per (job, item_index). Items already
   approved, rejected, or applied are never overwritten.
4. Processor-supplied product links must belong to the same brand as the job.
*/

-- 1. import_jobs: expand CHECK constraints (legacy values kept)
ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_status_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'pending','parsing','extracted','reviewing','published','failed',
    'queued','claimed','processing','needs_review','approved','applying','completed','cancelled'
  ]::text[]));

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_source_type_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'pdf','excel','csv','sheets','image','xlsx','xls','zip','website','api'
  ]::text[]));

-- 2. import_jobs: new columns
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS processor_version text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_progress_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_progress_check
  CHECK (progress BETWEEN 0 AND 100);

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_attempt_count_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_attempt_count_check
  CHECK (attempt_count >= 0);

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_metadata_object_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_metadata_object_check
  CHECK (jsonb_typeof(metadata) = 'object');

CREATE INDEX IF NOT EXISTS import_jobs_status_created_idx ON public.import_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS import_jobs_brand_idx ON public.import_jobs (brand_id);

-- 3. import_items
CREATE TABLE IF NOT EXISTS public.import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  item_index integer NOT NULL CHECK (item_index >= 0),
  external_id text NOT NULL DEFAULT '',
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_data) = 'object'),
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(normalized_data) = 'object'),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate','needs_review','approved','rejected','applied','failed')),
  matched_product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  proposed_action text NOT NULL DEFAULT 'create'
    CHECK (proposed_action IN ('create','update','ignore')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  processor_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_items_job_index_key UNIQUE (import_job_id, item_index)
);

CREATE INDEX IF NOT EXISTS import_items_matched_product_idx ON public.import_items (matched_product_id);

DROP TRIGGER IF EXISTS import_items_set_updated_at ON public.import_items;
CREATE TRIGGER import_items_set_updated_at
  BEFORE UPDATE ON public.import_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. import_assets
CREATE TABLE IF NOT EXISTS public.import_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  import_item_id uuid REFERENCES public.import_items(id) ON DELETE SET NULL,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  asset_type text NOT NULL
    CHECK (asset_type IN ('source','image','crop','logo','decorative','unknown')),
  original_filename text NOT NULL DEFAULT '',
  storage_path text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT '',
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  page_number integer CHECK (page_number IS NULL OR page_number >= 1),
  region jsonb CHECK (region IS NULL OR jsonb_typeof(region) = 'object'),
  sha256 text NOT NULL DEFAULT '' CHECK (sha256 = '' OR sha256 ~ '^[a-f0-9]{64}$'),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  processing_status text NOT NULL DEFAULT 'detected'
    CHECK (processing_status IN ('detected','extracted','associated','approved','rejected','failed')),
  processor_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS import_assets_job_path_key
  ON public.import_assets (import_job_id, storage_path) WHERE storage_path <> '';
CREATE INDEX IF NOT EXISTS import_assets_item_idx ON public.import_assets (import_item_id);

-- 5. RLS and grants for staging tables and import_jobs
ALTER TABLE public.import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_assets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.import_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.import_assets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_items TO authenticated;
GRANT SELECT ON public.import_assets TO authenticated;
GRANT SELECT ON public.import_jobs TO authenticated;

DROP POLICY IF EXISTS "admin_select_import_items" ON public.import_items;
CREATE POLICY "admin_select_import_items" ON public.import_items FOR SELECT
  TO authenticated USING (public.has_app_role('admin'));

DROP POLICY IF EXISTS "admin_select_import_assets" ON public.import_assets;
CREATE POLICY "admin_select_import_assets" ON public.import_assets FOR SELECT
  TO authenticated USING (public.has_app_role('admin'));

DROP POLICY IF EXISTS "admin_or_processor_select_import_jobs" ON public.import_jobs;
CREATE POLICY "admin_or_processor_select_import_jobs" ON public.import_jobs FOR SELECT
  TO authenticated USING (public.has_app_role('admin') OR public.has_app_role('processor'));

-- 6. Admin functions
CREATE OR REPLACE FUNCTION public.admin_create_import_job(
  p_brand_id uuid,
  p_source_type text,
  p_source_name text,
  p_source_url text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_file_name text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL,
  p_mime_type text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job_id uuid := gen_random_uuid();
  v_name text;
  v_url text;
  v_clean_name text := NULL;
  v_ext text;
  v_storage_path text := '';
  v_status text;
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  IF v_actor IS NULL OR NOT public.has_app_role('admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_brand_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.brands WHERE id = p_brand_id) THEN
    RAISE EXCEPTION 'Marca inválida';
  END IF;

  IF p_source_type NOT IN ('pdf','xlsx','xls','csv','image','zip','website','api') THEN
    RAISE EXCEPTION 'Tipo de fuente inválido';
  END IF;

  v_name := btrim(COALESCE(p_source_name, ''));
  IF v_name = '' OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'Nombre de fuente inválido';
  END IF;

  v_url := btrim(COALESCE(p_source_url, ''));
  IF length(v_url) > 2000 THEN
    RAISE EXCEPTION 'La URL es demasiado larga';
  END IF;
  IF p_source_type = 'website' AND v_url !~* '^https?://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'La URL de la fuente no es válida';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' OR length(v_metadata::text) > 16384 THEN
    RAISE EXCEPTION 'Metadata inválida';
  END IF;

  IF p_source_type NOT IN ('website','api') AND p_file_name IS NULL THEN
    RAISE EXCEPTION 'Falta el archivo de la fuente';
  END IF;

  IF p_file_name IS NOT NULL THEN
    v_clean_name := left(
      regexp_replace(
        regexp_replace(btrim(p_file_name), '^.*[/\\]', ''),
        '[^A-Za-z0-9._-]', '_', 'g'
      ),
      120
    );
    v_ext := lower(substring(v_clean_name FROM '\.([A-Za-z0-9]+)$'));
    IF v_clean_name = '' OR v_ext IS NULL
       OR v_ext NOT IN ('pdf','xlsx','xls','csv','jpg','jpeg','png','webp','zip') THEN
      RAISE EXCEPTION 'Formato de archivo no permitido';
    END IF;
    IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > 52428800 THEN
      RAISE EXCEPTION 'El archivo supera el tamaño permitido (50 MB)';
    END IF;
    v_storage_path := 'originals/' || p_brand_id::text || '/' || v_job_id::text || '/' || v_clean_name;
    v_status := 'pending';
    v_metadata := v_metadata || jsonb_build_object(
      'file',
      jsonb_build_object('name', v_clean_name, 'mime_type', COALESCE(p_mime_type, ''), 'size', p_file_size)
    );
  ELSE
    v_status := 'queued';
  END IF;

  INSERT INTO public.import_jobs (
    id, brand_id, source_type, source_name, source_url, storage_path, status, stage, metadata
  ) VALUES (
    v_job_id, p_brand_id, p_source_type, v_name, v_url, v_storage_path, v_status,
    CASE WHEN v_status = 'queued' THEN 'En cola' ELSE 'Esperando archivo' END, v_metadata
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (
    v_actor, 'import', 'import_job', v_job_id, NULL,
    jsonb_build_object('brand_id', p_brand_id, 'source_type', p_source_type, 'source_name', v_name, 'status', v_status),
    jsonb_build_object('event', 'create_import_job')
  );

  RETURN jsonb_build_object('job_id', v_job_id, 'storage_path', v_storage_path, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_import_upload(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.import_jobs%ROWTYPE;
  v_object_meta jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_app_role('admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job FROM public.import_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importación no encontrada';
  END IF;
  IF v_job.status <> 'pending' OR v_job.storage_path = '' THEN
    RAISE EXCEPTION 'La importación no está esperando un archivo';
  END IF;

  SELECT o.metadata INTO v_object_meta
  FROM storage.objects o
  WHERE o.bucket_id = 'indiehub-imports' AND o.name = v_job.storage_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El archivo todavía no fue recibido';
  END IF;

  INSERT INTO public.import_assets (
    import_job_id, brand_id, asset_type, original_filename, storage_path, mime_type, file_size, metadata
  ) VALUES (
    v_job.id, v_job.brand_id, 'source', COALESCE(v_job.metadata #>> '{file,name}', ''),
    v_job.storage_path, COALESCE(v_object_meta ->> 'mimetype', ''),
    NULLIF(v_object_meta ->> 'size', '')::bigint, '{}'::jsonb
  )
  ON CONFLICT (import_job_id, storage_path) WHERE storage_path <> '' DO NOTHING;

  UPDATE public.import_jobs
  SET status = 'queued', stage = 'En cola'
  WHERE id = v_job.id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (
    v_actor, 'import', 'import_job', v_job.id,
    jsonb_build_object('status', v_job.status),
    jsonb_build_object('status', 'queued'),
    jsonb_build_object('event', 'confirm_upload')
  );

  RETURN jsonb_build_object('job_id', v_job.id, 'status', 'queued');
END;
$$;

-- 7. Processor functions
CREATE OR REPLACE FUNCTION public.processor_claim_import_job(
  p_worker_id text,
  p_processor_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.import_jobs%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_app_role('processor') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_worker_id IS NULL OR btrim(p_worker_id) = '' OR length(p_worker_id) > 100 THEN
    RAISE EXCEPTION 'Identificador de procesador inválido';
  END IF;
  IF p_processor_version IS NULL OR btrim(p_processor_version) = '' OR length(p_processor_version) > 50 THEN
    RAISE EXCEPTION 'Versión de procesador inválida';
  END IF;

  SELECT * INTO v_job
  FROM public.import_jobs
  WHERE status = 'queued'
     OR (status IN ('claimed','processing')
         AND locked_at < now() - interval '10 minutes'
         AND attempt_count < 3)
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.import_jobs
  SET status = 'claimed',
      locked_by = p_worker_id,
      locked_at = now(),
      started_at = COALESCE(started_at, now()),
      attempt_count = attempt_count + 1,
      processor_version = p_processor_version,
      progress = 0,
      stage = 'Reclamada',
      error_message = ''
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (
    v_actor, 'import', 'import_job', v_job.id, NULL,
    jsonb_build_object('status', 'claimed', 'attempt_count', v_job.attempt_count),
    jsonb_build_object('event', 'claim', 'worker_id', p_worker_id, 'processor_version', p_processor_version)
  );

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'brand_id', v_job.brand_id,
    'source_type', v_job.source_type,
    'source_name', v_job.source_name,
    'source_url', v_job.source_url,
    'storage_path', v_job.storage_path,
    'metadata', v_job.metadata,
    'attempt_count', v_job.attempt_count,
    'processor_version', v_job.processor_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.processor_update_import_progress(
  p_job_id uuid,
  p_worker_id text,
  p_progress integer,
  p_stage text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_app_role('processor') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_progress IS NULL OR p_progress < 0 OR p_progress > 100 THEN
    RAISE EXCEPTION 'Progreso inválido';
  END IF;
  IF length(COALESCE(p_stage, '')) > 100 THEN
    RAISE EXCEPTION 'Etapa inválida';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Metadata inválida';
  END IF;

  UPDATE public.import_jobs
  SET status = 'processing',
      progress = p_progress,
      stage = COALESCE(p_stage, ''),
      locked_at = now(),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
  WHERE id = p_job_id
    AND locked_by = p_worker_id
    AND status IN ('claimed','processing');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La importación no está reclamada por este procesador';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.processor_submit_import_results(
  p_job_id uuid,
  p_worker_id text,
  p_items jsonb,
  p_assets jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.import_jobs%ROWTYPE;
  v_item jsonb;
  v_asset jsonb;
  v_matched uuid;
  v_item_id uuid;
  v_path_prefix text;
  v_items_count integer := 0;
  v_assets_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_app_role('processor') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job FROM public.import_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.locked_by IS DISTINCT FROM p_worker_id OR v_job.status NOT IN ('claimed','processing') THEN
    RAISE EXCEPTION 'La importación no está reclamada por este procesador';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 5000 THEN
    RAISE EXCEPTION 'Lista de items inválida';
  END IF;
  IF jsonb_typeof(COALESCE(p_assets, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_assets, '[]'::jsonb)) > 5000 THEN
    RAISE EXCEPTION 'Lista de assets inválida';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Item inválido';
    END IF;
    IF COALESCE(v_item ->> 'item_index', '') !~ '^[0-9]{1,9}$' THEN
      RAISE EXCEPTION 'Índice de item inválido';
    END IF;
    IF jsonb_typeof(COALESCE(v_item -> 'raw_data', '{}'::jsonb)) <> 'object'
       OR jsonb_typeof(COALESCE(v_item -> 'normalized_data', '{}'::jsonb)) <> 'object'
       OR jsonb_typeof(COALESCE(v_item -> 'validation_errors', '[]'::jsonb)) <> 'array'
       OR jsonb_typeof(COALESCE(v_item -> 'warnings', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'Estructura de item inválida';
    END IF;
    IF COALESCE(v_item ->> 'confidence', '') <> ''
       AND (NOT (v_item ->> 'confidence') ~ '^[0-9]+(\.[0-9]+)?$' OR (v_item ->> 'confidence')::numeric > 1) THEN
      RAISE EXCEPTION 'Confianza inválida';
    END IF;

    v_matched := NULLIF(v_item ->> 'matched_product_id', '')::uuid;
    IF v_matched IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products WHERE id = v_matched AND brand_id = v_job.brand_id
    ) THEN
      RAISE EXCEPTION 'Producto asociado inválido para esta marca';
    END IF;

    INSERT INTO public.import_items (
      import_job_id, brand_id, item_index, external_id, raw_data, normalized_data, confidence,
      status, matched_product_id, proposed_action, validation_errors, warnings, processor_version
    ) VALUES (
      v_job.id,
      v_job.brand_id,
      (v_item ->> 'item_index')::integer,
      left(COALESCE(v_item ->> 'external_id', ''), 200),
      COALESCE(v_item -> 'raw_data', '{}'::jsonb),
      COALESCE(v_item -> 'normalized_data', '{}'::jsonb),
      NULLIF(v_item ->> 'confidence', '')::numeric,
      CASE WHEN jsonb_array_length(COALESCE(v_item -> 'validation_errors', '[]'::jsonb)) > 0
           THEN 'needs_review' ELSE 'candidate' END,
      v_matched,
      COALESCE(v_item ->> 'proposed_action', 'create'),
      COALESCE(v_item -> 'validation_errors', '[]'::jsonb),
      COALESCE(v_item -> 'warnings', '[]'::jsonb),
      v_job.processor_version
    )
    ON CONFLICT (import_job_id, item_index) DO UPDATE SET
      external_id = EXCLUDED.external_id,
      raw_data = EXCLUDED.raw_data,
      normalized_data = EXCLUDED.normalized_data,
      confidence = EXCLUDED.confidence,
      status = EXCLUDED.status,
      matched_product_id = EXCLUDED.matched_product_id,
      proposed_action = EXCLUDED.proposed_action,
      validation_errors = EXCLUDED.validation_errors,
      warnings = EXCLUDED.warnings,
      processor_version = EXCLUDED.processor_version
    WHERE public.import_items.status IN ('candidate','needs_review','failed');

    v_items_count := v_items_count + 1;
  END LOOP;

  v_path_prefix := 'derived/' || v_job.brand_id::text || '/' || v_job.id::text || '/';

  FOR v_asset IN SELECT value FROM jsonb_array_elements(COALESCE(p_assets, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_asset) <> 'object' THEN
      RAISE EXCEPTION 'Asset inválido';
    END IF;
    IF left(COALESCE(v_asset ->> 'storage_path', ''), length(v_path_prefix)) <> v_path_prefix
       OR position('..' IN v_asset ->> 'storage_path') > 0 THEN
      RAISE EXCEPTION 'Ruta de asset inválida';
    END IF;
    IF jsonb_typeof(COALESCE(v_asset -> 'metadata', '{}'::jsonb)) <> 'object'
       OR (v_asset -> 'region' IS NOT NULL AND jsonb_typeof(v_asset -> 'region') <> 'object') THEN
      RAISE EXCEPTION 'Estructura de asset inválida';
    END IF;

    v_item_id := NULL;
    IF COALESCE(v_asset ->> 'item_index', '') ~ '^[0-9]{1,9}$' THEN
      SELECT id INTO v_item_id FROM public.import_items
      WHERE import_job_id = v_job.id AND item_index = (v_asset ->> 'item_index')::integer;
    END IF;

    INSERT INTO public.import_assets (
      import_job_id, import_item_id, brand_id, asset_type, original_filename, storage_path, mime_type,
      file_size, page_number, region, sha256, width, height, processing_status, processor_version, metadata
    ) VALUES (
      v_job.id,
      v_item_id,
      v_job.brand_id,
      COALESCE(v_asset ->> 'asset_type', 'unknown'),
      left(COALESCE(v_asset ->> 'original_filename', ''), 255),
      v_asset ->> 'storage_path',
      left(COALESCE(v_asset ->> 'mime_type', ''), 100),
      NULLIF(v_asset ->> 'file_size', '')::bigint,
      NULLIF(v_asset ->> 'page_number', '')::integer,
      v_asset -> 'region',
      COALESCE(v_asset ->> 'sha256', ''),
      NULLIF(v_asset ->> 'width', '')::integer,
      NULLIF(v_asset ->> 'height', '')::integer,
      COALESCE(v_asset ->> 'processing_status', 'detected'),
      v_job.processor_version,
      COALESCE(v_asset -> 'metadata', '{}'::jsonb)
    )
    ON CONFLICT (import_job_id, storage_path) WHERE storage_path <> '' DO UPDATE SET
      import_item_id = EXCLUDED.import_item_id,
      asset_type = EXCLUDED.asset_type,
      original_filename = EXCLUDED.original_filename,
      mime_type = EXCLUDED.mime_type,
      file_size = EXCLUDED.file_size,
      page_number = EXCLUDED.page_number,
      region = EXCLUDED.region,
      sha256 = EXCLUDED.sha256,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      processing_status = EXCLUDED.processing_status,
      processor_version = EXCLUDED.processor_version,
      metadata = EXCLUDED.metadata
    WHERE public.import_assets.processing_status IN ('detected','extracted','failed');

    v_assets_count := v_assets_count + 1;
  END LOOP;

  UPDATE public.import_jobs
  SET stage = 'Resultados recibidos', locked_at = now()
  WHERE id = v_job.id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (
    auth.uid(), 'import', 'import_job', v_job.id, NULL,
    jsonb_build_object('items_received', v_items_count, 'assets_received', v_assets_count),
    jsonb_build_object('event', 'submit_results', 'worker_id', p_worker_id, 'processor_version', v_job.processor_version)
  );

  RETURN jsonb_build_object('items', v_items_count, 'assets', v_assets_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.processor_finish_import_job(
  p_job_id uuid,
  p_worker_id text,
  p_outcome text,
  p_error text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.import_jobs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_app_role('processor') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('completed','needs_review','failed') THEN
    RAISE EXCEPTION 'Resultado de importación inválido';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Metadata inválida';
  END IF;

  SELECT * INTO v_job FROM public.import_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.locked_by IS DISTINCT FROM p_worker_id OR v_job.status NOT IN ('claimed','processing') THEN
    RAISE EXCEPTION 'La importación no está reclamada por este procesador';
  END IF;

  UPDATE public.import_jobs
  SET status = p_outcome,
      progress = CASE WHEN p_outcome = 'failed' THEN progress ELSE 100 END,
      stage = CASE p_outcome
                WHEN 'completed' THEN 'Completada'
                WHEN 'needs_review' THEN 'Revisión pendiente'
                ELSE 'Fallida'
              END,
      error_message = CASE WHEN p_outcome = 'failed' THEN left(COALESCE(p_error, ''), 2000) ELSE '' END,
      locked_at = NULL,
      completed_at = now(),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
  WHERE id = v_job.id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (
    auth.uid(), 'import', 'import_job', v_job.id,
    jsonb_build_object('status', v_job.status),
    jsonb_build_object('status', p_outcome),
    jsonb_build_object('event', 'finish', 'worker_id', p_worker_id, 'processor_version', v_job.processor_version)
  );
END;
$$;

-- 8. Function privileges: authenticated only, never anon or PUBLIC
REVOKE EXECUTE ON FUNCTION public.admin_create_import_job(uuid, text, text, text, jsonb, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_import_job(uuid, text, text, text, jsonb, text, bigint, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_confirm_import_upload(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_import_upload(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.processor_claim_import_job(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.processor_claim_import_job(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.processor_update_import_progress(uuid, text, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.processor_update_import_progress(uuid, text, integer, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.processor_submit_import_results(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.processor_submit_import_results(uuid, text, jsonb, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.processor_finish_import_job(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.processor_finish_import_job(uuid, text, text, text, jsonb) TO authenticated;

-- 9. Private import bucket (originals and derived files)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'indiehub-imports', 'indiehub-imports', false, 52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "admin_upload_import_originals" ON storage.objects;
CREATE POLICY "admin_upload_import_originals" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'indiehub-imports'
    AND public.has_app_role('admin')
    AND EXISTS (
      SELECT 1 FROM public.import_jobs j
      WHERE j.storage_path = storage.objects.name AND j.status = 'pending'
    )
  );

DROP POLICY IF EXISTS "pipeline_read_import_files" ON storage.objects;
CREATE POLICY "pipeline_read_import_files" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'indiehub-imports'
    AND (public.has_app_role('admin') OR public.has_app_role('processor'))
  );

DROP POLICY IF EXISTS "processor_upload_import_derived" ON storage.objects;
CREATE POLICY "processor_upload_import_derived" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'indiehub-imports'
    AND public.has_app_role('processor')
    AND name NOT LIKE '%..%'
    AND EXISTS (
      SELECT 1 FROM public.import_jobs j
      WHERE j.status IN ('claimed','processing')
        AND storage.objects.name LIKE 'derived/' || j.brand_id::text || '/' || j.id::text || '/%'
    )
  );
