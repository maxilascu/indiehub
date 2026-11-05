/*
# Migrate Intima ALP brand, 76 products, and assign brand_id to product_images

1. Changes
- Insert brand "Intima ALP" with slug "intima-alp" if it does not exist (idempotent via ON CONFLICT on slug).
- Insert 76 products from csv_cache (cache_key = 'products') into the products table, mapping all fields. Uses ON CONFLICT (brand_id, external_id) DO UPDATE so re-running updates rather than duplicating.
- Set brand_id on all 106 product_images rows that currently have brand_id NULL (they all belong to Intima ALP, verified: all 76 products in csv_cache have brand = "Intima ALP").

2. Idempotency
- Brand: INSERT ... ON CONFLICT (slug) DO UPDATE, then SELECT id.
- Products: INSERT ... ON CONFLICT (brand_id, external_id) WHERE external_id <> '' DO UPDATE SET all fields.
- Images: UPDATE ... WHERE brand_id IS NULL (re-running is a no-op once set).

3. Data source
- All data comes from csv_cache table (cache_key = 'products' and cache_key = 'brands'), already populated by the existing edge functions. No external calls.

4. Security
- No changes to RLS, grants, or policies. All inserts use service_role via the migration runner.
- No changes to storage buckets or files. storage_path values in product_images are not modified.
*/

DO $$
DECLARE
  v_brand_id uuid;
  v_brand_data jsonb;
  v_product jsonb;
  v_slug text := 'intima-alp';
  v_shipping_zones text[];
  v_image_codes text[];
  v_sizes text[];
