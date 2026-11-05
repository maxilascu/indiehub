/*
# Remove residual non-SELECT privileges from catalog tables

After revoking INSERT, UPDATE, DELETE, the roles anon and authenticated still
held TRUNCATE, TRIGGER and REFERENCES on brands and products (auto-granted by
Supabase on table creation). TRUNCATE can wipe an entire table, so this
migration revokes ALL privileges from anon and authenticated on brands and
products and re-grants SELECT only.

1. Changes
- REVOKE ALL ON brands, products FROM anon, authenticated.
- GRANT SELECT ON brands, products TO anon, authenticated.
- import_jobs already has no privileges for anon or authenticated.
*/

REVOKE ALL ON brands FROM anon, authenticated;
REVOKE ALL ON products FROM anon, authenticated;
GRANT SELECT ON brands TO anon, authenticated;
GRANT SELECT ON products TO anon, authenticated;
