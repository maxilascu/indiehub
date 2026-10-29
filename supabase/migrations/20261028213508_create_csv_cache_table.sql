/*
# Create csv_cache table for Edge Function CSV proxy caching

1. New Tables
- `csv_cache`
  - `cache_key` (text, primary key) — unique identifier for cached data
  - `data` (jsonb) — the parsed product array cached from Google Sheets
  - `fetched_at` (timestamptz) — when the cache row was last refreshed

2. Security
- Enable RLS on `csv_cache`.
- Grant CRUD to `service_role` only (used by the Edge Function with the service role key).
- No `anon`/`authenticated` policies: the frontend never touches this table directly;
  it goes through the Edge Function which uses the service role key and bypasses RLS.

3. Important Notes
- This table is an internal optimization: the Edge Function fetches the published
  Google Sheets CSV, parses it, and caches the result here with a 60-second TTL.
  If the fetch fails, the Edge Function serves the stale cache as a fallback.
- The frontend always calls the Edge Function, never this table.
*/

CREATE TABLE IF NOT EXISTS csv_cache (
  cache_key text PRIMARY KEY,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE csv_cache ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON csv_cache TO service_role;
