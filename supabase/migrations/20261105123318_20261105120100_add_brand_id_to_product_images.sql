/*
# Link product_images to brands and restrict writes to service_role

1. Modified Tables
- product_images: nueva columna brand_id (uuid, nullable) que referencia brands.id. Los registros actuales quedan con brand_id NULL y sin cambios en storage_path.
- Nuevo índice compuesto (brand_id, article_code).

2. Security
- Se eliminan las tres políticas de escritura de authenticated (INSERT, UPDATE, DELETE). Ninguna política permite escribir a anon ni a authenticated.
- REVOKE ALL a anon y authenticated sobre product_images, y luego se devuelve solo SELECT.
- La lectura pública se mantiene con la misma política.
- service_role conserva SELECT, INSERT, UPDATE y DELETE para que upload-product-images siga cargando y borrando.

3. Notes
- Esta migración no modifica el bucket ni los objetos de storage. Los archivos existentes conservan sus rutas.
- Las nuevas cargas usarán rutas brands/<slug>/ cuando se actualice la función de carga, en una etapa posterior.
- ON DELETE RESTRICT: una marca con fotos no puede borrarse por accidente.
*/

ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS product_images_brand_article_code_idx
  ON product_images (brand_id, article_code);

DROP POLICY IF EXISTS "Authenticated can insert product images" ON product_images;
DROP POLICY IF EXISTS "Authenticated can update product images" ON product_images;
DROP POLICY IF EXISTS "Authenticated can delete product images" ON product_images;

REVOKE ALL ON product_images FROM anon, authenticated;
GRANT SELECT ON product_images TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_images TO service_role;

DROP POLICY IF EXISTS "Public can read product images" ON product_images;
CREATE POLICY "Public can read product images"
ON product_images FOR SELECT
TO anon, authenticated
USING (true);
