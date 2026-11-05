/*
# Harden product_images grants — remove anon write access

1. Security Changes
- Revoke INSERT, UPDATE, DELETE from `anon` on `product_images`.
- Keep SELECT on `anon` (public read) and all CRUD on `authenticated`.
- This ensures anonymous visitors cannot create, modify, or delete image records
  through the Data API — only the server-side edge function (service_role, which
  bypasses RLS) and authenticated users can write.

2. Notes
- No changes to policies (they already scope writes to `authenticated`).
- No changes to `csv_cache` or any other table.
*/

REVOKE INSERT, UPDATE, DELETE ON product_images FROM anon;