BEGIN
  -- Fetch brand data from cache
  SELECT data->0 INTO v_brand_data
  FROM csv_cache
  WHERE cache_key = 'brands';

  IF v_brand_data IS NULL THEN
    RAISE EXCEPTION 'Brand data not found in csv_cache';
  END IF;

  -- Convert jsonb arrays to text[]
  v_shipping_zones := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_brand_data->'shippingZones')),
    '{}'::text[]
  );

  -- Insert brand if not exists, then get id
  INSERT INTO brands (slug, name, logo_url, instagram_url, province, city, address, description,
                      has_store, has_shipping, sends_national, shipping_zones, lat, lng, status)
  VALUES (
    v_slug,
    v_brand_data->>'name',
    COALESCE(v_brand_data->>'logo', ''),
    COALESCE(v_brand_data->>'instagram', ''),
    COALESCE(v_brand_data->>'province', ''),
    COALESCE(v_brand_data->>'city', ''),
    COALESCE(v_brand_data->>'address', ''),
    COALESCE(v_brand_data->>'description', ''),
    COALESCE((v_brand_data->>'hasStore')::boolean, false),
    COALESCE((v_brand_data->>'hasShipping')::boolean, false),
    COALESCE((v_brand_data->>'sendsNational')::boolean, false),
    v_shipping_zones,
    CASE
      WHEN v_brand_data->>'lat' IS NOT NULL AND v_brand_data->>'lat' <> '' AND v_brand_data->>'lat' <> 'null'
      THEN (v_brand_data->>'lat')::double precision
      ELSE NULL
    END,
    CASE
      WHEN v_brand_data->>'lng' IS NOT NULL AND v_brand_data->>'lng' <> '' AND v_brand_data->>'lng' <> 'null'
      THEN (v_brand_data->>'lng')::double precision
      ELSE NULL
    END,
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    logo_url = EXCLUDED.logo_url,
    instagram_url = EXCLUDED.instagram_url,
    province = EXCLUDED.province,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    description = EXCLUDED.description,
    has_store = EXCLUDED.has_store,
    has_shipping = EXCLUDED.has_shipping,
    sends_national = EXCLUDED.sends_national,
    shipping_zones = EXCLUDED.shipping_zones,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    status = EXCLUDED.status,
    updated_at = now();

  SELECT id INTO v_brand_id FROM brands WHERE slug = v_slug;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Failed to get brand_id for slug %', v_slug;
  END IF;

  -- Insert/update 76 products from cache
  FOR v_product IN
    SELECT jsonb_array_elements(data) FROM csv_cache WHERE cache_key = 'products'
  LOOP
    -- Convert jsonb arrays to text[]
    v_image_codes := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(v_product->'imageCodes')),
      '{}'::text[]
    );
    v_sizes := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(v_product->'sizes')),
      '{}'::text[]
    );

    INSERT INTO products (
      brand_id, external_id, name, price, currency, price_label,
      price_dozen, price_pack, units_pack, price_single, unit_price_single,
      codigo_docena, codigo_pack, image_codes, link, gender, category,
      style, location, promotion, free_shipping, previous_price,
      description, sizes, status
    )
    VALUES (
      v_brand_id,
      COALESCE(v_product->>'id', ''),
      v_product->>'name',
      COALESCE((v_product->>'price')::numeric, 0),
      'ARS',
      COALESCE(v_product->>'priceLabel', ''),
      CASE WHEN v_product->>'priceDozen' IS NOT NULL AND v_product->>'priceDozen' <> 'null'
           THEN (v_product->>'priceDozen')::numeric ELSE NULL END,
      CASE WHEN v_product->>'pricePack' IS NOT NULL AND v_product->>'pricePack' <> 'null'
           THEN (v_product->>'pricePack')::numeric ELSE NULL END,
      CASE WHEN v_product->>'unitsPack' IS NOT NULL AND v_product->>'unitsPack' <> 'null'
           THEN (v_product->>'unitsPack')::integer ELSE NULL END,
      CASE WHEN v_product->>'priceSingle' IS NOT NULL AND v_product->>'priceSingle' <> 'null'
           THEN (v_product->>'priceSingle')::numeric ELSE NULL END,
      COALESCE(v_product->>'unitPriceSingle', ''),
      COALESCE(v_product->>'codigoDocena', ''),
      COALESCE(v_product->>'codigoPack', ''),
      v_image_codes,
      COALESCE(v_product->>'link', ''),
      COALESCE(v_product->>'gender', 'Unisex'),
      COALESCE(v_product->>'category', ''),
      COALESCE(v_product->>'style', ''),
      COALESCE(v_product->>'location', ''),
      COALESCE(v_product->>'promotion', ''),
      COALESCE((v_product->>'freeShipping')::boolean, false),
      CASE WHEN v_product->>'previousPrice' IS NOT NULL AND v_product->>'previousPrice' <> 'null'
           THEN (v_product->>'previousPrice')::numeric ELSE NULL END,
      COALESCE(v_product->>'description', ''),
      v_sizes,
      'published'
    )
    ON CONFLICT (brand_id, external_id) WHERE external_id <> '' DO UPDATE SET
      name = EXCLUDED.name,
      price = EXCLUDED.price,
      price_label = EXCLUDED.price_label,
      price_dozen = EXCLUDED.price_dozen,
      price_pack = EXCLUDED.price_pack,
      units_pack = EXCLUDED.units_pack,
      price_single = EXCLUDED.price_single,
      unit_price_single = EXCLUDED.unit_price_single,
      codigo_docena = EXCLUDED.codigo_docena,
      codigo_pack = EXCLUDED.codigo_pack,
      image_codes = EXCLUDED.image_codes,
      link = EXCLUDED.link,
      gender = EXCLUDED.gender,
      category = EXCLUDED.category,
      style = EXCLUDED.style,
      location = EXCLUDED.location,
      promotion = EXCLUDED.promotion,
      free_shipping = EXCLUDED.free_shipping,
      previous_price = EXCLUDED.previous_price,
      description = EXCLUDED.description,
      sizes = EXCLUDED.sizes,
      status = EXCLUDED.status,
      updated_at = now();
  END LOOP;

  -- Assign brand_id to all product_images with NULL brand_id
  UPDATE product_images
  SET brand_id = v_brand_id
  WHERE brand_id IS NULL;

  RAISE NOTICE 'Migration complete: brand_id = %', v_brand_id;
END;
$$;
