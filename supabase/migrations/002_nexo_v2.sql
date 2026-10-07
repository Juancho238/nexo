-- NEXO 0.2: additive migration after 001. Existing data is preserved.
begin;
create table public.candidate_documents(id uuid primary key default gen_random_uuid(),candidate_id uuid not null references candidates(id),path text not null unique,filename text not null,mime text not null check(mime='application/pdf'),size_bytes integer not null check(size_bytes between 1 and 5242880),created_by uuid not null references profiles(id),created_at timestamptz not null default now());
create table public.appointments(id uuid primary key default gen_random_uuid(),application_id uuid not null references applications(id),starts_at timestamptz not null,ends_at timestamptz not null,interviewer text not null,location text not null default '',notes text not null default '',status text not null default 'Programada' check(status in ('Programada','Realizada','Cancelada')),created_by uuid not null references profiles(id),check(ends_at>starts_at));
create table public.manager_feedback(id uuid primary key default gen_random_uuid(),application_id uuid not null references applications(id),actor_id uuid not null references profiles(id),recommendation text not null check(recommendation in ('Aprobar','Rechazar','Solicitar entrevista')),note text not null check(length(trim(note))>0),created_at timestamptz not null default now());
create table public.read_audit(id uuid primary key default gen_random_uuid(),actor_id uuid not null references profiles(id),resource text not null,record_id uuid,created_at timestamptz not null default now());
create table public.retention_settings(id boolean primary key default true check(id),candidate_days integer not null default 730 check(candidate_days>=30),audit_days integer not null default 365 check(audit_days>=30),updated_at timestamptz not null default now());
insert into retention_settings(id) values(true);
create index on candidate_documents(candidate_id);create index on appointments(starts_at,application_id);create index on manager_feedback(application_id,created_at desc);create index on read_audit(created_at);
alter table candidate_documents enable row level security;alter table appointments enable row level security;alter table manager_feedback enable row level security;alter table read_audit enable row level security;alter table retention_settings enable row level security;
create function public.can_candidate(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$select is_admin() or exists(select 1 from applications where candidate_id=p_id and can_search(search_id));$$;
create policy doc_read on candidate_documents for select to authenticated using(can_candidate(candidate_id));
create policy doc_write on candidate_documents for insert to authenticated with check(is_admin() and created_by=auth.uid() and path like candidate_id::text||'/%');
create policy doc_delete on candidate_documents for delete to authenticated using(is_admin());
create policy appointment_read on appointments for select to authenticated using(can_application(application_id));
create policy appointment_write on appointments for insert to authenticated with check(is_admin() and created_by=auth.uid());
create policy appointment_update on appointments for update to authenticated using(is_admin()) with check(is_admin());
create policy feedback_read on manager_feedback for select to authenticated using(can_application(application_id));
create policy feedback_write on manager_feedback for insert to authenticated with check(actor_id=auth.uid() and can_application(application_id) and my_role() in ('super_admin','gerente','admin_cliente') and exists(select 1 from applications where id=application_id and stage in ('Presentado a gerencia','Entrevista gerencial')));
create policy audit_read on read_audit for select to authenticated using(is_admin());
create policy retention_read on retention_settings for select to authenticated using(is_admin());
create policy retention_write on retention_settings for update to authenticated using(is_admin()) with check(is_admin());
revoke all on candidate_documents,appointments,manager_feedback,read_audit,retention_settings from anon,authenticated;
grant select on candidate_documents,appointments,manager_feedback,read_audit,retention_settings to authenticated;
grant insert on candidate_documents,appointments,manager_feedback to authenticated;
grant delete on candidate_documents to authenticated;
grant update(status) on appointments to authenticated;grant update(candidate_days,audit_days,updated_at) on retention_settings to authenticated;
grant all on candidate_documents,appointments,manager_feedback,read_audit,retention_settings to service_role;
create function public.record_read(p_resource text,p_id uuid default null) returns void language plpgsql security definer set search_path=public as $$begin
 if my_role() is null then raise exception 'Acceso denegado';end if;
 if p_id is not null and not can_candidate(p_id) then raise exception 'Acceso denegado';end if;
 if p_resource not in ('workspace','candidate','report','cv') then raise exception 'Recurso inválido';end if;
 insert into read_audit(actor_id,resource,record_id) values(auth.uid(),p_resource,p_id);
end;$$;
create function public.edit_client(p_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path=public as $$begin
 if not is_admin() then raise exception 'Acceso denegado';end if;
 if nullif(trim(p_values->>'name'),'') is null then raise exception 'Nombre obligatorio';end if;
 update clients set name=trim(p_values->>'name'),contact=coalesce(p_values->>'contact',''),email=coalesce(p_values->>'email',''),phone=coalesce(p_values->>'phone',''),status=coalesce(p_values->>'status','Activo'),notes=coalesce(p_values->>'notes','') where id=p_id;
 if not found then raise exception 'Cliente inexistente';end if;
end;$$;
create function public.edit_candidate(p_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path=public as $$begin
 if not is_admin() then raise exception 'Acceso denegado';end if;
 if nullif(trim(p_values->>'name'),'') is null then raise exception 'Nombre obligatorio';end if;
 update candidates set name=trim(p_values->>'name'),dni=nullif(regexp_replace(coalesce(p_values->>'dni',''),'[^0-9]','','g'),''),cuil=nullif(regexp_replace(coalesce(p_values->>'cuil',''),'[^0-9]','','g'),''),birth_date=nullif(p_values->>'birth_date','')::date,email=coalesce(p_values->>'email',''),phone=coalesce(p_values->>'phone',''),location=coalesce(p_values->>'location',''),experience=coalesce(p_values->>'experience',''),education=coalesce(p_values->>'education',''),availability=coalesce(p_values->>'availability',''),salary=coalesce(p_values->>'salary',''),notes=coalesce(p_values->>'notes','') where id=p_id;
 if not found then raise exception 'Candidato inexistente';end if;
end;$$;
-- Report aggregates use the caller's RLS. Counts are calculated in SQL, not from a browser page.
create function public.nexo_report(p_filters jsonb default '{}') returns jsonb language plpgsql security invoker set search_path=public as $$declare result jsonb;begin
 if my_role() is null then raise exception 'Acceso denegado';end if;
 perform record_read('report');
 with filtered as (
 select s.*,r.client_id,r.entity_id,r.requester_id from searches s join requirements r on r.id=s.requirement_id
 where (nullif(p_filters->>'client','') is null or r.client_id=(p_filters->>'client')::uuid)
 and (nullif(p_filters->>'entity','') is null or r.entity_id=(p_filters->>'entity')::uuid)
 and (nullif(p_filters->>'unit','') is null or s.unit_id=(p_filters->>'unit')::uuid)
 and (nullif(p_filters->>'manager','') is null or r.requester_id=(p_filters->>'manager')::uuid)
 and (nullif(p_filters->>'title','') is null or s.title ilike '%'||(p_filters->>'title')||'%')
 and (nullif(p_filters->>'status','') is null or s.status=p_filters->>'status')
 and (nullif(p_filters->>'from','') is null or s.created_at>=(p_filters->>'from')::date::timestamp at time zone 'America/Argentina/Buenos_Aires')
 and (nullif(p_filters->>'to','') is null or s.created_at<((p_filters->>'to')::date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
 ), a as(select a.* from applications a join filtered f on f.id=a.search_id), totals as(
 select count(*) as searches,coalesce(sum(vacancies),0) as vacancies,count(*) filter(where status not in ('Cubierta','Cancelada')) as open_searches,
 round(avg(extract(epoch from closed_at-created_at)/86400) filter(where status='Cubierta'),1) as average_days from filtered
 ) select jsonb_build_object('searches',t.searches,'vacancies',t.vacancies,'open_searches',t.open_searches,'average_days',t.average_days,
 'candidates',(select count(distinct candidate_id) from a),'hires',(select count(*) from a where stage='Ingresado'),
 'interviews',(select count(*) from interviews i join a on a.id=i.application_id where i.result='Realizada'),
 'by_client',coalesce((select jsonb_agg(x) from(select c.name,count(*) as searches,sum(f.vacancies) as vacancies,(select count(*) from applications ap join filtered ff on ff.id=ap.search_id where ff.client_id=c.id and ap.stage='Ingresado') as hires from filtered f join clients c on c.id=f.client_id group by c.id,c.name order by c.name)x),'[]')) into result from totals t;
 return result;
end;$$;
create function public.nexo_metrics() returns jsonb language sql stable security invoker set search_path=public as $$select jsonb_build_object(
 'open',(select count(*) from searches where status not in ('Cubierta','Cancelada')),
 'requirements',(select count(*) from requirements where date_trunc('month',created_at at time zone 'America/Argentina/Buenos_Aires')=date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')),
 'active',(select count(distinct candidate_id) from applications where stage not in ('Ingresado','No seleccionado','No se presentó','Desistió','Rechazado','Cancelado')),
 'interviews',(select count(*) from interviews where date_trunc('month',date at time zone 'America/Argentina/Buenos_Aires')=date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')),
 'hires',(select count(distinct application_id) from stage_history where new_stage='Ingresado' and date_trunc('month',created_at at time zone 'America/Argentina/Buenos_Aires')=date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')),
 'pending',(select count(*) from requests where status='Pendiente'),'unread',(select count(*) from notifications where not read),
 'average',(select round(avg(extract(epoch from closed_at-created_at)/86400),1) from searches where status='Cubierta'),
 'current_hires',(select count(*) from applications where stage='Ingresado'),'vacancies',(select coalesce(sum(vacancies),0) from searches),
 'stages',(select coalesce(jsonb_object_agg(stage,n),'{}') from(select stage,count(*) n from applications group by stage)x));$$;
-- Bounded screen payload. Metadata selectors have a separate 200-record bound.
create function public.nexo_workspace(p_screen text default 'Dashboard',p_offset integer default 0,p_query text default '',p_status text default '',p_client uuid default null,p_search uuid default null) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb:='{}';t text;k text;predicate text;rows jsonb;total bigint;ids uuid[];appids uuid[];begin
 if my_role() is null then raise exception 'Acceso denegado';end if;
 if p_offset<0 then raise exception 'Página inválida';end if;
 perform record_read('workspace');
 foreach t in array array['clients','legal_entities','business_units','profiles','user_units'] loop
 k:=case t when 'legal_entities' then 'entities' when 'business_units' then 'units' when 'user_units' then 'assignments' else t end;
 execute format('select coalesce(jsonb_agg(x),''[]'') from(select * from %I order by %I limit 201)x',t,case when t='user_units' then 'user_id' else 'id' end) into rows;
 if jsonb_array_length(rows)>200 then raise exception 'Más de 200 registros de configuración: se necesita ampliar los selectores paginados antes de continuar';end if;
 result:=result||jsonb_build_object(k,rows);
 end loop;
 if p_screen='Candidatos' then
 select count(*) into total from candidates c where (c.name||coalesce(c.dni,'')||coalesce(c.cuil,'')||c.email||c.phone) ilike '%'||p_query||'%' and (p_status='' or exists(select 1 from applications a where a.candidate_id=c.id and a.stage=p_status)) and(p_client is null or exists(select 1 from applications a join searches s on s.id=a.search_id join requirements r on r.id=s.requirement_id where a.candidate_id=c.id and r.client_id=p_client));
 select coalesce(jsonb_agg(x),'[]') into rows from(select c.*,(select count(*) from applications a where a.candidate_id=c.id) as processes_count from candidates c where (c.name||coalesce(c.dni,'')||coalesce(c.cuil,'')||c.email||c.phone) ilike '%'||p_query||'%' and(p_status='' or exists(select 1 from applications a where a.candidate_id=c.id and a.stage=p_status)) and(p_client is null or exists(select 1 from applications a join searches s on s.id=a.search_id join requirements r on r.id=s.requirement_id where a.candidate_id=c.id and r.client_id=p_client)) order by c.name,c.id offset p_offset limit 25)x;
 result:=result||jsonb_build_object('candidates',rows,'total',total);
 elsif p_screen in ('Solicitudes','Requerimientos','Actividad','Usuarios','Clientes','Razones sociales','Unidades') then
 t:=case p_screen when 'Solicitudes' then 'requests' when 'Requerimientos' then 'requirements' when 'Actividad' then 'activity' when 'Usuarios' then 'profiles' when 'Clientes' then 'clients' when 'Razones sociales' then 'legal_entities' else 'business_units' end;
 k:=case t when 'legal_entities' then 'entities' when 'business_units' then 'units' else t end;
 -- Search the displayed JSON text; identifiers and fields remain protected by RLS.
 predicate:='to_jsonb(z)::text ilike $1';
 if t in ('requests','requirements','clients') then predicate:=predicate||' and ($2='''' or status=$2)';end if;
 if t in ('requests','requirements','legal_entities') then predicate:=predicate||' and ($3 is null or client_id=$3)';end if;
 if t='business_units' then predicate:=predicate||' and ($3 is null or entity_id in(select id from legal_entities where client_id=$3))';end if;
 execute format('select count(*) from %I z where %s',t,predicate) into total using '%'||p_query||'%',p_status,p_client;
 execute format('select coalesce(jsonb_agg(x),''[]'') from(select * from %I z where %s order by %s offset $4 limit 25)x',t,predicate,case when t in ('requests','requirements','activity') then 'created_at desc,id' else 'id' end) into rows using '%'||p_query||'%',p_status,p_client,p_offset;
 if t in ('clients','legal_entities','business_units','profiles') then result:=result||jsonb_build_object('page_ids',coalesce((select jsonb_agg(v->>'id') from jsonb_array_elements(rows)v),'[]'),'total',total);else result:=result||jsonb_build_object(k,rows,'total',total);end if;
 end if;
 select array_agg(id) into ids from(select s.id from searches s join requirements r on r.id=s.requirement_id where(p_search is null or s.id=p_search) and(p_screen not in ('Búsquedas','Dashboard') or s.title ilike '%'||p_query||'%') and(p_status='' or p_screen<>'Búsquedas' or s.status=p_status) and(p_client is null or r.client_id=p_client) order by s.created_at desc,s.id offset case when p_screen='Búsquedas' and p_search is null then p_offset else 0 end limit case when p_search is not null then 1 else 25 end)x;
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('interviews_count',(select count(*) from interviews i join applications a on a.id=i.application_id where a.search_id=s.id and i.result='Realizada'),'applications_count',(select count(*) from applications a where a.search_id=s.id))),'[]') into rows from searches s where s.id=any(ids);
 result:=result||jsonb_build_object('searches',rows);
 if p_screen='Búsquedas' and p_search is null then select count(*) into total from searches s join requirements r on r.id=s.requirement_id where s.title ilike '%'||p_query||'%' and(p_status='' or s.status=p_status) and(p_client is null or r.client_id=p_client);result:=result||jsonb_build_object('total',total);end if;
 if p_screen<>'Requerimientos' then select coalesce(jsonb_agg(r),'[]') into rows from requirements r where id in(select requirement_id from searches where id=any(ids));result:=result||jsonb_build_object('requirements',rows);end if;
 select array_agg(id) into appids from(select a.id from applications a where(case when p_screen='Candidatos' then a.candidate_id in(select (v->>'id')::uuid from jsonb_array_elements(result->'candidates')v) else a.search_id=any(ids) end) order by a.created_at,a.id offset case when p_search is not null then p_offset else 0 end limit 100)x;
 select coalesce(jsonb_agg(a),'[]') into rows from applications a where id=any(appids);result:=result||jsonb_build_object('applications',rows);
 if p_screen<>'Candidatos' then select coalesce(jsonb_agg(c),'[]') into rows from candidates c where id in(select candidate_id from applications where id=any(appids));result:=result||jsonb_build_object('candidates',rows);end if;
 if p_search is not null then select count(*) into total from applications where search_id=p_search;result:=result||jsonb_build_object('total',total,'page_size',100);end if;
 foreach t in array array['interviews','stage_history'] loop
 k:=case when t='stage_history' then 'history' else t end;
 execute format('select coalesce(jsonb_agg(x),''[]'') from(select * from %I where application_id=any($1) order by id limit 500)x',t) into rows using appids;
 result:=result||jsonb_build_object(k,rows);
 end loop;
 if p_screen not in ('Solicitudes') then select coalesce(jsonb_agg(x),'[]') into rows from(select * from requests order by created_at desc limit 25)x;result:=result||jsonb_build_object('requests',rows);end if;
 if p_screen<>'Actividad' then select coalesce(jsonb_agg(x),'[]') into rows from(select * from activity order by created_at desc limit 10)x;result:=result||jsonb_build_object('activity',rows);end if;
 select coalesce(jsonb_agg(x),'[]') into rows from(select * from notifications order by created_at desc limit 20)x;result:=result||jsonb_build_object('notifications',rows,'stats',nexo_metrics());
 return result;
end;$$;
-- Full candidate history is still RLS scoped, fetched on demand, not at login.
create function public.nexo_candidate_detail(p_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$declare result jsonb;begin
 if not can_candidate(p_id) then raise exception 'Acceso denegado';end if;perform record_read('candidate',p_id);
 select jsonb_build_object('requirements',coalesce((select jsonb_agg(r) from requirements r where id in(select requirement_id from searches where id in(select search_id from applications where candidate_id=p_id))),'[]'),'candidates',coalesce((select jsonb_agg(c) from candidates c where id=p_id),'[]'),'applications',coalesce((select jsonb_agg(a) from applications a where candidate_id=p_id),'[]'),'searches',coalesce((select jsonb_agg(s) from searches s where id in(select search_id from applications where candidate_id=p_id)),'[]'),'history',coalesce((select jsonb_agg(h) from stage_history h where application_id in(select id from applications where candidate_id=p_id)),'[]'),'interviews',coalesce((select jsonb_agg(i) from interviews i where application_id in(select id from applications where candidate_id=p_id)),'[]')) into result;return result;
end;$$;
create function public.nexo_global_search(p_query text) returns jsonb language sql stable security invoker set search_path=public as $$select jsonb_build_object('candidates',coalesce((select jsonb_agg(x) from(select * from candidates where(name||coalesce(dni,'')||coalesce(cuil,'')||email||phone) ilike '%'||p_query||'%' order by name,id limit 5)x),'[]'),'searches',coalesce((select jsonb_agg(x) from(select * from searches where title ilike '%'||p_query||'%' order by id limit 5)x),'[]'),'clients',coalesce((select jsonb_agg(x) from(select * from clients where name ilike '%'||p_query||'%' order by id limit 3)x),'[]'),'requirements','[]'::jsonb,'users','[]'::jsonb);$$;
create function public.feedback_notification() returns trigger language plpgsql security definer set search_path=public as $$declare p profiles;s searches;begin
 select s0.* into s from searches s0 join applications a on a.search_id=s0.id where a.id=new.application_id;
 for p in select * from profiles where role='super_admin' and active loop insert into notifications(user_id,title,body) values(p.id,'Nuevo feedback gerencial',s.title||': '||new.recommendation);end loop;
 insert into activity(actor_id,action,record_id,unit_id) values(new.actor_id,'Registró feedback gerencial: '||new.recommendation,new.id,s.unit_id);return new;
end;$$;
create trigger feedback_notice after insert on manager_feedback for each row execute function feedback_notification();
revoke all on function can_candidate(uuid),record_read(text,uuid),edit_client(uuid,jsonb),edit_candidate(uuid,jsonb),nexo_report(jsonb),nexo_metrics(),nexo_workspace(text,integer,text,text,uuid,uuid),nexo_candidate_detail(uuid),nexo_global_search(text),feedback_notification() from public,anon;
grant execute on function can_candidate(uuid),record_read(text,uuid),edit_client(uuid,jsonb),edit_candidate(uuid,jsonb),nexo_report(jsonb),nexo_metrics(),nexo_workspace(text,integer,text,text,uuid,uuid),nexo_candidate_detail(uuid),nexo_global_search(text) to authenticated;
-- Storage policies are in 003 (requires Supabase Storage schema).
commit;
