begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nexo-cv','nexo-cv',false,5242880,array['application/pdf']) on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf'];
create policy nexo_cv_upload on storage.objects for insert to authenticated with check(bucket_id='nexo-cv' and public.is_admin() and (storage.foldername(storage.objects.name))[1] ~ '^[0-9a-f-]{36}$' and exists(select 1 from public.candidates where id::text=(storage.foldername(storage.objects.name))[1]));
create policy nexo_cv_read on storage.objects for select to authenticated using(bucket_id='nexo-cv' and exists(select 1 from public.candidate_documents d where d.path=name and public.can_candidate(d.candidate_id)));
create policy nexo_cv_delete on storage.objects for delete to authenticated using(bucket_id='nexo-cv' and public.is_admin());
commit;

-- Indexed substring lookup. Supabase supports pg_trgm in its extensions schema.
create extension if not exists pg_trgm with schema extensions;
create index if not exists candidates_lookup_trgm on public.candidates using gin ((name||coalesce(dni,'')||coalesce(cuil,'')||email||phone) extensions.gin_trgm_ops);
create index if not exists searches_title_trgm on public.searches using gin (title extensions.gin_trgm_ops);
create index if not exists clients_name_trgm on public.clients using gin (name extensions.gin_trgm_ops);
