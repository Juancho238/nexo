import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(`create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create role anon;create role authenticated;create role service_role bypassrls;
grant usage on schema public,auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;`);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/001_nexo.sql", import.meta.url),
    "utf8",
  ),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
await db.exec(`insert into auth.users values('${id(1)}','admin@example.com'),('${id(2)}','a@example.com'),('${id(3)}','b@example.com'),('${id(4)}','leader@example.com');
insert into clients(id,name) values('${id(10)}','Client A'),('${id(11)}','Client B');
insert into legal_entities(id,client_id,name) values('${id(20)}','${id(10)}','A SA'),('${id(21)}','${id(11)}','B SA');
insert into business_units(id,entity_id,name) values('${id(30)}','${id(20)}','A1'),('${id(31)}','${id(21)}','B1'),('${id(32)}','${id(20)}','A2');
insert into profiles(id,name,email,role,client_id) values('${id(1)}','Admin','admin@example.com','super_admin',null),('${id(2)}','Manager A','a@example.com','gerente','${id(10)}'),('${id(3)}','Manager B','b@example.com','gerente','${id(11)}'),('${id(4)}','Leader A','leader@example.com','lider','${id(10)}');
insert into user_units values('${id(2)}','${id(30)}'),('${id(3)}','${id(31)}'),('${id(4)}','${id(30)}');`);
const as = async (n) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(n),
  ]);
  await db.exec("set role authenticated");
};
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const fail = async (fn, pattern) => {
  await assert.rejects(fn, pattern);
};
await as(2);
assert.equal((await query("select * from clients")).length, 1);
assert.deepEqual(
  (await query("select name from business_units")).map((r) => r.name),
  ["A1"],
);
assert.equal((await query("select * from profiles")).length, 1);
await fail(
  () =>
    db.exec(
      `update profiles set role='super_admin',client_id=null where id='${id(2)}'`,
    ),
  /permission denied/,
);
await fail(
  () =>
    db.exec(`insert into activity(action,record_id) values('Fake','${id(1)}')`),
  /permission denied/,
);
await fail(
  () =>
    query("select submit_request($1,$2,$3,$4,$5,$6)", [
      "requerimiento",
      id(11),
      id(21),
      id(31),
      "Media",
      {
        title: "Leak",
        vacancies: 1,
        required_date: "2026-11-01",
        details: { description: "Test" },
      },
    ]),
  /sin permiso/,
);
await fail(
  () =>
    query("select submit_request($1,$2,$3,$4,$5,$6)", [
      "requerimiento",
      id(10),
      id(20),
      id(32),
      "Media",
      {
        title: "Hidden unit",
        vacancies: 1,
        required_date: "2026-11-01",
        details: { description: "Test" },
      },
    ]),
  /sin permiso/,
);
const r = (
  await query("select submit_request($1,$2,$3,$4,$5,$6) as id", [
    "requerimiento",
    id(10),
    id(20),
    id(30),
    "Alta",
    {
      title: "Operario A",
      vacancies: 1,
      required_date: "2026-11-01",
      details: { description: "Operator" },
    },
  ])
)[0].id;
await fail(
  () => query("select review_request($1,true,'')", [r]),
  /Acceso denegado/,
);
await as(1);
await query("select review_request($1,true,'')", [r]);
assert.equal((await query("select * from requirements")).length, 1);
assert.equal((await query("select * from searches")).length, 1);
await fail(
  () => query("select review_request($1,true,'')", [r]),
  /ya fue revisada/,
);
const sA = (await query("select id from searches"))[0].id;
const candidate = (
  await query("select save_candidate($1,$2,null) as id", [
    { name: "Unique person", dni: "99123456" },
    sA,
  ])
)[0].id;
await fail(
  () =>
    query("select save_candidate($1,$2,null)", [
      { name: "Duplicate", dni: "99.123.456" },
      sA,
    ]),
  /Candidato existente/,
);
const appA = (await query("select id from applications"))[0].id;
await query("select move_application($1,'Ingresado','Confirmed')", [appA]);
const second = (
  await query("select save_candidate($1,$2,null) as id", [
    { name: "Second person", dni: "99123457" },
    sA,
  ])
)[0].id;
const appSecond = (
  await query("select id from applications where candidate_id=$1", [second])
)[0].id;
await fail(
  () =>
    query("select move_application($1,'Ingresado','Over capacity')", [
      appSecond,
    ]),
  /vacantes ya fueron cubiertas/,
);
await as(3);
assert.equal((await query("select * from candidates")).length, 0);
assert.equal((await query("select * from searches")).length, 0);
const rb = (
  await query("select submit_request($1,$2,$3,$4,$5,$6) as id", [
    "requerimiento",
    id(11),
    id(21),
    id(31),
    "Media",
    {
      title: "Operario B",
      vacancies: 1,
      required_date: "2026-11-01",
      details: { description: "Operator B" },
    },
  ])
)[0].id;
await as(1);
await query("select review_request($1,true,'')", [rb]);
const sB = (
  await query("select id from searches where unit_id=$1", [id(31)])
)[0].id;
await query("select save_candidate($1,$2,$3)", [{}, sB, candidate]);
await as(3);
assert.equal((await query("select * from candidates")).length, 1);
assert.equal((await query("select * from applications")).length, 1);
assert.equal((await query("select * from stage_history")).length, 1);
assert.equal(
  (await query("select new_stage from stage_history"))[0].new_stage,
  "Postulado",
);
assert.equal((await query("select * from notifications")).length, 1);
await fail(
  () => query("select finalize_user_request($1,$2)", [r, id(3)]),
  /permission denied/,
);
await as(2);
const unitRequest = (
  await query("select submit_request($1,$2,$3,$4,$5,$6) as id", [
    "unidad",
    id(10),
    id(20),
    null,
    "Media",
    { name: "New A3", location: "BA", responsible: "A" },
  ])
)[0].id;
await as(1);
await fail(
  () => query("select review_request($1,false,'')", [unitRequest]),
  /motivo/,
);
await query("select review_request($1,true,'')", [unitRequest]);
await as(2);
assert.equal((await query("select * from business_units")).length, 2);
await as(4);
await fail(
  () =>
    query("select submit_request($1,$2,$3,$4,$5,$6)", [
      "unidad",
      id(10),
      id(20),
      null,
      "Media",
      { name: "Unauthorized", location: "BA" },
    ]),
  /Solo un gerente/,
);
await as(1);
await fail(
  () =>
    query("select set_user_permissions($1,$2,$3,$4)", [
      id(2),
      "gerente",
      [id(31)],
      true,
    ]),
  /otro cliente/,
);
await query("select set_user_permissions($1,$2,$3,$4)", [
  id(2),
  "gerente",
  [id(30)],
  false,
]);
await as(2);
assert.equal((await query("select * from business_units")).length, 0);
assert.equal((await query("select * from candidates")).length, 0);
await db.exec("reset role;set role anon");
await fail(() => query("select * from candidates"), /permission denied/);
await fail(() => query("select is_admin()"), /permission denied/);
await db.exec("reset role");
await db.exec(
  await readFile(
    new URL("../supabase/migrations/002_nexo_v2.sql", import.meta.url),
    "utf8",
  ),
);
await as(1);
await query("select set_user_permissions($1,$2,$3,$4)", [
  id(2),
  "gerente",
  [id(30)],
  true,
]);
const workspace = (await query("select nexo_workspace() as data"))[0].data;
assert.equal(workspace.stats.open, 2);
assert.equal(workspace.candidates.length, 2);
assert.equal(
  (await query("select nexo_report('{}') as data"))[0].data.vacancies,
  2,
);
await query(
  "select move_application($1,'Presentado a gerencia','Feedback needed')",
  [appSecond],
);
await as(2);
await query(
  "insert into manager_feedback(application_id,actor_id,recommendation,note) values($1,$2,$3,$4)",
  [appSecond, id(2), "Aprobar", "Experiencia adecuada"],
);
await fail(
  () =>
    query(
      "insert into manager_feedback(application_id,actor_id,recommendation,note) values($1,$2,$3,$4)",
      [appA, id(2), "Aprobar", "Etapa incorrecta"],
    ),
  /row-level security/,
);
await fail(
  () =>
    query("select edit_candidate($1,$2)", [
      candidate,
      { name: "Unauthorized" },
    ]),
  /Acceso denegado/,
);
assert.equal(
  (await query("select nexo_report('{}') as data"))[0].data.vacancies,
  1,
);
await as(3);
await fail(
  () =>
    query(
      "insert into manager_feedback(application_id,actor_id,recommendation,note) values($1,$2,$3,$4)",
      [appSecond, id(3), "Aprobar", "Cross client"],
    ),
  /row-level security/,
);
assert.equal((await query("select * from manager_feedback")).length, 0);
await fail(
  () => query("select nexo_candidate_detail($1)", [second]),
  /Acceso denegado/,
);
await fail(
  () => query("select record_read('candidate',$1)", [second]),
  /Acceso denegado/,
);
await as(1);
await query(
  "insert into appointments(application_id,starts_at,ends_at,interviewer,created_by) values($1,$2,$3,$4,$5)",
  [appSecond, "2026-10-10T14:00:00Z", "2026-10-10T15:00:00Z", "Admin", id(1)],
);
await query(
  "insert into candidate_documents(candidate_id,path,filename,mime,size_bytes,created_by) values($1,$2,$3,$4,$5,$6)",
  [second, second + "/cv.pdf", "cv.pdf", "application/pdf", 100, id(1)],
);
assert.equal((await query("select * from read_audit")).length > 0, true);
await as(3);
assert.equal((await query("select * from appointments")).length, 0);
assert.equal((await query("select * from candidate_documents")).length, 0);
await as(1);
// Pagination must return complete totals without loading all rows into the browser.
await db.exec(
  "reset role;insert into candidates(name) select 'Paged '||g from generate_series(1,70)g",
);
await as(1);
const p1 = (
  await query("select nexo_workspace('Candidatos',0,'Paged') as data")
)[0].data;
const p2 = (
  await query("select nexo_workspace('Candidatos',25,'Paged') as data")
)[0].data;
assert.equal(p1.total, 70);
assert.equal(p1.candidates.length, 25);
assert.equal(p2.candidates.length, 25);
assert.equal(
  p1.candidates.some((a) => p2.candidates.some((b) => a.id === b.id)),
  false,
);
console.log(
  "PASS v2: additive migration, SQL reports, bounded pagination, stage feedback, scoped documents/agenda and read audit.",
);
await db.exec(`reset role;create schema storage;create schema extensions;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(p text) returns text[] language sql immutable as $$select string_to_array(p,'/')$$;
grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;grant execute on function storage.foldername(text) to authenticated;`);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/003_private_cv.sql", import.meta.url),
    "utf8",
  ),
);
await as(1);
await query("insert into storage.objects(bucket_id,name) values($1,$2)", [
  "nexo-cv",
  second + "/cv.pdf",
]);
await as(2);
assert.equal((await query("select * from storage.objects")).length, 1);
await as(3);
assert.equal((await query("select * from storage.objects")).length, 0);
await fail(
  () =>
    query("insert into storage.objects(bucket_id,name) values($1,$2)", [
      "nexo-cv",
      second + "/fake.pdf",
    ]),
  /row-level security/,
);
await db.exec("reset role");
await db.exec(
  await readFile(
    new URL("../supabase/migrations/004_candidate_portal.sql", import.meta.url),
    "utf8",
  ),
);
await query("insert into auth.users(id,email) values($1,$2)", [
  id(5),
  "candidate@example.com",
]);
await query(
  "insert into candidate_accounts(user_id,candidate_id) values($1,$2)",
  [id(5), second],
);
await as(5);
assert.equal((await query("select * from candidates")).length, 0);
assert.equal((await query("select * from applications")).length, 0);
const portal = (await query("select candidate_portal() as data"))[0].data;
assert.equal(portal.candidate.id, second);
assert.equal(portal.candidate.notes, undefined);
assert.equal(portal.documents.length, 1);
assert.equal((await query("select * from storage.objects")).length, 1);
await fail(
  () => query("select edit_candidate($1,$2)", [second, { name: "Escalation" }]),
  /Acceso denegado/,
);
await fail(
  () => query("select update_candidate_contact($1,$2,false)", ["123", "BA"]),
  /Confirmá/,
);
await query("select update_candidate_contact($1,$2,true)", [
  "5491112345678",
  "Buenos Aires",
]);
assert.equal(
  (await query("select candidate_portal() as data"))[0].data.candidate.phone,
  "5491112345678",
);
await db.exec("reset role");
await query("update candidate_accounts set active=false where user_id=$1", [
  id(5),
]);
await as(5);
await fail(() => query("select candidate_portal()"), /invitación activa/);
assert.equal((await query("select * from storage.objects")).length, 0);
console.log(
  "PASS v2 Storage/portal: private policies, indexed lookup, personal data only, consent update, internal-note isolation and revoked access.",
);
await db.close();
console.log(
  "PASS: migration, cross-client/unit isolation, role escalation, audit protection, atomic approvals, candidate uniqueness, history isolation, capacity, invitation restrictions, inactive and anonymous access.",
);
