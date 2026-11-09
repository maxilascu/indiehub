/*
# Add admin_create_draft_brand RPC

1. Purpose
- Allow an admin to create a new brand in draft status directly from the
  import flow, when the brand does not yet exist in the database.
- The brand stays in 'draft' and is never published automatically.
- The import_job creation flow remains unchanged; this function only
  produces a brand_id that the existing admin_create_import_job RPC uses.

2. New function
- public.admin_create_draft_brand(p_name text) returns jsonb
  - SECURITY DEFINER, search_path = public, language plpgsql
  - Requires an authenticated session with role 'admin' (has_app_role).
  - Trims the name; rejects empty or whitespace-only names.
  - Rejects duplicates case-insensitively (lower(btrim(name))).
  - Generates a slug from the lowercased name, keeping only [a-z0-9]
    and replacing spaces/sequences with single hyphens.
  - If the slug already exists, appends -2, -3, ... until unique.
  - Inserts the brand with status = 'draft' and all defaults.
  - Records an audit_log entry: action 'create', entity_type 'brand',
    after_data = row json, metadata {"source":"import"}.
  - Returns {"id","name","slug","status"}.
  - REVOKE EXECUTE from PUBLIC and anon; GRANT EXECUTE to authenticated.

3. Security
- No changes to table schemas, RLS policies, or existing grants.
- The function runs as owner and inserts into brands and audit_log
  directly, bypassing the lack of direct INSERT grants for authenticated.
- Only authenticated users with the admin role can call it.

4. Notes
- The slug CHECK constraint requires ^[a-z0-9]+(-[a-z0-9]+)*$.
- The generated slug always satisfies this constraint because only
  [a-z0-9] characters and single hyphens are kept.
- If the input has no alphanumeric characters, the function raises an
  error (the slug would be empty and violate the constraint).
*/

CREATE OR REPLACE FUNCTION public.admin_create_draft_brand(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_clean_name text;
  v_base_slug text;
  v_slug text;
  v_suffix int := 2;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_app_role('admin') THEN
    RAISE EXCEPTION 'No tenés permisos de administrador.' USING ERRCODE = '42501';
  END IF;

  v_clean_name := btrim(p_name);
  IF v_clean_name = '' THEN
    RAISE EXCEPTION 'El nombre de la marca no puede estar vacío.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.brands WHERE lower(name) = lower(v_clean_name)) THEN
    RAISE EXCEPTION 'Ya existe una marca con ese nombre.' USING ERRCODE = 'P0001';
  END IF;

  v_base_slug := lower(v_clean_name);
  v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
  v_base_slug := btrim(v_base_slug, '-');
  IF v_base_slug = '' THEN
    RAISE EXCEPTION 'El nombre de la marca debe contener letras o números.' USING ERRCODE = 'P0001';
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.brands WHERE slug = v_slug) LOOP
    v_slug := v_base_slug || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  END LOOP;

  INSERT INTO public.brands (slug, name, status)
  VALUES (v_slug, v_clean_name, 'draft')
  RETURNING to_jsonb(brands) INTO v_result;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (
    v_actor, 'create', 'brand', (v_result->>'id')::uuid,
    NULL, v_result, jsonb_build_object('source', 'import')
  );

  RETURN jsonb_build_object(
    'id', v_result->>'id',
    'name', v_result->>'name',
    'slug', v_result->>'slug',
    'status', v_result->>'status'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_draft_brand(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_draft_brand(text) TO authenticated;
