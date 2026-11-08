/*
# App roles and admin function authorization

## Summary
Adds a minimal role system for IndieHub. Currently the three admin
functions (admin_save_product, admin_set_product_status,
admin_set_image_order) only check that a session exists (auth.uid() IS
NOT NULL). Any authenticated user can call them. This migration
introduces a user_roles table, a role-check helper function, assigns
the initial admin, and gates the three admin functions behind a real
admin-role check.

## 1. New table: user_roles
- id          uuid PK DEFAULT gen_random_uuid()
- user_id     uuid NOT NULL references auth.users(id) ON DELETE CASCADE
- role        text NOT NULL, CHECK (role IN ('admin','processor'))
- created_at  timestamptz NOT NULL DEFAULT now()
- updated_at  timestamptz NOT NULL DEFAULT now()
- UNIQUE(user_id, role)

## 2. Security on user_roles
- RLS enabled.
- No direct INSERT/UPDATE/DELETE granted to authenticated or anon.
- authenticated can SELECT only their own rows (so the frontend can
  display the current user's role if needed).
- admin role management will go through a SECURITY DEFINER function in
  a future migration; for now no writable path exists from the browser.

## 3. Helper functions (SECURITY DEFINER)
- public.has_app_role(required_role text) RETURNS boolean
  Returns true when the caller (auth.uid()) has the requested role.
  Returns false when there is no session or the role is not found.
  SECURITY DEFINER so it can read user_roles regardless of RLS.
  search_path = public.
- public.current_app_role() RETURNS text
  Returns the caller's role or NULL.
  SECURITY DEFINER, search_path = public.
  EXECUTE granted to authenticated only.

## 4. Initial admin assignment
- user_id = 4deeda3d-d95e-4a98-89f4-0f78584ef158, role = 'admin'
- INSERT ... ON CONFLICT DO NOTHING (idempotent).

## 5. Admin function authorization
- admin_save_product, admin_set_product_status, admin_set_image_order:
  after the existing auth.uid() NULL check, add:
    IF NOT public.has_app_role('admin') THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  All existing validations and behaviour are preserved exactly.
  SECURITY DEFINER and search_path = public are preserved.
  EXECUTE stays granted to authenticated only (revoked from anon).

## Compatibility
- Does not alter any existing table structure.
- Does not change RLS on existing tables.
- Does not affect the public catalog (which reads products directly,
  not through these functions).
- Does not modify storage, import system, or price history.
- The audit_log continues to be written exactly as before by the
  admin functions.
*/

-- ============================================================
-- 1. user_roles table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('admin', 'processor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- authenticated can read only their own role(s)
GRANT SELECT ON public.user_roles TO authenticated;

DROP POLICY IF EXISTS "select_own_role" ON public.user_roles;
CREATE POLICY "select_own_role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. Role-check helper functions (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_app_role(required_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = required_role
  );
$$;

