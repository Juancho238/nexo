// A delivery worker can use these templates after an email provider is connected.
// No email is sent by this file. Outbox records remain queued until confirmed delivery.
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const titles:Record<string,string>={new_request:'Nueva solicitud pendiente',request_reviewed:'Tu solicitud fue revisada',candidate_stage:'Novedad en el proceso de selección',user_approved:'Tu acceso a NEXO fue aprobado',feedback_pending:'Búsqueda esperando feedback'};
export function renderNexoEmail(template:string,payload:Record<string,unknown>,appUrl:string){
 const url=new URL(appUrl);if(url.protocol!=='https:')throw new Error('El portal debe utilizar HTTPS.');
 const title=titles[template]||'Nueva notificación de NEXO';
 const detail=payload.reason||payload.stage||payload.type||'Revisá los detalles en el portal.';
 const link=new URL('/',appUrl);if(payload.request_id)link.searchParams.set('request',String(payload.request_id));
 return {subject:`NEXO — ${title}`,html:`<div style="background:#141218;color:#eee;font-family:Arial,sans-serif;padding:36px;max-width:600px"><h1 style="letter-spacing:4px;color:#b196eb">NEXO</h1><p>Portal de Selección</p><h2>${escape(title)}</h2><p>${escape(detail)}</p><a href="${escape(link.toString())}" style="background:#9172e6;color:white;padding:14px 22px;text-decoration:none;display:inline-block;border-radius:6px">Revisar en NEXO</a><p style="color:#aaa;font-size:12px">Conectamos talento con oportunidades.</p></div>`};
}
