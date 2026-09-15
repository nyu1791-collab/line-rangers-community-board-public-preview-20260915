import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { enrichPosts } from '@/lib/community-activity';
import {displayNameCookie,guestName,sessionFromHeaders,type AnonymousSession} from '@/lib/anonymous-session';
import {loadCommunityFeatureFlags,requireCommunityFeature} from '@/lib/community-flags';
import {isCommunityFeatureName} from '@/lib/community-features';
import { confirmedCharactersForMonth,isConfirmedCharacterForMonth,isVideoMedia,monthJST,validMonth,textInput,validateReply,mayModerate,contributionBadges,type Role } from '@/lib/rules';
export const dynamic='force-dynamic';
type User={id:string;name:string;display_name_set:number;role:Role};
type BoardStats={videos:number;comments:number;todayComments:number;latestCreated:number;latestId:string|null};
type Session=AnonymousSession;
function response(data:unknown,status=200,setCookie?:string,setCookies:string[]=[]){const responseHeaders=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(setCookie)responseHeaders.append('Set-Cookie',setCookie);for(const cookie of setCookies)responseHeaders.append('Set-Cookie',cookie);return Response.json(data,{status,headers:responseHeaders});}
async function identity():Promise<Session>{return sessionFromHeaders(await headers());}
async function user(sub:string){return database().prepare('SELECT id,name,display_name_set,role FROM users WHERE subject=?').bind(sub).first<User>();}
async function ensureUser(sub:string,name:string,displayName?:string,displayNameSet=false){const current=await user(sub);if(current){if((displayName&&current.name===guestName(sub))||displayNameSet&&!current.display_name_set){await database().prepare("UPDATE users SET name=CASE WHEN ? IS NOT NULL AND name=? THEN ? ELSE name END,display_name_set=CASE WHEN ? THEN 1 ELSE display_name_set END WHERE subject=?").bind(displayName||null,guestName(sub),displayName||current.name,displayNameSet?1:0,sub).run();return user(sub);}return current;}const db=database();await db.prepare("INSERT OR IGNORE INTO users(id,subject,name,display_name_set,role,created) VALUES(?,?,?,?,'user',?)").bind(crypto.randomUUID(),sub,displayName||name,displayNameSet||!!displayName?1:0,Date.now()).run();return user(sub);}
function platformOwnerEnabled(session:Session){
 const flag=(env as unknown as Record<string,unknown>).BOARD_PLATFORM_OWNER_ONLY;
 return flag==='1'&&!session.anonymous;
}
async function promoteVerifiedOwner(sub:string,current:User|null,platformOwner=false){
 if(!current||current.role==='owner')return current;
 const configured=(env as unknown as Record<string,string>).BOARD_OWNER_SUBJECT;
 if((!configured||configured!==sub)&&!platformOwner)return current;
 const db=database();
 await db.prepare("UPDATE users SET role='owner',display_name_set=1 WHERE subject=? AND role='user' AND NOT EXISTS(SELECT 1 FROM users WHERE role='owner')").bind(sub).run();
 return user(sub);
}
async function limit(key:string,max:number,seconds=60){
 const now=Date.now();const result=await database().prepare('INSERT INTO limits(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<=? THEN 1 ELSE count+1 END, until=CASE WHEN until<=? THEN excluded.until ELSE until END WHERE until<=? OR count<? RETURNING count').bind(key,now+seconds*1000,now,now,now,max).first();
 if(!result)throw new Error('rate_limited');
}
async function visiblePost(id:string){return database().prepare("SELECT p.* FROM posts p WHERE p.id=? AND p.status='visible' AND (p.parent IS NULL OR EXISTS(SELECT 1 FROM posts parent WHERE parent.id=p.parent AND parent.status='visible'))").bind(id).first<{id:string;board:string;author:string;parent:string|null;video:string|null;media_type:string|null;body:string}>();}
function isVideoPost(post:{video:string|null;media_type:string|null}){return !!post.video||isVideoMedia(post.media_type);}
function jstDayStart(now=Date.now()){const jst=new Date(now+9*60*60*1000);jst.setUTCHours(0,0,0,0);return jst.getTime()-9*60*60*1000;}
function readCursor(value:string|null){if(!value)return null;const [pinned,created,...id]=value.split(':');const pinnedValue=Number(pinned),createdValue=Number(created),idValue=id.join(':');if(![0,1].includes(pinnedValue)||!Number.isSafeInteger(createdValue)||!/^[a-f0-9-]{36}$/.test(idValue))throw new Error('invalid_request');return {pinned:pinnedValue,created:createdValue,id:idValue};}
function cursorFor(row:{pinned:number;created:number;id:string}){return `${row.pinned}:${row.created}:${row.id}`;}
function readAfter(value:string|null,fallback:number){if(!value)return {created:fallback,id:''};const separator=value.indexOf('.');const createdValue=Number(separator<0?value:value.slice(0,separator));const idValue=separator<0?'':value.slice(separator+1);if(!Number.isSafeInteger(createdValue)||createdValue<0||!/^[a-f0-9-]{36}$/.test(idValue))throw new Error('invalid_request');return {created:createdValue,id:idValue};}
function afterFor(row:{created:number;id:string}){return `${row.created}.${row.id}`;}
function error(e:unknown){const message=e instanceof Error?e.message:'';const codes=['signin_required','profile_required','invalid_text','invalid_media','text_only','rate_limited','not_found','forbidden','invalid_request','duplicate_post','translation_unavailable','feature_disabled','read_only','archive_readonly','anonymous_unavailable'];if(!codes.includes(message)){console.error('board_request_failed');return response({error:'unavailable'},503);}return response({error:message},message==='signin_required'?401:message==='forbidden'?403:message==='rate_limited'?429:message==='not_found'?404:['feature_disabled','read_only','anonymous_unavailable'].includes(message)?503:message==='archive_readonly'?409:400);}
export async function GET(request:Request){try{
 const viewUntil=Date.now();const session=await identity();const sub=session.sub;const db=database();const me=await promoteVerifiedOwner(sub,await ensureUser(sub,session.owner?'LINEレンジャーは神ゲー':session.anonymous?guestName(sub):'ゲスト',session.anonymous?session.displayName:undefined,!!session.owner||!!session.displayName),platformOwnerEnabled(session));const reply=(data:unknown,status=200)=>response(data,status,session.setCookie);const flags=await loadCommunityFeatureFlags(db);const u=new URL(request.url);
 // Reaction totals stay visible, but the people behind them are intentionally
 // private.  Keep the saved reactions for uniqueness and moderation without
 // exposing a name-list API that could be called outside the screen.
 if(u.searchParams.has('helpers')||u.searchParams.has('likers'))throw new Error('not_found');
 if(u.searchParams.has('replies')){
  const parentId=String(u.searchParams.get('replies')||'');const parentPost=await visiblePost(parentId);if(!parentPost)throw new Error('not_found');
  // A root post can have one text-reply level. A video comment can have one
  // extra text-reply level; replies themselves can never receive replies.
  if(parentPost.parent){const root=await visiblePost(parentPost.parent);if(!root||!isVideoPost(root)||root.parent)throw new Error('not_found');}
  const rows=(await db.prepare(`SELECT p.id,p.author,p.board,p.parent,p.body,p.video,p.media_type mediaType,p.media_name mediaName,p.media_size mediaSize,p.media_group mediaGroup,p.created,p.pinned,u.name,u.role,(SELECT COUNT(*) FROM likes l WHERE l.post=p.id) likes,0 replies,EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.user=?) liked FROM posts p JOIN users u ON u.id=p.author WHERE p.parent=? AND p.status='visible' ORDER BY p.created ASC,p.id ASC LIMIT 20`).bind(me?.id||'',parentId).all()).results;
  return reply({posts:await enrichPosts(rows,me?.id||'')});
 }
 if(u.searchParams.get('admin')==='1'){
  if(!me||me.role==='user')throw new Error('forbidden');
  const hidden=(await db.prepare("SELECT p.id,p.body,p.video,p.status,u.name FROM posts p JOIN users u ON u.id=p.author WHERE p.status='hidden' ORDER BY p.created DESC LIMIT 100").all()).results;
  const reports=(await db.prepare("SELECT r.post id,COUNT(*) reports,MIN(r.created) created,p.body,u.name FROM post_reports r JOIN posts p ON p.id=r.post JOIN users u ON u.id=p.author WHERE p.status='visible' GROUP BY r.post,p.body,u.name ORDER BY reports DESC,created ASC LIMIT 100").all()).results;
  // Only explicitly named users enter the Owner's permission work queue.
  // `display_name_set` is authoritative for new rows. The name fallback keeps
  // profiles created before that column was added visible without exposing the
  // generated guest labels; it never grants a role or badge by itself.
  const users=me.role==='owner'?(await db.prepare("SELECT id,name,role FROM users WHERE display_name_set=1 OR role='owner' OR (name<>'匿名ユーザー' AND name<>'ゲスト' AND name NOT LIKE 'ゲスト-%') ORDER BY created DESC LIMIT 100").all()).results:[];
  const userIds=users.map(u=>String((u as {id:string}).id));
  const badgeRows=userIds.length?(await db.prepare(`SELECT user,badge FROM user_badges WHERE user IN (${userIds.map(()=>'?').join(',')}) ORDER BY badge`).bind(...userIds).all()).results:[];
  const badgesByUser=new Map<string,string[]>();for(const row of badgeRows){const key=String(row.user);badgesByUser.set(key,[...(badgesByUser.get(key)||[]),String(row.badge)]);}
  const usersWithBadges=users.map(u=>({...u,badges:badgesByUser.get(String((u as {id:string}).id))||[]}));
  return reply({hidden,reports,users:usersWithBadges,flags});
 }
 const current=monthJST();const requested=u.searchParams.get('month')||current;if(!validMonth(requested)||requested>current)throw new Error('invalid_request');
 // Only explicitly confirmed evaluation topics are seeded, once, for the
 // current JST month. A date rollover alone never creates or switches a topic.
 // Do not write on every read: it adds avoidable latency and D1 contention.
 let boards=(await db.prepare('SELECT * FROM boards WHERE month=? ORDER BY character DESC').bind(requested).all()).results;
 const confirmedTopics=confirmedCharactersForMonth(requested);
 if(requested===current&&!boards.length&&confirmedTopics.length){
  await db.batch(confirmedTopics.map(c=>db.prepare('INSERT OR IGNORE INTO boards(id,month,character,name,image) VALUES(?,?,?,?,?)').bind(`${requested}:${c.id}`,requested,c.id,c.name,c.image)));
  boards=(await db.prepare('SELECT * FROM boards WHERE month=? ORDER BY character DESC').bind(requested).all()).results;
 }
 // The current evaluation exposes only explicitly confirmed topics. Archived
 // months remain read-only records and must never disappear merely because
 // their character is not in this month's current catalog.
 if(requested===current)boards=boards.filter(b=>confirmedTopics.some(c=>c.id===b.character)).map(b=>{const c=confirmedTopics.find(c=>c.id===b.character)!;return {...b,name:c.name,image:c.image};});
 const board=u.searchParams.get('board')||String(boards[0]?.id||'');const parent=u.searchParams.get('video');
 if(board&&!boards.some(b=>b.id===board))throw new Error('not_found');
 let video=null;if(parent){video=await visiblePost(parent);if(!video||!isVideoPost(video)||video.parent||video.board!==board)throw new Error('not_found');}
 const newerThan=u.searchParams.get('newerThan');const afterValue=u.searchParams.get('after');
 if(newerThan!==null||afterValue!==null){
  const since=newerThan===null?0:Number(newerThan);if(!Number.isSafeInteger(since)||since<0||since>Date.now())throw new Error('invalid_request');
  const after=readAfter(afterValue,since);const parentId=video?.id||null;
  if(u.searchParams.get('countOnly')==='1'){
   const latest=afterValue
    ?await db.prepare("SELECT COUNT(*) count,COALESCE(MAX(created),0) latestCreated FROM posts WHERE board=? AND parent IS ? AND status='visible' AND (created>? OR (created=? AND id>?))").bind(board,parentId,after.created,after.created,after.id).first<{count:number;latestCreated:number}>()
    :await db.prepare("SELECT COUNT(*) count,COALESCE(MAX(created),0) latestCreated FROM posts WHERE board=? AND parent IS ? AND status='visible' AND created>?").bind(board,parentId,since).first<{count:number;latestCreated:number}>();
   return reply({count:Number(latest?.count||0),latestCreated:Number(latest?.latestCreated||after.created),latestId:null});
  }
  const rows=afterValue
   ?(await db.prepare(`SELECT p.id,p.author,p.board,p.parent,p.body,p.video,p.media_type mediaType,p.media_name mediaName,p.media_size mediaSize,p.media_group mediaGroup,p.created,p.pinned,u.name,u.role,(SELECT COUNT(*) FROM likes l WHERE l.post=p.id) likes,(SELECT COUNT(*) FROM posts r WHERE r.parent=p.id AND r.status='visible') replies,EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.user=?) liked FROM posts p JOIN users u ON u.id=p.author WHERE p.board=? AND p.parent IS ? AND p.status='visible' AND (p.created>? OR (p.created=? AND p.id>?)) ORDER BY p.created ASC,p.id ASC LIMIT 21`).bind(me?.id||'',board,parentId,after.created,after.created,after.id).all()).results
   :(await db.prepare(`SELECT p.id,p.author,p.board,p.parent,p.body,p.video,p.media_type mediaType,p.media_name mediaName,p.media_size mediaSize,p.media_group mediaGroup,p.created,p.pinned,u.name,u.role,(SELECT COUNT(*) FROM likes l WHERE l.post=p.id) likes,(SELECT COUNT(*) FROM posts r WHERE r.parent=p.id AND r.status='visible') replies,EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.user=?) liked FROM posts p JOIN users u ON u.id=p.author WHERE p.board=? AND p.parent IS ? AND p.status='visible' AND p.created>? ORDER BY p.created ASC,p.id ASC LIMIT 21`).bind(me?.id||'',board,parentId,since).all()).results;
  const pageRows=rows.slice(0,20) as Record<string,unknown>[];const last=pageRows[pageRows.length-1] as {created:number;id:string}|undefined;const more=rows.length>20;const posts=await enrichPosts(pageRows,me?.id||'');return reply({posts,count:rows.length,more,latestCreated:Number(last?.created||after.created),latestId:last?.id||after.id||null,nextAfter:more&&last?afterFor(last):null});
 }
 const sortParam=u.searchParams.get('sort');const selectedSort=sortParam==='helpful'||sortParam==='likes'?sortParam:null;const sort=selectedSort==='helpful'?'(SELECT COUNT(*) FROM helpful h WHERE h.post=p.id) DESC,p.created DESC,p.id DESC':selectedSort==='likes'?'likes DESC,p.created DESC,p.id DESC':'p.created DESC,p.id DESC';
 const cursor=selectedSort?null:readCursor(u.searchParams.get('cursor'));
 const offset=Math.max(0,Math.min(10000,Number(u.searchParams.get('offset'))||0));
 // Keep first paint small on phones. Replies load only after their count is
 // tapped, and the list itself is capped at 20 items per page.
 const result=board?cursor?await db.prepare(`SELECT p.id,p.author,p.board,p.parent,p.body,p.video,p.media_type mediaType,p.media_name mediaName,p.media_size mediaSize,p.media_group mediaGroup,p.created,p.pinned,u.name,u.role,(SELECT COUNT(*) FROM likes l WHERE l.post=p.id) likes,(SELECT COUNT(*) FROM posts r WHERE r.parent=p.id AND r.status='visible') replies,EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.user=?) liked FROM posts p JOIN users u ON u.id=p.author WHERE p.board=? AND p.parent IS ? AND p.status='visible' AND (p.pinned<? OR (p.pinned=? AND (p.created<? OR (p.created=? AND p.id<?)))) ORDER BY p.pinned DESC,p.created DESC,p.id DESC LIMIT 21`).bind(me?.id||'',board,parent,cursor.pinned,cursor.pinned,cursor.created,cursor.created,cursor.id).all():await db.prepare(`SELECT p.id,p.author,p.board,p.parent,p.body,p.video,p.media_type mediaType,p.media_name mediaName,p.media_size mediaSize,p.media_group mediaGroup,p.created,p.pinned,u.name,u.role,(SELECT COUNT(*) FROM likes l WHERE l.post=p.id) likes,(SELECT COUNT(*) FROM posts r WHERE r.parent=p.id AND r.status='visible') replies,EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.user=?) liked FROM posts p JOIN users u ON u.id=p.author WHERE p.board=? AND p.parent IS ? AND p.status='visible' ORDER BY p.pinned DESC,${sort} LIMIT 21 OFFSET ?`).bind(me?.id||'',board,parent,offset).all():{results:[]};
 const statsBase=board?((await db.prepare(`SELECT COALESCE(SUM(CASE WHEN p.video IS NOT NULL OR p.media_type LIKE 'video/%' THEN 1 ELSE 0 END),0) videos,COALESCE(SUM(CASE WHEN p.video IS NULL AND (p.media_type IS NULL OR p.media_type NOT LIKE 'video/%') THEN 1 ELSE 0 END),0) comments,COALESCE(SUM(CASE WHEN p.created>=? AND p.video IS NULL AND (p.media_type IS NULL OR p.media_type NOT LIKE 'video/%') THEN 1 ELSE 0 END),0) todayComments FROM posts p WHERE p.board=? AND p.status='visible'`).bind(jstDayStart(),board).first<{videos:number;comments:number;todayComments:number}>())||{videos:0,comments:0,todayComments:0}):{videos:0,comments:0,todayComments:0};
 const latestRow=board?(await db.prepare("SELECT id,created FROM posts WHERE board=? AND parent IS ? AND status='visible' ORDER BY created DESC,id DESC LIMIT 1").bind(board,parent).first<{id:string;created:number}>()):null;
 const stats:BoardStats={...statsBase,latestCreated:Number(latestRow?.created||0),latestId:latestRow?.id||null};
 const poll=board&&!video?(await db.prepare('SELECT poll,choice,COUNT(*) count FROM votes WHERE board=? GROUP BY poll,choice').bind(board).all()).results:[];
 const mine=me&&board&&!video?(await db.prepare('SELECT poll,choice FROM votes WHERE board=? AND user=?').bind(board,me.id).all()).results:[];
 let publicVideo=null;if(video){const detail=await db.prepare('SELECT p.id,p.author,p.body,p.video,p.pinned,p.media_type mediaType,p.media_name mediaName,p.media_size mediaSize,p.media_group mediaGroup,p.created,u.name,u.role,(SELECT COUNT(*) FROM likes l WHERE l.post=p.id) likes,EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.user=?) liked FROM posts p JOIN users u ON u.id=p.author WHERE p.id=?').bind(me?.id||'',video.id).first();if(detail)publicVideo=(await enrichPosts([detail],me?.id||''))[0];}
 const previousSeen=(await db.prepare('SELECT seen FROM visits WHERE subject=?').bind(sub).first<{seen:number}>())?.seen||0;
 const pageRows=result.results.slice(0,20) as Record<string,unknown>[];const lastRow=pageRows[pageRows.length-1] as {pinned:number;created:number;id:string}|undefined;const nextCursor=!selectedSort&&result.results.length>20&&lastRow?cursorFor(lastRow):null;
 return reply({me,anonymous:session.anonymous,month:requested,boards,board,posts:await enrichPosts(pageRows,me?.id||''),nextCursor,poll,mine,video:publicVideo,stats,previousSeen,viewUntil,flags});
 }catch(e){return error(e);}}