REVOKE ALL ON FUNCTION public.has_app_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_app_role(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;

-- ============================================================
-- 3. Initial admin assignment (idempotent)
-- ============================================================

INSERT INTO public.user_roles (user_id, role)
VALUES ('4deeda3d-d95e-4a98-89f4-0f78584ef158', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================================
-- 4. Secure admin_save_product
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_save_product(p_product_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old products%ROWTYPE;
  v_target products%ROWTYPE;
  v_result products%ROWTYPE;
  v_external_id text;
  v_codes text[];
  v_sizes text[];
  v_code text;
  v_units numeric;
  v_field text;
  v_price_fields text[] := ARRAY[
    'price', 'currency', 'price_label', 'price_dozen', 'price_pack', 'units_pack',
    'price_single', 'unit_price_single', 'previous_price', 'codigo_docena', 'codigo_pack'
  ];
  v_old_value text;
  v_new_value text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_app_role('admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Datos del producto inválidos';
  END IF;

  IF coalesce(p_data->>'brand_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Seleccioná una marca válida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brands WHERE id = (p_data->>'brand_id')::uuid) THEN
    RAISE EXCEPTION 'La marca seleccionada no existe';
  END IF;

  v_external_id := btrim(coalesce(p_data->>'external_id', ''));
  IF length(v_external_id) > 80 THEN
    RAISE EXCEPTION 'El código externo no puede superar 80 caracteres';
  END IF;

  IF p_product_id IS NULL THEN
    v_target.status := 'draft';
  ELSE
    SELECT * INTO v_old FROM products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto no existe';
    END IF;
    v_target := v_old;
  END IF;

  v_target.brand_id := (p_data->>'brand_id')::uuid;
  v_target.external_id := v_external_id;
  v_target.name := btrim(coalesce(p_data->>'name', ''));
  IF v_target.name = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;
  IF length(v_target.name) > 200 THEN
    RAISE EXCEPTION 'El nombre no puede superar 200 caracteres';
  END IF;

  v_target.price := public.admin_parse_numeric(p_data, 'price', 'El precio principal', true, 0, 999999999.99);
  v_target.price_dozen := public.admin_parse_numeric(p_data, 'price_dozen', 'El precio por docena', false, 0, 999999999.99);
  v_target.price_pack := public.admin_parse_numeric(p_data, 'price_pack', 'El precio por pack', false, 0, 999999999.99);
  v_target.price_single := public.admin_parse_numeric(p_data, 'price_single', 'El precio unitario', false, 0, 999999999.99);
  v_target.previous_price := public.admin_parse_numeric(p_data, 'previous_price', 'El precio anterior', false, 0, 999999999.99);

  v_units := public.admin_parse_numeric(p_data, 'units_pack', 'La cantidad por pack', false, 1, 100000);
  IF v_units IS NOT NULL AND v_units <> trunc(v_units) THEN
    RAISE EXCEPTION 'La cantidad por pack debe ser un número entero';
  END IF;
  v_target.units_pack := v_units::integer;

  v_target.currency := CASE WHEN btrim(coalesce(p_data->>'currency', '')) = '' THEN 'ARS' ELSE upper(btrim(p_data->>'currency')) END;
  IF v_target.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'La moneda debe tener tres letras (por ejemplo ARS)';
  END IF;

  v_target.price_label := btrim(coalesce(p_data->>'price_label', ''));
  v_target.unit_price_single := btrim(coalesce(p_data->>'unit_price_single', ''));
  v_target.codigo_docena := btrim(coalesce(p_data->>'codigo_docena', ''));
  v_target.codigo_pack := btrim(coalesce(p_data->>'codigo_pack', ''));
  v_target.gender := coalesce(nullif(btrim(p_data->>'gender'), ''), 'Unisex');
  v_target.category := btrim(coalesce(p_data->>'category', ''));
  v_target.style := btrim(coalesce(p_data->>'style', ''));
  v_target.location := btrim(coalesce(p_data->>'location', ''));
  v_target.promotion := btrim(coalesce(p_data->>'promotion', ''));
  v_target.free_shipping := coalesce((p_data->>'free_shipping')::boolean, false);

  v_target.link := btrim(coalesce(p_data->>'link', ''));
  IF length(v_target.link) > 500 THEN
    RAISE EXCEPTION 'El enlace no puede superar 500 caracteres';
  END IF;

  v_target.description := btrim(coalesce(p_data->>'description', ''));
  IF length(v_target.description) > 5000 THEN
    RAISE EXCEPTION 'La descripción no puede superar 5000 caracteres';
  END IF;

  v_codes := public.admin_text_array(p_data, 'image_codes');
  FOREACH v_code IN ARRAY v_codes LOOP
    IF v_code !~ '^ART_[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Código de imagen inválido: %', v_code;
    END IF;
  END LOOP;
  v_target.image_codes := v_codes;

  v_sizes := public.admin_text_array(p_data, 'sizes');
  IF EXISTS (SELECT 1 FROM unnest(v_sizes) s WHERE length(s) > 20) THEN
    RAISE EXCEPTION 'Cada talle no puede superar 20 caracteres';
  END IF;
  v_target.sizes := v_sizes;

  IF v_external_id <> '' AND EXISTS (
    SELECT 1 FROM products p
    WHERE p.brand_id = v_target.brand_id
      AND p.external_id = v_external_id
      AND p.id IS DISTINCT FROM p_product_id
  ) THEN
    RAISE EXCEPTION 'Ya existe un producto con ese código externo en la marca seleccionada';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO products (
      brand_id, external_id, name, price, currency, price_label, price_dozen, price_pack,
      units_pack, price_single, unit_price_single, codigo_docena, codigo_pack, image_codes,
      link, gender, category, style, location, promotion, free_shipping, previous_price,
      description, sizes, status
    ) VALUES (
      v_target.brand_id, v_target.external_id, v_target.name, v_target.price, v_target.currency,
      v_target.price_label, v_target.price_dozen, v_target.price_pack, v_target.units_pack,
      v_target.price_single, v_target.unit_price_single, v_target.codigo_docena, v_target.codigo_pack,
      v_target.image_codes, v_target.link, v_target.gender, v_target.category, v_target.style,
      v_target.location, v_target.promotion, v_target.free_shipping, v_target.previous_price,
      v_target.description, v_target.sizes, 'draft'
    )
    RETURNING * INTO v_result;

    INSERT INTO audit_log (user_id, action, entity_type, entity_id, before_data, after_data)
    VALUES (v_actor, 'create', 'product', v_result.id, NULL, to_jsonb(v_result));

    FOREACH v_field IN ARRAY v_price_fields LOOP
      v_new_value := to_jsonb(v_result) ->> v_field;
      IF v_new_value IS NOT NULL THEN
        INSERT INTO product_price_history (product_id, changed_by, price_field, old_value, new_value)
        VALUES (v_result.id, v_actor, v_field, NULL, v_new_value);
      END IF;
    END LOOP;

    RETURN v_result.id;
  END IF;

  IF (to_jsonb(v_old) - 'updated_at') = (to_jsonb(v_target) - 'updated_at') THEN
    RETURN p_product_id;
  END IF;

  UPDATE products SET
    brand_id = v_target.brand_id,
    external_id = v_target.external_id,
    name = v_target.name,
    price = v_target.price,
    currency = v_target.currency,
    price_label = v_target.price_label,
    price_dozen = v_target.price_dozen,
    price_pack = v_target.price_pack,
    units_pack = v_target.units_pack,
    price_single = v_target.price_single,
    unit_price_single = v_target.unit_price_single,
    codigo_docena = v_target.codigo_docena,
    codigo_pack = v_target.codigo_pack,
    image_codes = v_target.image_codes,
    link = v_target.link,
    gender = v_target.gender,
    category = v_target.category,
    style = v_target.style,
    location = v_target.location,
    promotion = v_target.promotion,
    free_shipping = v_target.free_shipping,
    previous_price = v_target.previous_price,
    description = v_target.description,
    sizes = v_target.sizes
  WHERE id = p_product_id
  RETURNING * INTO v_result;

  INSERT INTO audit_log (user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (v_actor, 'update', 'product', p_product_id, to_jsonb(v_old), to_jsonb(v_result));

  FOREACH v_field IN ARRAY v_price_fields LOOP
    v_old_value := to_jsonb(v_old) ->> v_field;
    v_new_value := to_jsonb(v_result) ->> v_field;
    IF v_old_value IS DISTINCT FROM v_new_value THEN
      INSERT INTO product_price_history (product_id, changed_by, price_field, old_value, new_value)
      VALUES (p_product_id, v_actor, v_field, v_old_value, v_new_value);
    END IF;
  END LOOP;

  RETURN p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_product(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_product(uuid, jsonb) TO authenticated;

-- ============================================================
-- 5. Secure admin_set_product_status
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_set_product_status(p_product_id uuid, p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old products%ROWTYPE;
  v_new products%ROWTYPE;
  v_action text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_app_role('admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('draft', 'published', 'archived') THEN
    RAISE EXCEPTION 'Estado no permitido';
  END IF;

  SELECT * INTO v_old FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no existe';
  END IF;

  IF v_old.status = p_status THEN
    RETURN p_status;
  END IF;

  UPDATE products SET status = p_status WHERE id = p_product_id
  RETURNING * INTO v_new;

  v_action := CASE
    WHEN p_status = 'published' THEN 'publish'
    WHEN p_status = 'archived' THEN 'archive'
    WHEN v_old.status = 'published' THEN 'unpublish'
    ELSE 'update'
  END;

  INSERT INTO audit_log (user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (
    v_actor, v_action, 'product', p_product_id,
    jsonb_build_object('status', v_old.status),
    jsonb_build_object('status', v_new.status),
    jsonb_build_object('from', v_old.status, 'to', v_new.status)
  );

  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_product_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_product_status(uuid, text) TO authenticated;

-- ============================================================
-- 6. Secure admin_set_image_order
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_set_image_order(
  p_brand_id uuid,
  p_article_code text,
  p_image_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_group_size integer;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_app_role('admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_image_ids IS NULL OR cardinality(p_image_ids) = 0 THEN
    RAISE EXCEPTION 'No hay imágenes para ordenar';
  END IF;

  SELECT count(*) INTO v_group_size
  FROM product_images
  WHERE brand_id = p_brand_id AND article_code = p_article_code;

  IF v_group_size <> cardinality(p_image_ids)
    OR (SELECT count(DISTINCT x) FROM unnest(p_image_ids) x) <> cardinality(p_image_ids)
    OR EXISTS (
      SELECT 1 FROM unnest(p_image_ids) x
      WHERE NOT EXISTS (
        SELECT 1 FROM product_images pi
        WHERE pi.id = x AND pi.brand_id = p_brand_id AND pi.article_code = p_article_code
      )
    )
  THEN
    RAISE EXCEPTION 'La lista de imágenes no coincide con las imágenes del código';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'display_order', display_order) ORDER BY display_order, id)
  INTO v_before
  FROM product_images
  WHERE brand_id = p_brand_id AND article_code = p_article_code;

  UPDATE product_images pi
  SET display_order = s.ord - 1
  FROM unnest(p_image_ids) WITH ORDINALITY AS s(id, ord)
  WHERE pi.id = s.id;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'display_order', display_order) ORDER BY display_order, id)
  INTO v_after
  FROM product_images
  WHERE brand_id = p_brand_id AND article_code = p_article_code;

  INSERT INTO audit_log (user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (
    v_actor, 'update', 'product_image', NULL, v_before, v_after,
    jsonb_build_object('brand_id', p_brand_id, 'article_code', p_article_code)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_image_order(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_image_order(uuid, text, uuid[]) TO authenticated;
