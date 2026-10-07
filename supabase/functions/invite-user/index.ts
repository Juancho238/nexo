import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
// Deploy with JWT verification enabled. This also verifies the JWT with Auth.
Deno.serve(async (request:Request)=>{
 const appUrl=Deno.env.get('NEXO_APP_URL');
 const origin=request.headers.get('Origin')||'';
 const allowed=appUrl?new URL(appUrl).origin:'';
 const cors={'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(!allowed)return reply({error:'Configurá NEXO_APP_URL en la función.'},503);
 if(origin&&origin!==allowed)return reply({error:'Origen no permitido'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return reply({error:'Método no permitido'},405);
 const url=Deno.env.get('SUPABASE_URL')!;
 const auth=request.headers.get('Authorization')||'';
 const scoped=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:{user},error:authError}=await scoped.auth.getUser();
 if(authError||!user)return reply({error:'Sesión inválida'},401);
 const {data:profile}=await scoped.from('profiles').select('role,active').eq('id',user.id).single();
 if(!profile?.active||profile.role!=='super_admin')return reply({error:'Acceso denegado'},403);
 let id:string;
 try{({request_id:id}=await request.json());if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error();}catch{return reply({error:'Solicitud inválida'},400)}
 const {data:r,error:reserveError}=await scoped.rpc('reserve_user_request',{p_request_id:id!});
 if(reserveError)return reply({error:reserveError.message},409);
 const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data:invitation,error:inviteError}=await service.auth.admin.inviteUserByEmail(r.payload.email,{redirectTo:allowed+'/?setup=1',data:{name:r.payload.name}});
 if(inviteError){await service.rpc('release_user_request',{p_request_id:id!});return reply({error:'No se pudo enviar la invitación. Revisá SMTP y que el email no tenga otra cuenta.'},422)}
 const invitedId=invitation.user.id;
 const {error:finalError}=await service.rpc('finalize_user_request',{p_request_id:id!,p_user_id:invitedId});
 if(finalError){
  const {error:deleteError}=await service.auth.admin.deleteUser(invitedId);
  if(!deleteError)await service.rpc('release_user_request',{p_request_id:id!});
  // If compensation fails, keep the reservation. Do not permit duplicate invites.
  return reply({error:deleteError?'La invitación necesita revisión administrativa; la solicitud permanece reservada.':'No se pudo asignar el acceso. La solicitud volvió a pendiente.'},500);
 }
 return reply({ok:true,user_id:invitedId});
});
