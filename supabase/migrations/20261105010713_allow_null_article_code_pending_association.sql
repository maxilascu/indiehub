/*
# Allow pending association for product images

## Plain-English summary
Some product images cannot be linked to an article because their filename has no article code (for example ART_SIN_CODIGO_P84.png). Those rows must exist so the image is not lost, but they need an empty article code until someone links them manually.

## Changes
1. Table `product_images`, column `article_code`: no longer required (NOT NULL removed).
   - Rows with a value keep it unchanged.
   - Rows with NULL are the "pending association" images.

## Security
- No changes to RLS, policies or grants.

## Notes
- No data is deleted or modified by this migration.
- Only images with article_code IS NULL count as pending association.
*/

ALTER TABLE product_images ALTER COLUMN article_code DROP NOT NULL;
