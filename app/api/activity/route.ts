import {headers} from 'next/headers';
import {database} from '@/db/raw';
import {confirmedCharactersForMonth,monthJST} from '@/lib/rules';
import {sessionFromHeaders} from '@/lib/anonymous-session';
export const dynamic='force-dynamic';
function json(data:unknown,status=200,setCookie?:string){const responseHeaders=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(setCookie)responseHeaders.set('Set-Cookie',setCookie);return Response.json(data,{status,headers:responseHeaders});}
export async function GET(){try{
 const session=await sessionFromHeaders(await headers());const sub=session.sub;
 const db=database();const now=Date.now();
 const admitted=await db.prepare('INSERT INTO limits(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<=? THEN 1 ELSE count+1 END, until=CASE WHEN until<=? THEN excluded.until ELSE until END WHERE until<=? OR count<? RETURNING count').bind('activity:'+sub,now+60000,now,now,now,60).first();if(!admitted)return json({error:'rate_limited'},429,session.setCookie);
 const seen=(await db.prepare('SELECT seen FROM visits WHERE subject=?').bind(sub).first<{seen:number}>())?.seen||0;
 const currentMonth=monthJST();const boardIds=confirmedCharactersForMonth(currentMonth).map(c=>`${currentMonth}:${c.id}`);if(!boardIds.length)return json({unread:0,featured:null},200,session.setCookie);const slots=boardIds.map(()=>'?').join(',');
 const unread=seen?(await db.prepare(`SELECT COUNT(*) count FROM posts WHERE status='visible' AND created>? AND board IN (${slots}) AND (parent IS NULL OR EXISTS(SELECT 1 FROM posts parent WHERE parent.id=posts.parent AND parent.status='visible'))`).bind(seen,...boardIds).first<{count:number}>())?.count||0:0;
 const featured=await db.prepare(`SELECT p.id,p.board,p.body,u.name,(SELECT COUNT(*) FROM likes l WHERE l.post=p.id) likes,(SELECT COUNT(*) FROM helpful h WHERE h.post=p.id) helpful FROM posts p JOIN users u ON u.id=p.author WHERE p.status='visible' AND p.parent IS NULL AND p.body<>'' AND p.board IN (${slots}) ORDER BY (SELECT COUNT(*) FROM helpful h WHERE h.post=p.id)+(SELECT COUNT(*) FROM likes l WHERE l.post=p.id) DESC,p.created DESC,p.id DESC LIMIT 1`).bind(...boardIds).first();
 return json({unread,featured},200,session.setCookie);
 }catch{console.error('community_activity_unavailable');return json({error:'unavailable'},503);}}
