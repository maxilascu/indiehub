/*
# Allow authenticated users to read all brands (admin selector)

The panel /admin/imagenes loads brands via the Supabase client with the
authenticated user's session. The existing RLS policy "Public can read
published brands" was scoped to TO anon, authenticated with
USING (status = 'published'), which meant authenticated admins could only
see published brands — draft brands were invisible in the selector.

This migration splits the single policy into two:
- anon: SELECT only published brands (preserves current public behavior).
- authenticated: SELECT all brands, including draft (admin needs the full list).

Anonymous users still cannot see draft brands.

1. Security changes
- Drop "Public can read published brands".
- Create "Anon can read published brands" → TO anon, USING (status = 'published').
- Create "Authenticated can read all brands" → TO authenticated, USING (true).
- GRANT SELECT on brands to anon and authenticated is already present; no change.

2. No other objects modified
- products, product_images, policies, storage, edge functions: untouched.
*/

DROP POLICY IF EXISTS "Public can read published brands" ON brands;

CREATE POLICY "Anon can read published brands"
ON brands FOR SELECT
TO anon
USING (status = 'published');

CREATE POLICY "Authenticated can read all brands"
ON brands FOR SELECT
TO authenticated
USING (true);
