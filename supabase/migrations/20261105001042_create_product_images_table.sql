/*
# Create product_images table

1. New Tables
- `product_images`
  - `id` (uuid, primary key)
  - `article_code` (text, not null) — código de artículo extraído del nombre del archivo (ej. ART_17_P35, ART_205_P06_C1). Conserva códigos decimales.
  - `original_filename` (text, not null) — nombre original del archivo (ej. ART_17_P35.png)
  - `storage_path` (text, not null) — ruta dentro del bucket (ej. ART_17_P35.png)
  - `page_number` (integer) — número de página extraído del nombre (ej. 35 de P35)
  - `column_number` (integer) — número de columna extraído del nombre (ej. 1 de C1)
  - `display_order` (integer, default 0) — orden de visualización para múltiples fotos de un mismo artículo
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `product_images`.
- Grant SELECT to `anon` and `authenticated` — cualquier visitante puede ver qué imágenes existen.
- Grant INSERT, UPDATE, DELETE to `authenticated` only — los visitantes anónimos no pueden modificar registros.
- Policies:
  - SELECT: público (anon + authenticated) — las imágenes son públicas.
  - INSERT/UPDATE/DELETE: solo authenticated (la función de servidor con service_role bypassa RLS).
- `service_role` tiene acceso total vía grant implícito del sistema, usado por la edge function.

3. Notes
- No se modifica `csv_cache` ni ninguna tabla existente.
- No se crea relación por ID de fila de Google Sheets — la asociación es por `article_code`.
- Un artículo puede tener múltiples fotografías (varias filas con mismo `article_code`).
- Unique constraint en `storage_path` para evitar duplicados al reanudar cargas.
- Index en `article_code` para buscar todas las fotos de un artículo rápidamente.
*/

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_code text NOT NULL,
  original_filename text NOT NULL,
  storage_path text NOT NULL,
  page_number integer,
  column_number integer,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_images_storage_path_key
  ON product_images (storage_path);

CREATE INDEX IF NOT EXISTS product_images_article_code_idx
  ON product_images (article_code);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON product_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON product_images TO authenticated;

DROP POLICY IF EXISTS "Public can read product images" ON product_images;
CREATE POLICY "Public can read product images"
ON product_images FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated can insert product images" ON product_images;
CREATE POLICY "Authenticated can insert product images"
ON product_images FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update product images" ON product_images;
CREATE POLICY "Authenticated can update product images"
ON product_images FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete product images" ON product_images;
CREATE POLICY "Authenticated can delete product images"
ON product_images FOR DELETE
TO authenticated
USING (true);
