/*
# Revoke all privileges from anon and authenticated on administrative tables

audit_log, brand_sources and csv_cache still hold full privileges (SELECT,
INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) for anon and
authenticated, auto-granted by Supabase on table creation. None of these
tables have RLS policies, so the only barrier to access is the absence of
policies — which means a future permissive policy would expose them
immediately. This migration removes those grants so only service_role and
postgres retain access.

import_jobs is already correctly restricted and is NOT touched here.

1. Changes
- REVOKE ALL ON audit_log, brand_sources, csv_cache FROM anon, authenticated.

2. Security
- After this migration:
  - audit_log: anon + authenticated have no privileges.
  - brand_sources: anon + authenticated have no privileges.
  - csv_cache: anon + authenticated have no privileges.
  - service_role and postgres retain full privileges on all three tables.
  - import_jobs: unchanged.
*/

REVOKE ALL PRIVILEGES
ON TABLE
    public.audit_log,
    public.brand_sources,
    public.csv_cache
FROM anon, authenticated;
