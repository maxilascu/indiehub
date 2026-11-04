/*
# Create indiehub-product-images storage bucket

1. Storage Bucket
- `indiehub-product-images` — public bucket for product photographs.
- Public read access so any visitor (signed in or not) can view images.
- No public upload, update, or delete.

2. Security (Storage policies)
- SELECT (read) granted to `anon` and `authenticated` — anyone can view images.
- INSERT/UPDATE/DELETE restricted to `authenticated` owners only — visitors
  (anon) cannot upload, modify, or remove files.
- `service_role` retains full access for server-side operations (edge functions).
- No changes to `csv_cache` or any existing table.

3. Notes
- Bucket is created with `public = true` so public URLs serve without auth.
- Object ownership is tracked via the per-file `owner` metadata in storage.objects
  (Supabase Storage sets `owner` to the uploading user's id automatically).
*/

insert into storage.buckets (id, name, public)
values ('indiehub-product-images', 'indiehub-product-images', true)
on conflict (id) do nothing;

-- Public read: anyone (anon + authenticated) can view files.
drop policy if exists "Public read access for indiehub product images" on storage.objects;
create policy "Public read access for indiehub product images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'indiehub-product-images');

-- Authenticated users can upload (write) only into this bucket.
drop policy if exists "Authenticated uploads for indiehub product images" on storage.objects;
create policy "Authenticated uploads for indiehub product images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'indiehub-product-images');

-- Authenticated owners can update their own files.
drop policy if exists "Owners can update indiehub product images" on storage.objects;
create policy "Owners can update indiehub product images"
on storage.objects for update
to authenticated
using (bucket_id = 'indiehub-product-images' and owner = auth.uid())
with check (bucket_id = 'indiehub-product-images' and owner = auth.uid());

-- Authenticated owners can delete their own files.
drop policy if exists "Owners can delete indiehub product images" on storage.objects;
create policy "Owners can delete indiehub product images"
on storage.objects for delete
to authenticated
using (bucket_id = 'indiehub-product-images' and owner = auth.uid());
