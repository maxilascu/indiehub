/*
# Create brands, products and import_jobs tables

1. New Tables
- brands: marcas con UUID interno y slug único (usado en URLs y en las carpetas de imágenes). El nombre comercial NO es único: dos negocios pueden llamarse igual.
- products: productos con UUID interno, brand_id como clave foránea y external_id con el id original de la planilla. Precios numeric(14,2) con moneda (currency, por defecto ARS). catalog_seq es un contador de inserción usado para ordenar "más recientes".
- import_jobs: trabajos de importación por marca (pdf, excel, csv, sheets, image) con filas extraídas, filas revisadas, estado y error.

2. Security
- RLS enabled on brands, products and import_jobs.
- anon and authenticated: SELECT only.
  - brands: only rows with status published.
  - products: only rows with status published whose brand is also published.
- No INSERT, UPDATE or DELETE grants for anon or authenticated.
- service_role (edge functions only): full CRUD, bypasses RLS.
- import_jobs has no grants and no policies for anon or authenticated.

3. Notes
- updated_at is refreshed by a BEFORE UPDATE trigger on each table.
- csv_cache, products-csv and brands-csv are not modified.
- Foreign keys use ON DELETE RESTRICT.
- Products are unique per brand by external_id when external_id is present.
*/

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  logo_url text NOT NULL DEFAULT '',
  instagram_url text NOT NULL DEFAULT '',
  province text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  has_store boolean NOT NULL DEFAULT false,
  has_shipping boolean NOT NULL DEFAULT false,
  sends_national boolean NOT NULL DEFAULT false,
  shipping_zones text[] NOT NULL DEFAULT '{}',
  lat double precision,
  lng double precision,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_key ON brands (slug);
CREATE INDEX IF NOT EXISTS brands_name_idx ON brands (lower(name));
CREATE INDEX IF NOT EXISTS brands_status_location_idx ON brands (status, province, city);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  external_id text NOT NULL DEFAULT '',
  catalog_seq bigint GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  price numeric(14,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  price_label text NOT NULL DEFAULT '',
  price_dozen numeric(14,2) CHECK (price_dozen >= 0),
  price_pack numeric(14,2) CHECK (price_pack >= 0),
  units_pack integer CHECK (units_pack > 0),
  price_single numeric(14,2) CHECK (price_single >= 0),
  unit_price_single text NOT NULL DEFAULT '',
  codigo_docena text NOT NULL DEFAULT '',
  codigo_pack text NOT NULL DEFAULT '',
  image_codes text[] NOT NULL DEFAULT '{}',
  link text NOT NULL DEFAULT '',
  gender text NOT NULL DEFAULT 'Unisex',
  category text NOT NULL DEFAULT '',
  style text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  promotion text NOT NULL DEFAULT '',
  free_shipping boolean NOT NULL DEFAULT false,
  previous_price numeric(14,2) CHECK (previous_price >= 0),
  description text NOT NULL DEFAULT '',
  sizes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_brand_external_id_key
  ON products (brand_id, external_id)
  WHERE external_id <> '';
CREATE INDEX IF NOT EXISTS products_brand_status_idx ON products (brand_id, status);
CREATE INDEX IF NOT EXISTS products_status_category_idx ON products (status, category);
CREATE INDEX IF NOT EXISTS products_status_seq_idx ON products (status, catalog_seq DESC);

CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  source_type text NOT NULL
    CHECK (source_type IN ('pdf', 'excel', 'csv', 'sheets', 'image')),
  source_name text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  storage_path text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'parsing', 'extracted', 'reviewing', 'published', 'failed')),
  raw_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_jobs_brand_created_idx ON import_jobs (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_status_idx ON import_jobs (status);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON brands TO anon, authenticated;
GRANT SELECT ON products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brands TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON import_jobs TO service_role;

DROP POLICY IF EXISTS "Public can read published brands" ON brands;
CREATE POLICY "Public can read published brands"
ON brands FOR SELECT
TO anon, authenticated
USING (status = 'published');

DROP POLICY IF EXISTS "Public can read published products" ON products;
CREATE POLICY "Public can read published products"
ON products FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  AND EXISTS (
    SELECT 1 FROM brands b
    WHERE b.id = products.brand_id AND b.status = 'published'
  )
);

DROP TRIGGER IF EXISTS brands_set_updated_at ON brands;
CREATE TRIGGER brands_set_updated_at
BEFORE UPDATE ON brands
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS import_jobs_set_updated_at ON import_jobs;
CREATE TRIGGER import_jobs_set_updated_at
BEFORE UPDATE ON import_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
