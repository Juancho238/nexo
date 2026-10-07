begin;
create or replace function public.audit_change() returns trigger language plpgsql security definer set search_path=public as $$
declare row_id uuid; affected_unit uuid; label text;
begin
 row_id := (to_jsonb(new)->>'id')::uuid;
 if row_id is null then row_id := (to_jsonb(new)->>'user_id')::uuid; end if;
 affected_unit := case when tg_table_name='business_units' then row_id else (to_jsonb(new)->>'unit_id')::uuid end;
 if tg_table_name='applications' then select unit_id into affected_unit from searches where id=new.search_id; end if;
 if tg_table_name='interviews' then select s.unit_id into affected_unit from applications a join searches s on s.id=a.search_id where a.id=new.application_id; end if;
 label := case tg_table_name when 'clients' then 'cliente' when 'legal_entities' then 'razón social' when 'business_units' then 'unidad' when 'profiles' then 'usuario' when 'user_units' then 'asignación de permisos' when 'requests' then 'solicitud' when 'requirements' then 'requerimiento' when 'searches' then 'búsqueda' when 'candidates' then 'candidato' when 'applications' then 'proceso de selección' when 'interviews' then 'entrevista' end;
 insert into activity(actor_id,action,record_id,unit_id) values((select id from profiles where id=auth.uid()),case tg_op when 'INSERT' then 'Creó ' else 'Actualizó ' end||label,row_id,affected_unit);
 return new;
end; $$;

create table public.candidate_accounts(user_id uuid primary key references auth.users(id) on delete cascade,candidate_id uuid not null unique references public.candidates(id),active boolean not null default true,created_at timestamptz not null default now());
create table public.candidate_consents(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),policy_version text not null,created_at timestamptz not null default now());
alter table candidate_accounts enable row level security;alter table candidate_consents enable row level security;
create policy candidate_account_read on candidate_accounts for select to authenticated using(user_id=auth.uid() or is_admin());
create policy candidate_consent_read on candidate_consents for select to authenticated using(user_id=auth.uid() or is_admin());
revoke all on candidate_accounts,candidate_consents from anon,authenticated;
grant select on candidate_accounts,candidate_consents to authenticated;grant all on candidate_accounts,candidate_consents to service_role;
create function public.my_candidate() returns uuid language sql stable security definer set search_path=public as $$select candidate_id from candidate_accounts where user_id=auth.uid() and active$$;
create function public.candidate_portal() returns jsonb language plpgsql security definer set search_path=public as $$declare cid uuid:=my_candidate();result jsonb;begin
 if cid is null then raise exception 'No tenés una invitación activa al portal de candidatos';end if;
 select jsonb_build_object('candidate',jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'phone',c.phone,'location',c.location),
 'processes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'title',s.title,'status',case when a.stage='Ingresado' then 'Ingreso confirmado' when a.stage in ('No seleccionado','Rechazado','Cancelado','Desistió','No se presentó') then 'Proceso finalizado' else 'En evaluación' end)) from applications a join searches s on s.id=a.search_id where a.candidate_id=cid),'[]'),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'filename',d.filename,'path',d.path,'created_at',d.created_at)) from candidate_documents d where d.candidate_id=cid),'[]'),
 'consent',exists(select 1 from candidate_consents where user_id=auth.uid() and policy_version='nexo-portal-v1')) into result from candidates c where c.id=cid;return result;
end;$$;
create function public.update_candidate_contact(p_phone text,p_location text,p_consent boolean) returns void language plpgsql security definer set search_path=public as $$declare cid uuid:=my_candidate();begin
 if cid is null then raise exception 'Acceso denegado';end if;
 if not p_consent then raise exception 'Confirmá que los datos son tuyos y autorizás su actualización';end if;
 if length(p_phone)>50 or length(p_location)>200 then raise exception 'Los campos superan el límite permitido';end if;
 update candidates set phone=trim(p_phone),location=trim(p_location) where id=cid;
 insert into candidate_consents(user_id,policy_version) values(auth.uid(),'nexo-portal-v1');
end;$$;
-- Candidate access is limited to document metadata through candidate_portal and its own stored objects.
create function public.owns_cv(p_path text) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from candidate_documents where path=p_path and candidate_id=my_candidate())$$;
create policy nexo_cv_candidate_read on storage.objects for select to authenticated using(bucket_id='nexo-cv' and public.owns_cv(name));
revoke all on function my_candidate(),candidate_portal(),update_candidate_contact(text,text,boolean),owns_cv(text) from public,anon;
grant execute on function my_candidate(),candidate_portal(),update_candidate_contact(text,text,boolean),owns_cv(text) to authenticated;
commit;
