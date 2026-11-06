/*
# Product administration: privileged write functions

Adds the server-side functions the products admin panel uses to write data.
Browsers cannot write products, audit or price history directly; every
change goes through one of these functions, which checks the caller.

1. Functions
- admin_save_product(p_product_id, p_data): creates a product (always as
  draft) or updates an existing one. Validates every field server-side,
  rejects duplicate external codes per brand, and writes:
  - audit_log entry ('create' or 'update') with before and after data,
    only when something actually changed;
  - product_price_history rows, one per price field that changed.
  Saving without changes does not modify the row or the audit.
- admin_set_product_status(p_product_id, p_status): changes status between
  draft, published and archived. Records 'publish', 'unpublish', 'archive'
  or 'update' in audit_log. Archiving never deletes data.
- admin_set_image_order(p_brand_id, p_article_code, p_image_ids): reorders
  the images of one article code within one brand. Records the change in
  audit_log. Only images that belong to that brand and article code are
  accepted, and the list must include all of them.
- Two internal helpers (admin_parse_numeric, admin_text_array) used by the
  functions above. They are not callable from the browser.

2. Security
- Every function checks auth.uid() and rejects anonymous callers.
- Every function sets search_path to public.
- EXECUTE is revoked from PUBLIC and anon and granted to authenticated only.
- No table gets new write grants. Products, images and history stay
  unwritable from the data API except through these functions.

3. Notes
- catalog_seq is never set by these functions; the database identity assigns it.
- Image order changes affect the public gallery of every product that uses
  the same article code, because gallery order is per article code.
*/

CREATE OR REPLACE FUNCTION public.admin_parse_numeric(
  p_data jsonb,
  p_key text,
  p_label text,
  p_required boolean,
  p_min numeric,
  p_max numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_raw text := NULLIF(btrim(p_data->>p_key), '');
  v_value numeric;
BEGIN
  IF v_raw IS NULL THEN
    IF p_required THEN
      RAISE EXCEPTION '% es obligatorio', p_label;
    END IF;
    RETURN NULL;
  END IF;

  IF v_raw !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION '% debe ser un importe válido (hasta 2 decimales)', p_label;
  END IF;

  v_value := v_raw::numeric;
  IF v_value < p_min OR v_value > p_max THEN
    RAISE EXCEPTION '% está fuera del rango permitido', p_label;
  END IF;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_text_array(p_data jsonb, p_key text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(d.v ORDER BY d.first_ord), '{}'::text[])
  FROM (
    SELECT s.v, min(s.ord) AS first_ord
    FROM (
      SELECT btrim(e.value) AS v, e.ord
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p_data->p_key) = 'array' THEN p_data->p_key ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(value, ord)
    ) s
    WHERE s.v <> ''
    GROUP BY s.v
  ) d;
$$;

REVOKE ALL ON FUNCTION public.admin_parse_numeric(jsonb, text, text, boolean, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_text_array(jsonb, text) FROM PUBLIC, anon, authenticated;

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

REVOKE ALL ON FUNCTION public.admin_save_product(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_product_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_image_order(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_product(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_image_order(uuid, text, uuid[]) TO authenticated;
