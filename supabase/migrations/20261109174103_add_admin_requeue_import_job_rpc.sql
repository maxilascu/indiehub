/*
# Add admin_requeue_import_job RPC

Allows an admin to re-queue a previously processed import job for reprocessing.
Resets the job to 'queued', clears progress/stage/lock/processor fields, and
deletes previous import_items and derived import_assets so new results don't
mix with old ones. The source asset (asset_type='source') is preserved.

Security:
- Requires admin role via has_app_role('admin').
- SECURITY DEFINER, search_path = public.
- Only allowed from states: needs_review, failed, completed.
- Does not touch products, brands, RLS, or the edge function.
*/

CREATE OR REPLACE FUNCTION public.admin_requeue_import_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.import_jobs%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_app_role('admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job FROM public.import_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importación no encontrada';
  END IF;

  IF v_job.status NOT IN ('needs_review','failed','completed') THEN
    RAISE EXCEPTION 'Solo se pueden reprocesar importaciones en revisión, fallidas o completadas';
  END IF;

  -- Delete previous candidate items (staging only, never applied to products).
  DELETE FROM public.import_items WHERE import_job_id = v_job.id;

  -- Delete derived assets; keep the source asset.
  DELETE FROM public.import_assets
  WHERE import_job_id = v_job.id AND asset_type <> 'source';

  -- Reset job to queued for reprocessing.
  UPDATE public.import_jobs
  SET status = 'queued',
      stage = 'En cola',
      progress = 0,
      error_message = '',
      processor_version = NULL,
      locked_by = NULL,
      locked_at = NULL,
      started_at = NULL,
      completed_at = NULL,
      metadata = metadata || jsonb_build_object('reprocessed_at', now()::text)
  WHERE id = v_job.id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (
    v_actor, 'import', 'import_job', v_job.id,
    jsonb_build_object('status', v_job.status),
    jsonb_build_object('status', 'queued'),
    jsonb_build_object('event', 'requeue')
  );

  RETURN jsonb_build_object('job_id', v_job.id, 'status', 'queued');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_requeue_import_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_requeue_import_job(uuid) TO authenticated;
