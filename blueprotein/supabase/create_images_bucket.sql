-- Storage bucket for product images, uploaded from the admin dashboard.
-- Run once in the Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- Public site can view images
create policy "images_public_read"
on storage.objects for select
using (bucket_id = 'images');

-- Only allow-listed admins can upload / replace / remove images
create policy "images_admin_insert"
on storage.objects for insert
with check (
  bucket_id = 'images'
  and exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
);

create policy "images_admin_update"
on storage.objects for update
using (
  bucket_id = 'images'
  and exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
);

create policy "images_admin_delete"
on storage.objects for delete
using (
  bucket_id = 'images'
  and exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
);
