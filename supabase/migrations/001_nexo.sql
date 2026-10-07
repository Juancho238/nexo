-- NEXO MVP · PostgreSQL / Supabase. Run once on an empty project.
begin;
create table public.clients (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0),
 contact text not null default '', email text not null default '', phone text not null default '',
 status text not null default 'Activo' check(status in ('Activo','Inactivo')), notes text not null default ''
);
create table public.legal_entities (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 name text not null check(length(trim(name))>0), cuit text not null default '', unique(id,client_id)
);
create table public.business_units (
 id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.legal_entities(id),
 name text not null check(length(trim(name))>0), location text not null default '', responsible text not null default '',
 unique(id,entity_id), unique(entity_id,name)
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, name text not null,
 email text not null unique, role text not null check(role in ('super_admin','admin_cliente','gerente','lider')),
 client_id uuid references public.clients(id), active boolean not null default true,
 position text not null default '', phone text not null default '',
 check((role='super_admin' and client_id is null) or (role<>'super_admin' and client_id is not null))
);
create table public.user_units (
 user_id uuid not null references public.profiles(id) on delete cascade,
 unit_id uuid not null references public.business_units(id) on delete cascade, primary key(user_id,unit_id)
);
create table public.requests (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 entity_id uuid not null, unit_id uuid, requester_id uuid not null references public.profiles(id),
 type text not null check(type in ('unidad','usuario','requerimiento')),
 status text not null default 'Pendiente' check(status in ('Pendiente','Invitando','Aprobada','Rechazada')),
 priority text not null default 'Media' check(priority in ('Baja','Media','Alta')), payload jsonb not null,
 created_at timestamptz not null default now(), reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz, reason text,
 foreign key(entity_id,client_id) references public.legal_entities(id,client_id),
 foreign key(unit_id,entity_id) references public.business_units(id,entity_id)
);
create table public.requirements (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 entity_id uuid not null, unit_id uuid not null, requester_id uuid not null references public.profiles(id),
 title text not null, vacancies integer not null check(vacancies>0),
 priority text not null check(priority in ('Baja','Media','Alta')), status text not null default 'Aprobado',
 required_date date not null, details jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(entity_id,client_id) references public.legal_entities(id,client_id),
 foreign key(unit_id,entity_id) references public.business_units(id,entity_id), unique(id,unit_id)
);
create table public.searches (
 id uuid primary key default gen_random_uuid(), requirement_id uuid not null unique,
 unit_id uuid not null, title text not null, vacancies integer not null check(vacancies>0),
 interview_goal integer not null check(interview_goal>0),
 status text not null default 'En búsqueda' check(status in ('En búsqueda','Esperando feedback','Cubierta','Cancelada')),
 created_at timestamptz not null default now(), closed_at timestamptz,
 foreign key(requirement_id,unit_id) references public.requirements(id,unit_id)
);
create table public.candidates (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0),
 dni text unique check(dni is null or dni ~ '^[0-9]{7,8}$'),
 cuil text unique check(cuil is null or cuil ~ '^[0-9]{11}$'), birth_date date check(birth_date<=current_date),
 email text not null default '', phone text not null default '', location text not null default '',
 experience text not null default '', education text not null default '', availability text not null default '',
 salary text not null default '', notes text not null default ''
);
create table public.applications (
 id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id),
 search_id uuid not null references public.searches(id),
 stage text not null default 'Postulado' check(stage in ('Postulado','Contactado','Entrevista selectora','Presentado a gerencia','Entrevista gerencial','Aprobado','Preingreso','Ingresado','No seleccionado','No se presentó','Desistió','Rechazado','Cancelado')),
 created_at timestamptz not null default now(), unique(candidate_id,search_id)
);
create table public.interviews (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id),
 date timestamptz not null, interviewer text not null, type text not null check(type in ('Selectora','Gerencial')),
 result text not null check(result in ('Realizada','Pendiente','No se presentó','Cancelada')),
 strengths text not null default '', weaknesses text not null default '', notes text not null default '',
 recommendation text not null check(recommendation in ('Recomendar','Recomendar con observaciones','No recomendar','Pendiente'))
);
create table public.stage_history (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id),
 actor_id uuid references public.profiles(id), actor_name text, old_stage text, new_stage text not null,
 note text not null default '', created_at timestamptz not null default now()
);
create table public.activity (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id),
 actor_name text, action text not null, record_id uuid not null, unit_id uuid references public.business_units(id),
 created_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, body text not null, read boolean not null default false,
 created_at timestamptz not null default now(), request_id uuid references public.requests(id)
);
-- Emails are queued, not claimed as sent. Integrate a provider/worker later.
create table public.email_outbox (
 id uuid primary key default gen_random_uuid(), recipient text not null, template text not null,
 payload jsonb not null, status text not null default 'queued' check(status in ('queued','sent','failed')),
 attempts integer not null default 0, created_at timestamptz not null default now(), sent_at timestamptz
);
create index on public.legal_entities(client_id);
create index on public.business_units(entity_id);
create index on public.profiles(client_id);
create index on public.user_units(unit_id,user_id);
create index on public.requests(requester_id,status,created_at desc);
create index on public.requests(client_id,status);
create index on public.requests(entity_id);
create index on public.requests(unit_id);
create index on public.requirements(unit_id,created_at desc);
create index on public.requirements(requester_id);
create index on public.searches(unit_id,status);
create index on public.applications(search_id,stage);
create index on public.interviews(application_id,date);
create index on public.stage_history(application_id,created_at desc);
create index on public.activity(unit_id,created_at desc);
create index on public.notifications(user_id,read,created_at desc);
create index on public.email_outbox(status,created_at);

