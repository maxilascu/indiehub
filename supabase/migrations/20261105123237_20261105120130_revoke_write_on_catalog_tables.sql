/*
# Revoke write privileges from anon and authenticated on catalog tables

Supabase auto-grants ALL privileges to anon and authenticated on new tables
in the public schema. The original migration A only added GRANT SELECT, which
did not remove the auto-granted INSERT, UPDATE, DELETE. This migration
explicitly revokes those write privileges so only service_role can write.

1. Changes
- REVOKE INSERT, UPDATE, DELETE on brands FROM anon, authenticated.
- REVOKE INSERT, UPDATE, DELETE on products FROM anon, authenticated.
- REVOKE INSERT, UPDATE, DELETE on import_jobs FROM anon, authenticated.
- REVOKE ALL on import_jobs FROM anon, authenticated, then GRANT nothing
  (import_jobs should not be reachable by the browser at all).

2. Security
- After this migration:
  - brands: anon + authenticated have SELECT only.
  - products: anon + authenticated have SELECT only.
  - import_jobs: anon + authenticated have no privileges.
  - service_role retains full CRUD on all three tables.
*/

REVOKE INSERT, UPDATE, DELETE ON brands FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON products FROM anon, authenticated;
REVOKE ALL ON import_jobs FROM anon, authenticated;
