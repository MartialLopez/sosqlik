import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const publicDir = path.resolve('public');
const distOutput = path.join(dist, 'search-index.json');
const publicOutput = path.join(publicDir, 'search-index.json');

function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function decodeEntities(s) {
  return s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/&#([0-9]+);/g,(_,d)=>String.fromCodePoint(parseInt(d,10)));
}
function cleanSearchText(s) {
  return s.normalize('NFC')
    .replace(/[\uE000-\uF8FF]/g,' ')
    .replace(/[\uFFF0-\uFFFF]/g,' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,' ')
    // Symboles géométriques décoratifs récupérés depuis certains composants.
    // La ponctuation Qlik ($ * { } < > = ( ) [ ]) n'est pas concernée.
    .replace(/[\u25A0-\u25FF]/g,' ')
    .replace(/\s+/g,' ').trim();
}
function stripHtml(html) {
  return cleanSearchText(decodeEntities(html
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<[^>]+>/g,' ')));
}
function titleOf(html,fallback) {
  const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(h1?.[1]||title?.[1]||fallback).replace(/\s*[·|–-]\s*SOSBI\s*$/i,'').trim();
}
function urlOf(file) {
  let rel=path.relative(dist,file).replaceAll('\\','/');
  if (rel.startsWith('client/')) rel=rel.slice('client/'.length);
  if (rel==='index.html') return '/';
  rel=rel.replace(/\/index\.html$/i,'').replace(/\.html$/i,'');
  return '/'+rel;
}
function typeOf(url) {
  if(url.startsWith('/tutoriels/')) return 'Tutoriel';
  if(url==='/tutoriels') return 'Tutoriels';
  if(url.startsWith('/articles/')) return 'Article';
  if(url==='/articles') return 'Articles';
  if(url.startsWith('/astuces')) return 'Astuce';
  return 'Page';
}
if(!fs.existsSync(dist)){console.error('ERREUR: dist introuvable');process.exit(1)}

const byUrl = new Map();
for (const file of walk(dist).filter(f=>f.endsWith('.html'))) {
  const html=fs.readFileSync(file,'utf8');
  const url=urlOf(file);
  if(url==='/recherche') continue;
  const item={url,type:typeOf(url),title:titleOf(html,path.basename(path.dirname(file))||'SOSBI'),text:stripHtml(html).slice(0,100000)};
  if(item.title && item.text) {
    const old=byUrl.get(url);
    if(!old || item.text.length > old.text.length) byUrl.set(url,item);
  }
}
const pages=[...byUrl.values()].sort((a,b)=>a.url.localeCompare(b.url,'fr'));
const bad=pages.filter(p=>p.url==='/client'||p.url.startsWith('/client/'));
if(bad.length){console.error('ERREUR: URLs techniques /client détectées',bad.map(x=>x.url));process.exit(1)}

const json=JSON.stringify(pages);
fs.mkdirSync(publicDir,{recursive:true});
fs.writeFileSync(publicOutput,json,'utf8');
fs.writeFileSync(distOutput,json,'utf8');

console.log(`✓ Index SOSBI : ${pages.length} routes publiques indexées`);
console.log(`✓ DEV  : ${publicOutput}`);
console.log(`✓ PROD : ${distOutput}`);
