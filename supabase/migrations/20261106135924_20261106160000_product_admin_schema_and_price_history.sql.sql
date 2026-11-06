/*
# Product administration: schema, archived status and price history

Prepares the database for the products admin panel without changing any
existing row or column.

1. Changes
- products.status accepts 'archived' in addition to 'draft', 'review' and
  'published'. The constraint is widened, so existing rows remain valid.
- audit_log.action accepts 'archive'. Existing actions are preserved.
- New table public.product_price_history: one row per changed price field
  (product, timestamp, responsible user, field, previous value, new value).
- Authenticated users can read every product, so drafts and archived items
  are visible in the admin panel. Anonymous access is unchanged.

2. Security
- product_price_history has RLS enabled and no INSERT/UPDATE/DELETE grants
  or policies for client roles. Rows are written only by the SECURITY
  DEFINER functions created in the following migration, so history is
  append-only from the browser.
- anon keeps only the existing policy: published products of published brands.

3. Important notes
- No rows are modified, deleted or re-numbered.
- catalog_seq remains a GENERATED ALWAYS identity column managed by the database.
*/

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'published'::text, 'archived'::text]));

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'publish'::text, 'unpublish'::text, 'archive'::text, 'approve'::text, 'reject'::text, 'import'::text]));

CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  price_field text NOT NULL CHECK (price_field = ANY (ARRAY[
    'price'::text, 'currency'::text, 'price_label'::text, 'price_dozen'::text,
    'price_pack'::text, 'units_pack'::text, 'price_single'::text,
    'unit_price_single'::text, 'previous_price'::text, 'codigo_docena'::text,
    'codigo_pack'::text
  ])),
  old_value text,
  new_value text
);

CREATE INDEX IF NOT EXISTS product_price_history_product_idx
  ON public.product_price_history (product_id, changed_at DESC);

ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.product_price_history FROM anon, authenticated;
GRANT SELECT ON public.product_price_history TO authenticated;

DROP POLICY IF EXISTS "Authenticated can read price history" ON public.product_price_history;
CREATE POLICY "Authenticated can read price history"
ON public.product_price_history FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated can read all products" ON public.products;
CREATE POLICY "Authenticated can read all products"
ON public.products FOR SELECT
TO authenticated
USING (true);