export async function POST(request:Request){try{
 const h=await headers();const origin=h.get('origin');if(!origin||origin!==new URL(request.url).origin||h.get('sec-fetch-site')==='cross-site')throw new Error('forbidden');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('invalid_request');
 const reader=request.body?.getReader();if(!reader)throw new Error('invalid_request');let raw='';const decoder=new TextDecoder();let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();throw new Error('invalid_request');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
 let b:Record<string,unknown>;try{b=JSON.parse(raw);}catch{throw new Error('invalid_request');}if(!b||Array.isArray(b))throw new Error('invalid_request');
 const session=await identity();const sub=session.sub;const reply=(data:unknown,status=200)=>response(data,status,session.setCookie);await limit('write:'+sub,30);const db=database();const now=Date.now();
 if(b.action==='profile'){
  const name=textInput(b.name,30);await limit('profile:'+sub,3);
  // Only the opaque subject injected by the platform and matched against the
  // server-side secret may bind the Owner role. Public request headers such as
  // an email value are never used for privilege escalation.
  const ownerEnv=env as unknown as Record<string,string>;
  const ownerSubject=ownerEnv.BOARD_OWNER_SUBJECT;
  const ownerCandidate=(!!ownerSubject&&sub===ownerSubject)||platformOwnerEnabled(session);
  // The owner secret may be added after the owner has already created a User
  // row. Promote only that verified subject, and only while no other owner is
  // present; a display name or client payload never changes a role.
  await db.prepare("INSERT INTO users(id,subject,name,display_name_set,role,created) VALUES(?,?,?,1,CASE WHEN ? AND NOT EXISTS(SELECT 1 FROM users WHERE role='owner') THEN 'owner' ELSE 'user' END,?) ON CONFLICT(subject) DO UPDATE SET name=excluded.name,display_name_set=1,role=CASE WHEN ? AND users.role='user' AND NOT EXISTS(SELECT 1 FROM users WHERE role='owner' AND subject<>excluded.subject) THEN 'owner' ELSE users.role END").bind(crypto.randomUUID(),sub,name,ownerCandidate?1:0,now,ownerCandidate?1:0).run();return response({ok:true,me:await user(sub)},200,session.setCookie,session.anonymous?[displayNameCookie(name)]:[]);
 }
 if(b.action==='seen'){if(!Number.isSafeInteger(b.until)||Number(b.until)<0||Number(b.until)>now)throw new Error('invalid_request');await db.prepare('INSERT INTO visits(subject,seen) VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET seen=MAX(seen,excluded.seen)').bind(sub,b.until).run();return reply({ok:true});}
 const me=await promoteVerifiedOwner(sub,await ensureUser(sub,session.owner?'LINEレンジャーは神ゲー':session.anonymous?guestName(sub):'ゲスト',session.anonymous?session.displayName:undefined,!!session.owner||!!session.displayName),platformOwnerEnabled(session));if(!me)throw new Error('profile_required');const flags=await loadCommunityFeatureFlags(db);
 if(b.action==='feature_flag'){
  if(me.role!=='owner')throw new Error('forbidden');if(!isCommunityFeatureName(b.name)||typeof b.enabled!=='boolean')throw new Error('invalid_request');
  await db.batch([
   db.prepare('INSERT INTO feature_flags(name,enabled,updated,actor) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET enabled=excluded.enabled,updated=excluded.updated,actor=excluded.actor').bind(b.name,b.enabled?1:0,now,me.id),
   db.prepare('INSERT INTO audit(id,actor,action,target,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),me.id,'feature_flag',`${b.name}:${b.enabled?'enabled':'disabled'}`,now),
  ]);
  return reply({ok:true,name:b.name,enabled:b.enabled});
 }
 if(b.action==='badge'){
  if(me.role!=='owner')throw new Error('forbidden');
  const target=String(b.target||'');const badge=String(b.badge||'');if(!contributionBadges.includes(badge as typeof contributionBadges[number])||typeof b.enabled!=='boolean')throw new Error('invalid_request');
  const targetUser=await db.prepare("SELECT role FROM users WHERE id=? AND role<>'owner'").bind(target).first();if(!targetUser)throw new Error('forbidden');
  const mutation=b.enabled?db.prepare('INSERT OR IGNORE INTO user_badges(user,badge,granted_by,created) VALUES(?,?,?,?)').bind(target,badge,me.id,now):db.prepare('DELETE FROM user_badges WHERE user=? AND badge=?').bind(target,badge);
  await db.batch([mutation,db.prepare('INSERT INTO audit(id,actor,action,target,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),me.id,b.enabled?'badge_grant':'badge_revoke',`${target}:${badge}`,now)]);
  return reply({ok:true,target,badge,enabled:b.enabled});
 }
 if(b.action==='helpful'){requireCommunityFeature(flags,'commentsEnabled');const post=await visiblePost(String(b.post));if(!post)throw new Error('not_found');if(typeof b.selected!=='boolean')throw new Error('invalid_request');await limit('helpful:'+me.id,15);if(b.selected)await db.prepare('INSERT OR IGNORE INTO helpful(post,user,created) VALUES(?,?,?)').bind(post.id,me.id,now).run();else await db.prepare('DELETE FROM helpful WHERE post=? AND user=?').bind(post.id,me.id).run();return reply({ok:true});}
 if(b.action==='report'){const post=await visiblePost(String(b.post));if(!post||post.author===me.id)throw new Error('not_found');await limit('report:'+me.id,6,600);await db.batch([db.prepare('INSERT OR IGNORE INTO post_reports(post,reporter,created) VALUES(?,?,?)').bind(post.id,me.id,now),db.prepare('INSERT INTO audit(id,actor,action,target,created)').bind(crypto.randomUUID(),me.id,'report',post.id,now)]);return reply({ok:true});}
 if(b.action==='post'){
  requireCommunityFeature(flags,'commentsEnabled');
  const board=String(b.board||'');const boardRow=await db.prepare('SELECT id,month,character FROM boards WHERE id=?').bind(board).first<{id:string;month:string;character:string}>();if(!boardRow)throw new Error('not_found');if(boardRow.month!==monthJST())throw new Error('archive_readonly');if(!isConfirmedCharacterForMonth(boardRow.character,boardRow.month))throw new Error('not_found');
  const body=textInput(b.body,2000);const parent=b.parent?String(b.parent):null;const requestId=String(b.request||'');if(!/^[a-f0-9-]{36}$/.test(requestId)||b.video||b.media||b.attachment||b.file)throw new Error('invalid_request');
  const existing=await db.prepare('SELECT id FROM posts WHERE author=? AND request=?').bind(me.id,requestId).first();if(existing)return reply({ok:true,id:existing.id});
  if(parent){
   validateReply(body,null);const p=await visiblePost(parent);if(!p||p.board!==board)throw new Error('text_only');
   // Direct replies are allowed.  A reply to a video comment is also allowed,
   // but another level is rejected so the discussion cannot become an endless
   // tree or accept media/URLs at any reply level.
   if(p.parent){const root=await visiblePost(p.parent);if(!root||!isVideoPost(root)||root.parent)throw new Error('text_only');}
  }
  await limit('post:'+me.id,1,10);if(await db.prepare('SELECT id FROM posts WHERE author=? AND body=? AND created>?').bind(me.id,body,now-60000).first())throw new Error('duplicate_post');
  const id=crypto.randomUUID();await db.prepare("INSERT INTO posts(id,board,author,parent,body,video,status,pinned,created,request) VALUES(?,?,?,?,?,NULL,'visible',0,?,?)").bind(id,board,me.id,parent,body,now,requestId).run();return reply({ok:true,id});
 }
 if(b.action==='vote'){
  requireCommunityFeature(flags,'votingEnabled');
  if(!['strength','pull'].includes(String(b.poll))||!Number.isInteger(b.choice)||Number(b.choice)<0||Number(b.choice)>2)throw new Error('invalid_request');
  const voteBoard=await db.prepare('SELECT id,month,character FROM boards WHERE id=?').bind(String(b.board)).first<{id:string;month:string;character:string}>();if(!voteBoard)throw new Error('not_found');if(voteBoard.month!==monthJST())throw new Error('archive_readonly');if(!isConfirmedCharacterForMonth(voteBoard.character,voteBoard.month))throw new Error('not_found');await limit('vote:'+me.id,6);
  await db.prepare('INSERT INTO votes(board,user,poll,choice) VALUES(?,?,?,?) ON CONFLICT(board,user,poll) DO UPDATE SET choice=excluded.choice').bind(String(b.board),me.id,String(b.poll),Number(b.choice)).run();return reply({ok:true});
 }
 if(b.action==='like'){
  requireCommunityFeature(flags,'commentsEnabled');
  const post=await visiblePost(String(b.post));if(!post)throw new Error('not_found');await limit('like:'+me.id,15);
  if(b.liked===true)await db.prepare('INSERT OR IGNORE INTO likes(post,user,created) VALUES(?,?,?)').bind(post.id,me.id,now).run();else if(b.liked===false)await db.prepare('DELETE FROM likes WHERE post=? AND user=?').bind(post.id,me.id).run();else throw new Error('invalid_request');return reply({ok:true});
 }
 if(b.action==='moderate'){
  const action=String(b.operation);const target=String(b.target);const roleChange=['moderator','user'].includes(action);
  let statement;
  if(roleChange){if(me.role!=='owner')throw new Error('forbidden');const targetUser=await db.prepare('SELECT role FROM users WHERE id=?').bind(target).first();if(!targetUser||targetUser.role==='owner')throw new Error('forbidden');statement=db.prepare("UPDATE users SET role=? WHERE id=? AND role<>'owner'").bind(action,target);}
  else{const post=await db.prepare('SELECT author,video,media_type,status FROM posts WHERE id=?').bind(target).first<{author:string;video:string|null;media_type:string|null;status:string}>();const selfDelete=action==='delete'&&post?.author===me.id;if(!post||post.status==='deleted'||(!selfDelete&&!mayModerate(me.role,action)))throw new Error('forbidden');
   if(['pin','unpin'].includes(action))statement=db.prepare('UPDATE posts SET pinned=? WHERE id=?').bind(action==='pin'?1:0,target);
   else if(['hide','restore','delete'].includes(action))statement=db.prepare('UPDATE posts SET status=?,pinned=0 WHERE id=?').bind(action==='hide'?'hidden':action==='delete'?'deleted':'visible',target);
   else throw new Error('invalid_request');}
  await db.batch([statement,db.prepare('INSERT INTO audit(id,actor,action,target,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),me.id,action,target,now)]);return reply({ok:true});
 }
 throw new Error('invalid_request');
 }catch(e){return error(e);}}