-- SECURITY DEFINER helpers avoid recursive policies; fixed search_path is mandatory.
create function public.is_admin() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid() and role='super_admin' and active); $$;
create function public.my_client() returns uuid language sql stable security definer set search_path=public
as $$ select client_id from profiles where id=auth.uid() and active; $$;
create function public.my_role() returns text language sql stable security definer set search_path=public
as $$ select role from profiles where id=auth.uid() and active; $$;
create function public.can_unit(p_unit uuid) returns boolean language sql stable security definer set search_path=public
as $$ select is_admin() or exists(select 1 from user_units a join profiles p on p.id=a.user_id
 join business_units u on u.id=a.unit_id join legal_entities e on e.id=u.entity_id
 where a.user_id=auth.uid() and a.unit_id=p_unit and p.active and p.client_id=e.client_id); $$;
create function public.can_entity(p_entity uuid) returns boolean language sql stable security definer set search_path=public
as $$ select is_admin() or exists(select 1 from business_units u where u.entity_id=p_entity and can_unit(u.id)); $$;
create function public.can_search(p_search uuid) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from searches where id=p_search and can_unit(unit_id)); $$;
create function public.can_application(p_application uuid) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from applications where id=p_application and can_search(search_id)); $$;

alter table public.clients enable row level security;
alter table public.legal_entities enable row level security;
alter table public.business_units enable row level security;
alter table public.profiles enable row level security;
alter table public.user_units enable row level security;
alter table public.requests enable row level security;
alter table public.requirements enable row level security;
alter table public.searches enable row level security;
alter table public.candidates enable row level security;
alter table public.applications enable row level security;
alter table public.interviews enable row level security;
alter table public.stage_history enable row level security;
alter table public.activity enable row level security;
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security;
create policy clients_read on public.clients for select to authenticated using(is_admin() or id=my_client());
create policy entities_read on public.legal_entities for select to authenticated using(can_entity(id));
create policy entities_insert on public.legal_entities for insert to authenticated with check(is_admin());
create policy units_read on public.business_units for select to authenticated using(can_unit(id));
create policy units_insert on public.business_units for insert to authenticated with check(is_admin());
create policy profiles_read on public.profiles for select to authenticated using(is_admin() or (id=auth.uid() and active));
create policy assignments_read on public.user_units for select to authenticated using(is_admin() or (user_id=auth.uid() and my_role() is not null));
create policy requests_read on public.requests for select to authenticated using(is_admin() or (requester_id=auth.uid() and my_role() is not null));
create policy requirements_read on public.requirements for select to authenticated using(is_admin() or (can_unit(unit_id) and (my_role()='admin_cliente' or requester_id=auth.uid())));
create policy searches_read on public.searches for select to authenticated using(can_unit(unit_id));
create policy candidates_read on public.candidates for select to authenticated using(is_admin() or exists(select 1 from applications a where a.candidate_id=candidates.id and can_search(a.search_id)));
create policy applications_read on public.applications for select to authenticated using(can_search(search_id));
create policy interviews_read on public.interviews for select to authenticated using(can_application(application_id));
create policy interviews_insert on public.interviews for insert to authenticated with check(is_admin());
create policy history_read on public.stage_history for select to authenticated using(can_application(application_id));
create policy activity_read on public.activity for select to authenticated using(is_admin() or (my_role() is not null and (actor_id=auth.uid() or can_unit(unit_id))));
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid() and my_role() is not null);
create policy notifications_update on public.notifications for update to authenticated using(user_id=auth.uid() and my_role() is not null) with check(user_id=auth.uid() and my_role() is not null);
create policy outbox_read on public.email_outbox for select to authenticated using(is_admin());

