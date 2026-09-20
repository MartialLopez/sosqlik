const subjects = ["Question générale", "Aide sur un tutoriel ou une fonction", "Suggestion ou idée", "Erreur ou problème technique", "Partage d’expérience ou d’astuce", "Prise de contact", "Autre demande", "Une question sur un tutoriel", "Une suggestion pour le site", "Une erreur à signaler", "Un retour d’expérience", "Autre sujet"];
export default {
 async fetch(request, env) {
  const origin=request.headers.get('Origin');
  const allowed=(env.ALLOWED_ORIGINS||'https://sosqlik.fr,https://www.sosqlik.fr').split(',').map(s=>s.trim());
  if(!allowed.includes(origin))return new Response('Forbidden',{status:403});
  const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
  const reply=(status,message)=>new Response(JSON.stringify({message}),{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,'Méthode refusée');
  if(!env.RESEND_API_KEY||!env.TURNSTILE_SECRET_KEY||!env.MAIL_FROM||!env.CONTACT_BCC)return reply(503,'Service indisponible');
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply(415,'Format refusé');
  try {
   // Bound actual streamed bytes, including requests without Content-Length.
   const reader=request.body?.getReader();if(!reader)return reply(400,'Message manquant');
   let length=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>32768){await reader.cancel();return reply(413,'Message trop long');}chunks.push(value);}
   const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,'Format invalide');}
   if(!data||typeof data!=='object')return reply(400,'Format invalide');
   const {name='',email,subject,message,token,website=''}=data;
   if([name,email,subject,message,token,website].some(v=>typeof v!=='string'))return reply(400,'Champs invalides');
   if(website||name.length>80||/[\r\n]/.test(name)||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!subjects.includes(subject)||message.trim().length<10||message.length>5000||!token||token.length>2048)return reply(400,'Champs invalides');
   const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:request.headers.get('CF-Connecting-IP')||undefined}),signal:AbortSignal.timeout(8000)});
   if(!verification.ok)return reply(503,'Vérification indisponible');
   const check=await verification.json();
   if(!check.success||check.action!=='contact'||check.hostname!==new URL(origin).hostname)return reply(403,'Vérification refusée');
   const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.MAIL_FROM,to:['contact@sosqlik.fr'],bcc:[env.CONTACT_BCC],reply_to:email,subject:`[SOSQLIK] ${subject}`,text:`Prénom : ${name.trim()||'Non renseigné'}\nE-mail : ${email}\nSujet : ${subject}\n\n${message.trim()}`}),signal:AbortSignal.timeout(12000)});
   if(!sent.ok)return reply(502,'Envoi non confirmé');
   const result=await sent.json();if(!result.id)return reply(502,'Envoi non confirmé');
   return reply(200,'Message transmis');
  }catch{return reply(502,'Envoi non confirmé');}
 }
};
