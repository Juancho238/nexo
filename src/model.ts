export const stages = ['Postulado','Contactado','Entrevista selectora','Presentado a gerencia','Entrevista gerencial','Aprobado','Preingreso','Ingresado'] as const;
export const outcomes = ['No seleccionado','No se presentó','Desistió','Rechazado','Cancelado'];
export type Role = 'super_admin' | 'admin_cliente' | 'gerente' | 'lider';
export const roleNames: Record<Role,string> = {super_admin:'Selectora / Administradora',admin_cliente:'Admin cliente',gerente:'Gerente',lider:'Líder'};
export interface Client {id:string; name:string; contact:string; email:string; phone:string; status:string; notes:string}
export interface Entity {id:string; client_id:string; name:string; cuit:string}
export interface Unit {id:string; entity_id:string; name:string; location:string; responsible:string}
export interface Profile {id:string; name:string; email:string; role:Role; client_id:string|null; active:boolean; position:string; phone:string}
export interface Assignment {user_id:string;unit_id:string}
export interface Request {id:string;client_id:string;entity_id:string;unit_id:string|null;requester_id:string;type:'unidad'|'usuario'|'requerimiento';status:string;priority:string;payload:Record<string,any>;created_at:string;reviewed_by?:string;reviewed_at?:string;reason?:string}
export interface Requirement {id:string;client_id:string;entity_id:string;unit_id:string;requester_id:string;title:string;vacancies:number;priority:string;status:string;required_date:string;details:Record<string,string>;created_at:string}
export interface Search {id:string;requirement_id:string;unit_id:string;title:string;vacancies:number;interview_goal:number;status:string;created_at:string;closed_at:string|null}
export interface Candidate {id:string;name:string;dni:string|null;cuil:string|null;birth_date:string|null;email:string;phone:string;location:string;experience:string;education:string;availability:string;salary:string;notes:string}
export interface Application {id:string;candidate_id:string;search_id:string;stage:string;created_at:string}
export interface Interview {id:string;application_id:string;date:string;interviewer:string;type:string;result:string;strengths:string;weaknesses:string;notes:string;recommendation:string}
export interface History {id:string;application_id:string;actor_id:string;actor_name?:string;old_stage:string|null;new_stage:string;note:string;created_at:string}
export interface Activity {id:string;actor_id:string;actor_name?:string;action:string;record_id:string;unit_id:string|null;created_at:string}
export interface Notification {id:string;user_id:string;title:string;body:string;read:boolean;created_at:string;request_id?:string}
export interface Data {clients:Client[];entities:Entity[];units:Unit[];profiles:Profile[];assignments:Assignment[];requests:Request[];requirements:Requirement[];searches:Search[];candidates:Candidate[];applications:Application[];interviews:Interview[];history:History[];activity:Activity[];notifications:Notification[]}
export const emptyData:Data={clients:[],entities:[],units:[],profiles:[],assignments:[],requests:[],requirements:[],searches:[],candidates:[],applications:[],interviews:[],history:[],activity:[],notifications:[]};
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export function age(birth:string|null) {if(!birth)return null;const d=new Date(birth+'T12:00:00');const t=new Date();let a=t.getFullYear()-d.getFullYear();if(t.getMonth()<d.getMonth()||(t.getMonth()===d.getMonth()&&t.getDate()<d.getDate()))a--;return a;}
export function accessibleUnits(data:Data,user:Profile) {return user.role==='super_admin'?data.units:data.units.filter(u=>data.assignments.some(a=>a.user_id===user.id&&a.unit_id===u.id)&&data.entities.find(e=>e.id===u.entity_id)?.client_id===user.client_id);}
export function scopeData(data:Data,user:Profile):Data {
 if(user.role==='super_admin')return data;
 const units=accessibleUnits(data,user), unitIds=new Set(units.map(u=>u.id));
 const searches=data.searches.filter(s=>unitIds.has(s.unit_id));const ids=new Set(searches.map(s=>s.id));
 const applications=data.applications.filter(a=>ids.has(a.search_id));const appIds=new Set(applications.map(a=>a.id));
 return {...data,clients:data.clients.filter(c=>c.id===user.client_id),entities:data.entities.filter(e=>e.client_id===user.client_id&&units.some(u=>u.entity_id===e.id)),units,profiles:data.profiles.filter(p=>p.id===user.id),assignments:data.assignments.filter(a=>a.user_id===user.id),searches,applications,candidates:data.candidates.filter(c=>applications.some(a=>a.candidate_id===c.id)),requirements:data.requirements.filter(r=>unitIds.has(r.unit_id)&&(user.role==='admin_cliente'||r.requester_id===user.id)),requests:data.requests.filter(r=>r.requester_id===user.id),interviews:data.interviews.filter(i=>appIds.has(i.application_id)),history:data.history.filter(h=>appIds.has(h.application_id)),activity:data.activity.filter(a=>a.actor_id===user.id||(a.unit_id&&unitIds.has(a.unit_id))),notifications:data.notifications.filter(n=>n.user_id===user.id)};
}