-- Explicit grants: clients write only through RPCs; audit/history cannot be forged.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.clients,public.legal_entities,public.business_units,public.profiles,public.user_units,public.requests,
 public.requirements,public.searches,public.candidates,public.applications,public.interviews,public.stage_history,
 public.activity,public.notifications,public.email_outbox to authenticated;
grant insert on public.legal_entities,public.business_units,public.interviews to authenticated;
grant update(read) on public.notifications to authenticated;
grant all on all tables in schema public to service_role;

create function public.capture_actor_name() returns trigger language plpgsql security definer set search_path=public as $$
begin
 select name into new.actor_name from profiles where id=new.actor_id;
 return new;
end; $$;
create trigger history_actor before insert on public.stage_history for each row execute function public.capture_actor_name();
create trigger activity_actor before insert on public.activity for each row execute function public.capture_actor_name();

create function public.audit_change() returns trigger language plpgsql security definer set search_path=public as $$
declare row_id uuid; affected_unit uuid; label text;
begin
 row_id := (to_jsonb(new)->>'id')::uuid;
 if row_id is null then row_id := (to_jsonb(new)->>'user_id')::uuid; end if;
 affected_unit := case when tg_table_name='business_units' then row_id else (to_jsonb(new)->>'unit_id')::uuid end;
 if tg_table_name='applications' then select unit_id into affected_unit from searches where id=new.search_id; end if;
 if tg_table_name='interviews' then select s.unit_id into affected_unit from applications a join searches s on s.id=a.search_id where a.id=new.application_id; end if;
 label := case tg_table_name when 'clients' then 'cliente' when 'legal_entities' then 'razón social' when 'business_units' then 'unidad' when 'profiles' then 'usuario' when 'user_units' then 'asignación de permisos' when 'requests' then 'solicitud' when 'requirements' then 'requerimiento' when 'searches' then 'búsqueda' when 'candidates' then 'candidato' when 'applications' then 'proceso de selección' when 'interviews' then 'entrevista' end;
 insert into activity(actor_id,action,record_id,unit_id) values(auth.uid(),case tg_op when 'INSERT' then 'Creó ' else 'Actualizó ' end||label,row_id,affected_unit);
 return new;
end; $$;
do $$ declare t text; begin foreach t in array array['clients','legal_entities','business_units','profiles','user_units','requests','requirements','searches','candidates','applications','interviews'] loop
 execute format('create trigger audit_%I after insert or update on public.%I for each row execute function public.audit_change()',t,t);
end loop; end $$;

