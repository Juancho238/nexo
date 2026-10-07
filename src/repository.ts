import {Data,Profile,Request,uid,now,emptyData} from './model';
import {supabase} from './supabase';
export const tableMap:Record<keyof Data,string>={clients:'clients',entities:'legal_entities',units:'business_units',profiles:'profiles',assignments:'user_units',requests:'requests',requirements:'requirements',searches:'searches',candidates:'candidates',applications:'applications',interviews:'interviews',history:'stage_history',activity:'activity',notifications:'notifications'};
export async function loadData():Promise<Data> {
 if(!supabase)throw new Error('Configurá Supabase primero.');
 const result={...emptyData};
 // Page each table: Supabase defaults to a maximum of 1,000 rows per response.
 await Promise.all(Object.entries(tableMap).map(async ([key,table])=>{let all:any[]=[];for(let offset=0;;offset+=500){const {data,error}=await supabase!.from(table).select('*').order(key==='assignments'?'user_id':'id').range(offset,offset+499);if(error)throw new Error(`${table}: ${error.message}`);all.push(...data);if(data.length<500)break;} (result as any)[key]=all;}));
 return result;
}
export async function insertRow(key:keyof Data,row:any){const {error}=await supabase!.from(tableMap[key]).insert(row);if(error)throw error;}
export async function rpc(name:string,args:Record<string,any>){const {data,error}=await supabase!.rpc(name,args);if(error)throw error;return data;}
export function logDemo(data:Data,user:Profile,action:string,record_id:string,unit_id:string|null=null){data.activity.unshift({id:uid(),actor_id:user.id,action,record_id,unit_id,created_at:now()});}
export function reviewDemo(data:Data,user:Profile,r:Request,approve:boolean,reason:string) {
 if(user.role!=='super_admin')throw new Error('Solo la administradora puede revisar solicitudes.');
 if(r.status!=='Pendiente')throw new Error('La solicitud ya fue revisada.');
 if(!approve&&!reason.trim())throw new Error('Escribí el motivo del rechazo.');
 if(approve){
 if(r.type==='unidad'){const id=uid();data.units.push({id,entity_id:r.entity_id,name:r.payload.name,location:r.payload.location,responsible:r.payload.responsible});if(data.profiles.find(p=>p.id===r.requester_id)?.role!=='super_admin')data.assignments.push({user_id:r.requester_id,unit_id:id});}
 if(r.type==='requerimiento'){const requirement={id:uid(),client_id:r.client_id,entity_id:r.entity_id,unit_id:r.unit_id!,requester_id:r.requester_id,title:r.payload.title,vacancies:Number(r.payload.vacancies),priority:r.priority,status:'Aprobado',required_date:r.payload.required_date,details:r.payload.details,created_at:r.created_at};data.requirements.push(requirement);data.searches.push({id:uid(),requirement_id:requirement.id,unit_id:requirement.unit_id,title:requirement.title,vacancies:requirement.vacancies,interview_goal:requirement.vacancies*3,status:'En búsqueda',created_at:now(),closed_at:null});}
 if(r.type==='usuario'){const id=uid();data.profiles.push({id,name:r.payload.name,email:r.payload.email,role:r.payload.role,client_id:r.client_id,active:true,position:r.payload.position||'',phone:r.payload.phone||''});data.assignments.push(...(r.payload.unit_ids||[]).map((unit_id:string)=>({user_id:id,unit_id})));}
 }
 r.status=approve?'Aprobada':'Rechazada';r.reviewed_by=user.id;r.reviewed_at=now();r.reason=reason;
 data.notifications.push({id:uid(),user_id:r.requester_id,title:`Solicitud ${r.status.toLowerCase()}`,body:reason||'Tu solicitud fue aprobada.',read:false,created_at:now(),request_id:r.id});
 logDemo(data,user,`${approve?'Aprobó':'Rechazó'} una solicitud de ${r.type}`,r.id,r.unit_id);
}