create function public.create_client(p_name text,p_entity_name text,p_cuit text,p_contact text,p_email text,p_phone text,p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid; begin
 if not is_admin() then raise exception 'Acceso denegado'; end if;
 insert into clients(name,contact,email,phone,notes) values(trim(p_name),p_contact,p_email,p_phone,p_notes) returning id into c;
 insert into legal_entities(client_id,name,cuit) values(c,trim(p_entity_name),p_cuit);
 return c;
end; $$;

create function public.submit_request(p_type text,p_client_id uuid,p_entity_id uuid,p_unit_id uuid,p_priority text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare r uuid; target profiles; u uuid; begin
 if not is_admin() and my_role() is distinct from 'gerente' then raise exception 'Solo un gerente o la selectora puede solicitar altas'; end if;
 if not is_admin() and (p_client_id is distinct from my_client() or not can_entity(p_entity_id)) then raise exception 'Cliente o razón social sin permiso'; end if;
 if not exists(select 1 from legal_entities where id=p_entity_id and client_id=p_client_id) then raise exception 'La razón social no pertenece al cliente'; end if;
 if p_type not in ('unidad','usuario','requerimiento') then raise exception 'Tipo inválido'; end if;
 if p_type='unidad' and (length(trim(coalesce(p_payload->>'name','')))=0 or length(trim(coalesce(p_payload->>'location','')))=0) then raise exception 'Nombre y ubicación son obligatorios'; end if;
 if p_type in ('usuario','requerimiento') then
 if p_unit_id is null or not can_unit(p_unit_id) or not exists(select 1 from business_units where id=p_unit_id and entity_id=p_entity_id) then raise exception 'Unidad sin permiso o de otra razón social'; end if;
 end if;
 if p_type='usuario' then
 if coalesce(p_payload->>'role','') not in ('admin_cliente','gerente','lider') or coalesce(p_payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(trim(coalesce(p_payload->>'name','')))=0 then raise exception 'Datos de usuario inválidos'; end if;
 if jsonb_typeof(p_payload->'unit_ids') is distinct from 'array' or jsonb_array_length(p_payload->'unit_ids')=0 then raise exception 'Seleccioná al menos una unidad'; end if;
 for u in select value::uuid from jsonb_array_elements_text(p_payload->'unit_ids') loop
 if not can_unit(u) or not exists(select 1 from business_units where id=u and entity_id=p_entity_id) then raise exception 'Unidad solicitada sin permiso'; end if;
 end loop;
 end if;
 if p_type='requerimiento' then
 if length(trim(coalesce(p_payload->>'title','')))=0 or coalesce((p_payload->>'vacancies')::integer,0)<1 or p_payload->>'required_date' is null or length(trim(coalesce(p_payload->'details'->>'description','')))=0 then raise exception 'Completá puesto, vacantes, fecha y descripción'; end if;
 end if;
 insert into requests(client_id,entity_id,unit_id,requester_id,type,priority,payload)
 values(p_client_id,p_entity_id,p_unit_id,auth.uid(),p_type,p_priority,p_payload) returning id into r;
 for target in select * from profiles where role='super_admin' and active loop
 insert into notifications(user_id,title,body,request_id) values(target.id,'Nueva solicitud de '||p_type,coalesce(p_payload->>'name',p_payload->>'title'),r);
 insert into email_outbox(recipient,template,payload) values(target.email,'new_request',jsonb_build_object('request_id',r,'type',p_type,'requester_id',auth.uid(),'client_id',p_client_id,'entity_id',p_entity_id,'unit_id',p_unit_id,'data',p_payload));
 end loop;
 return r;
end; $$;

create function public.review_request(p_request_id uuid,p_approve boolean,p_reason text default '')
returns void language plpgsql security definer set search_path=public as $$
declare r requests; req uuid; new_unit uuid; begin
 if not is_admin() then raise exception 'Acceso denegado'; end if;
 select * into r from requests where id=p_request_id for update;
 if not found or r.status<>'Pendiente' then raise exception 'La solicitud ya fue revisada o no existe'; end if;
 if not p_approve and length(trim(coalesce(p_reason,'')))=0 then raise exception 'El motivo de rechazo es obligatorio'; end if;
 if p_approve then
 case r.type
 when 'unidad' then
 insert into business_units(entity_id,name,location,responsible) values(r.entity_id,r.payload->>'name',coalesce(r.payload->>'location',''),coalesce(r.payload->>'responsible','')) returning id into new_unit;
 -- The requesting manager receives access to the newly approved unit.
 if (select role from profiles where id=r.requester_id)<>'super_admin' then insert into user_units(user_id,unit_id) values(r.requester_id,new_unit); end if;
 when 'requerimiento' then
 insert into requirements(client_id,entity_id,unit_id,requester_id,title,vacancies,priority,required_date,details,created_at)
 values(r.client_id,r.entity_id,r.unit_id,r.requester_id,r.payload->>'title',(r.payload->>'vacancies')::int,r.priority,(r.payload->>'required_date')::date,coalesce(r.payload->'details','{}'),r.created_at) returning id into req;
 insert into searches(requirement_id,unit_id,title,vacancies,interview_goal) values(req,r.unit_id,r.payload->>'title',(r.payload->>'vacancies')::int,(r.payload->>'vacancies')::int*3);
 when 'usuario' then raise exception 'Aprobar usuarios mediante la función invite-user';
 end case;
 end if;
 update requests set status=case when p_approve then 'Aprobada' else 'Rechazada' end,reviewed_by=auth.uid(),reviewed_at=now(),reason=p_reason where id=r.id;
 insert into notifications(user_id,title,body,request_id) values(r.requester_id,case when p_approve then 'Solicitud aprobada' else 'Solicitud rechazada' end,coalesce(nullif(p_reason,''),'Tu solicitud fue procesada.'),r.id);
 insert into email_outbox(recipient,template,payload) select email,'request_reviewed',jsonb_build_object('request_id',r.id,'approved',p_approve,'reason',p_reason) from profiles where id=r.requester_id;
end; $$;

create function public.move_application(p_application_id uuid,p_stage text,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare a applications; s searches; recipient profiles; begin
 if not is_admin() then raise exception 'Solo la selectora puede cambiar etapas'; end if;
 if length(trim(coalesce(p_note,'')))=0 then raise exception 'Escribí una observación'; end if;
 select * into a from applications where id=p_application_id for update;
 if not found then raise exception 'Proceso inexistente'; end if;
 select * into s from searches where id=a.search_id for update;
 if s.status in ('Cubierta','Cancelada') then raise exception 'La búsqueda está cerrada'; end if;
 if a.stage=p_stage then raise exception 'El candidato ya está en esta etapa'; end if;
 if p_stage='Ingresado' and (select count(*) from applications where search_id=s.id and stage='Ingresado')>=s.vacancies then raise exception 'Todas las vacantes ya fueron cubiertas'; end if;
 update applications set stage=p_stage where id=a.id;
 insert into stage_history(application_id,actor_id,old_stage,new_stage,note) values(a.id,auth.uid(),a.stage,p_stage,p_note);
 if p_stage in ('Aprobado','Preingreso','Ingresado') then
 for recipient in select p.* from profiles p join user_units u on u.user_id=p.id where u.unit_id=s.unit_id and p.active loop
 insert into notifications(user_id,title,body) values(recipient.id,'Candidato: '||p_stage,s.title);
 insert into email_outbox(recipient,template,payload) values(recipient.email,'candidate_stage',jsonb_build_object('application_id',a.id,'stage',p_stage,'search_title',s.title));
 end loop;
 end if;
end; $$;

create function public.save_candidate(p_values jsonb,p_search_id uuid default null,p_existing_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid; a uuid; d text; l text; duplicate_id uuid; s searches; begin
 if not is_admin() then raise exception 'Solo la selectora puede administrar candidatos'; end if;
 d:=nullif(regexp_replace(coalesce(p_values->>'dni',''),'[^0-9]','','g'),'');
 l:=nullif(regexp_replace(coalesce(p_values->>'cuil',''),'[^0-9]','','g'),'');
 if p_existing_id is not null then
 if not exists(select 1 from candidates where id=p_existing_id) then raise exception 'Candidato inexistente'; end if;
 c:=p_existing_id;
 else
 select id into duplicate_id from candidates where (d is not null and dni=d) or (l is not null and cuil=l) limit 1;
 if duplicate_id is not null then raise exception 'Candidato existente. Actualizá la lista y asociá su ficha.'; end if;
 insert into candidates(name,dni,cuil,birth_date,email,phone,location,experience,education,availability,salary,notes)
 values(trim(p_values->>'name'),d,l,nullif(p_values->>'birth_date','')::date,coalesce(p_values->>'email',''),coalesce(p_values->>'phone',''),coalesce(p_values->>'location',''),coalesce(p_values->>'experience',''),coalesce(p_values->>'education',''),coalesce(p_values->>'availability',''),coalesce(p_values->>'salary',''),coalesce(p_values->>'notes','')) returning id into c;
 end if;
 if p_search_id is not null then
 select * into s from searches where id=p_search_id for update;
 if not found or s.status in ('Cubierta','Cancelada') then raise exception 'Seleccioná una búsqueda abierta'; end if;
 insert into applications(candidate_id,search_id) values(c,p_search_id) returning id into a;
 insert into stage_history(application_id,actor_id,new_stage,note) values(a,auth.uid(),'Postulado','Asociado a la búsqueda');
 end if;
 return c;
end; $$;

create function public.update_search(p_search_id uuid,p_goal integer,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare s searches; begin
 if not is_admin() then raise exception 'Acceso denegado'; end if;
 select * into s from searches where id=p_search_id for update;
 if not found then raise exception 'Búsqueda inexistente'; end if;
 if p_status='Cubierta' and (select count(*) from applications where search_id=s.id and stage='Ingresado')<s.vacancies then raise exception 'Todavía hay vacantes sin cubrir'; end if;
 update searches set interview_goal=p_goal,status=p_status,closed_at=case when p_status in ('Cubierta','Cancelada') then coalesce(closed_at,now()) else null end where id=s.id;
end; $$;

create function public.set_user_permissions(p_user_id uuid,p_role text,p_unit_ids uuid[],p_active boolean)
returns void language plpgsql security definer set search_path=public as $$
declare p profiles; u uuid; begin
 if not is_admin() then raise exception 'Acceso denegado'; end if;
 if p_user_id=auth.uid() and (p_role<>'super_admin' or not p_active) then raise exception 'No podés quitar tu propio acceso'; end if;
 select * into p from profiles where id=p_user_id for update;
 if not found then raise exception 'Usuario inexistente'; end if;
 foreach u in array p_unit_ids loop
 if not exists(select 1 from business_units b join legal_entities e on e.id=b.entity_id where b.id=u and e.client_id=p.client_id) then raise exception 'Unidad de otro cliente'; end if;
 end loop;
 update profiles set role=p_role,active=p_active where id=p_user_id;
 delete from user_units where user_id=p_user_id;
 insert into user_units(user_id,unit_id) select p_user_id,unnest(p_unit_ids);
end; $$;

-- Invitation functions split the external Auth call from the DB transaction.
create function public.reserve_user_request(p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r requests; begin
 if not is_admin() then raise exception 'Acceso denegado'; end if;
 select * into r from requests where id=p_request_id for update;
 if not found or r.type<>'usuario' or r.status<>'Pendiente' then raise exception 'Solicitud no disponible'; end if;
 if exists(select 1 from profiles where lower(email)=lower(r.payload->>'email')) then raise exception 'Ese usuario ya tiene una cuenta'; end if;
 update requests set status='Invitando',reviewed_by=auth.uid() where id=r.id;
 return to_jsonb(r);
end; $$;
create function public.release_user_request(p_request_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin update requests set status='Pendiente',reviewed_by=null where id=p_request_id and status='Invitando'; end; $$;
create function public.finalize_user_request(p_request_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r requests; u uuid; begin
 select * into r from requests where id=p_request_id for update;
 if not found or r.type<>'usuario' or r.status<>'Invitando' then raise exception 'Solicitud no reservada'; end if;
 if not exists(select 1 from auth.users where id=p_user_id and lower(email)=lower(r.payload->>'email')) then raise exception 'Email de Auth no coincide'; end if;
 insert into profiles(id,name,email,role,client_id,position,phone) values(p_user_id,r.payload->>'name',lower(r.payload->>'email'),r.payload->>'role',r.client_id,coalesce(r.payload->>'position',''),coalesce(r.payload->>'phone',''));
 for u in select value::uuid from jsonb_array_elements_text(r.payload->'unit_ids') loop
 if not exists(select 1 from business_units b join legal_entities e on e.id=b.entity_id where b.id=u and b.entity_id=r.entity_id and e.client_id=r.client_id) then raise exception 'Unidad de otro cliente o razón social'; end if;
 insert into user_units(user_id,unit_id) values(p_user_id,u);
 end loop;
 update requests set status='Aprobada',reviewed_at=now() where id=r.id;
 insert into notifications(user_id,title,body,request_id) values(r.requester_id,'Acceso aprobado','Se invitó al usuario solicitado.',r.id);
 insert into activity(actor_id,action,record_id,unit_id) values(r.reviewed_by,'Aprobó un acceso y envió la invitación',r.id,r.unit_id);
end; $$;

-- Functions are not executable by anonymous users; finalize/release are server-only.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_admin(),public.my_client(),public.my_role(),public.can_unit(uuid),public.can_entity(uuid),public.can_search(uuid),public.can_application(uuid) to authenticated;
grant execute on function public.create_client(text,text,text,text,text,text,text),public.submit_request(text,uuid,uuid,uuid,text,jsonb),public.review_request(uuid,boolean,text),public.move_application(uuid,text,text),public.save_candidate(jsonb,uuid,uuid),public.update_search(uuid,integer,text),public.set_user_permissions(uuid,text,uuid[],boolean),public.reserve_user_request(uuid) to authenticated;
grant execute on all functions in schema public to service_role;
-- Optional realtime: only this user's notifications are visible via RLS.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 alter publication supabase_realtime add table public.notifications;
 end if;
end $$;
commit;
