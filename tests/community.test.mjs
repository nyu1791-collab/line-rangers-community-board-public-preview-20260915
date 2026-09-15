import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
function compile(path,require){const source=readFileSync(new URL(path,root),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('exports','require',code)(exports,require);return exports;}
const rules=compile('lib/rules.ts',()=>{});
const {mediaRange}=compile('lib/media-range.ts',()=>{});
const communitySource=readFileSync(new URL('app/community.tsx',root),'utf8');
const communityCss=readFileSync(new URL('app/community.css',root),'utf8');
const pageSource=readFileSync(new URL('app/page.tsx',root),'utf8');
const lazyImageSource=readFileSync(new URL('app/lazy-image.tsx',root),'utf8');
const videoPlayerSource=readFileSync(new URL('app/video-player.tsx',root),'utf8');
const videoThumbnailSource=readFileSync(new URL('app/video-thumbnail.tsx',root),'utf8');
const activitySource=readFileSync(new URL('lib/community-activity.ts',root),'utf8');
const uploadSessionSource=readFileSync(new URL('lib/upload-session.ts',root),'utf8');
test('media byte ranges support suffixes and reject malformed requests',()=>{
 assert.deepEqual(mediaRange('bytes=-3',10),{start:7,end:9});
 assert.deepEqual(mediaRange('bytes=3-',10),{start:3,end:9});
 assert.deepEqual(mediaRange('bytes=0-99',10),{start:0,end:9});
 assert.deepEqual(mediaRange('bytes=-99',10),{start:0,end:9});
 assert.equal(mediaRange(null,10),null);
 for(const range of ['bytes=-','bytes=-0','bytes=10-','bytes=4-3','bytes=0-1,3-4','bytes=0-999999999999999999999'])assert.throws(()=>mediaRange(range,10));
});
test('comment UI keeps reactions private, opens replies on demand, and marks a selected reply target',()=>{
 assert.doesNotMatch(communitySource,/openReactors|setLikers|translate\.google\.com/);
 assert.match(communitySource,/replyTarget/);assert.match(communitySource,/toggleReplies/);assert.match(communitySource,/返信を表示/);assert.doesNotMatch(communitySource,/translatePost|<Languages/);assert.match(communitySource,/replyingTo/);
 assert.match(communitySource,/media-picker-title/);assert.match(communitySource,/ここをタップ/);assert.match(communitySource,/multiple type="file"/);assert.match(communitySource,/最大5本/);assert.match(communitySource,/新キャラに関する感想・情報/);assert.doesNotMatch(communitySource,/media-picker.*<small>/s);
 assert.match(communitySource,/mine/);assert.match(communitySource,/composer-reply/);assert.match(communitySource,/返信先/);assert.match(communitySource,/権限・バッジ管理（Owner専用）/);assert.match(communitySource,/動画制作貢献者/);assert.match(communitySource,/有益情報貢献者/);assert.match(communitySource,/（運営）/);assert.doesNotMatch(communitySource,/運営バッジ/);assert.match(communitySource,/data\?\.me\?\.role==='owner'/);
 assert.match(communitySource,/line-rangers-display-name/);assert.match(communitySource,/function uiName/);assert.match(communitySource,/匿名ユーザー/);assert.match(communitySource,/uiName\(replyTarget\.name\)/);assert.match(communitySource,/profileRestoreSubject/);assert.match(communitySource,/profileRestoreInFlight/);assert.doesNotMatch(communitySource,/profileRestoreAttempted/);assert.match(communitySource,/運営アクセス/);assert.match(communitySource,/one-time-code/);
 assert.match(communitySource,/\.\.\.\(p\.mine\?\[\]:\['delete'\]\)/);assert.ok(communitySource.indexOf('<p className="post-body">')<communitySource.indexOf('{detail&&(p.video||p.mediaType?.startsWith(\'video/\'))'));
 assert.doesNotMatch(communitySource,/value=\{month\}.*onChange/);
 assert.match(communitySource,/VideoThumbnail id=\{item\.id\}/);assert.match(videoThumbnailSource,/<video/);assert.match(videoThumbnailSource,/\/api\/media/);assert.match(videoThumbnailSource,/IntersectionObserver/);assert.match(videoThumbnailSource,/preload="metadata"/);assert.doesNotMatch(videoThumbnailSource,/autoPlay/);assert.match(videoThumbnailSource,/タップして再生/);assert.match(videoPlayerSource,/preload="metadata"/);assert.match(videoPlayerSource,/onLoadedData/);assert.match(videoPlayerSource,/onError=\{reportFailure\}/);
 assert.match(communityCss,/\.composer\.composer-reply\{position:fixed!important/);assert.match(communityCss,/\.role-owner/);assert.match(communityCss,/border:0!important/);assert.doesNotMatch(pageSource,/\/boards(?:\?|["'])/);assert.doesNotMatch(pageSource,/line-rangers-fan\.github\.io\/line-rangers-pvp/);assert.doesNotMatch(communitySource,/entry-actions|ranking-link|line-rangers-fan\.github\.io\/line-rangers-pvp/);
});
test('comment draft is cleared only after the server confirms the post',()=>{
 const publish=communitySource.slice(communitySource.indexOf('async function publish()'));
 const request=publish.indexOf('await boardRequest');
 const clear=publish.indexOf("if(bodyRef.current.trim()===content)setDraft('')");
 assert.ok(request>=0&&clear>request,'successful draft clear must follow the awaited server request');
 assert.doesNotMatch(publish.slice(0,request),/setDraft\(''\)/,'failed or pending posts must retain the draft');
});
test('video contributor badges are manual only',()=>{
 assert.doesNotMatch(activitySource,/videoAuthors|video_contributor/);
 assert.doesNotMatch(communitySource,/title:'video_contributor'/);
});
test('selected reactions use distinct pink and blue states',()=>{
 assert.match(communitySource,/className=\{p\.liked\?'is-liked':''\}/);
 assert.match(communitySource,/fill=\{p\.liked\?'currentColor':'none'\}/);
 assert.match(communitySource,/className=\{p\.helped\?'is-helpful':''\}/);
 assert.match(communitySource,/fill=\{p\.helped\?'currentColor':'none'\}/);
 assert.match(communityCss,/\.post-actions \.is-liked\{color:#f472b6!important\}/);
 assert.match(communityCss,/\.post-actions \.is-helpful\{color:#60a5fa!important\}/);assert.match(communityCss,/\.video-carousel\{display:flex/);
});
test('interaction UI uses local updates, resumable uploads, and does not reload the board after each action',()=>{
 assert.doesNotMatch(communitySource,/window\.location\.reload|await\s+reload\s*\(/);
 for(const feature of ['toggleLike','toggleHelpful','chooseVote','rollbackLocalPost','resumeForReselectedFile'])assert.match(communitySource,new RegExp(feature));
 assert.doesNotMatch(communitySource,/const \[loading,/);assert.match(communitySource,/initialLoading/);assert.doesNotMatch(communitySource,/translationVersions/);
 assert.match(videoPlayerSource,/preload="metadata"/);assert.doesNotMatch(videoPlayerSource,/preload="auto"/);assert.match(videoPlayerSource,/onLoadedData/);assert.match(videoPlayerSource,/onError={reportFailure}/);
 assert.match(lazyImageSource,/IntersectionObserver/);
});
test('new-character switching requires an explicitly confirmed month and identity',()=>{
 assert.deepEqual(rules.confirmedCharactersForMonth('2026-09').map(character=>character.id),['u1631e-sally']);
 assert.deepEqual(rules.confirmedCharactersForMonth('2026-10'),[]);
 assert.equal(rules.isConfirmedCharacterForMonth('u1631e-sally','2026-09'),true);
 assert.equal(rules.isConfirmedCharacterForMonth('u1631e-sally','2026-10'),false);
 assert.equal(rules.isKnownCharacter('unverified-character'),false);
});
test('abandoned multipart sessions expire after a bounded lifetime',()=>{
 const upload=compile('lib/upload-session.ts',id=>{
  if(id==='@/db/raw')return {};
  if(id==='@/lib/rules')return {};
  if(id==='@/lib/anonymous-session')return {};
  throw new Error('Unexpected upload-session import '+id);
 });
 assert.equal(upload.uploadSessionExpired({created:1000},1000+24*60*60*1000),false);
 assert.equal(upload.uploadSessionExpired({created:1000},1001+24*60*60*1000),true);
 assert.equal(upload.uploadSessionExpired({created:Number.NaN},1000),true);
 assert.match(uploadSessionSource,/uploadSessionMaxAgeMs/);
});
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('drizzle/0000_clumsy_penance.sql',root),'utf8'));sql.exec(readFileSync(new URL('drizzle/0001_talented_gabe_jones.sql',root),'utf8'));
 const db={prepare(query){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);}};},async batch(statements){sql.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 sql.exec(readFileSync(new URL('drizzle/0002_true_purifiers.sql',root),'utf8'));sql.exec(readFileSync(new URL('drizzle/0003_thankful_firestar.sql',root),'utf8'));sql.exec(readFileSync(new URL('drizzle/0004_yummy_warbird.sql',root),'utf8'));sql.exec(readFileSync(new URL('drizzle/0005_bumpy_hellcat.sql',root),'utf8'));sql.exec(readFileSync(new URL('drizzle/0006_quick_zuras.sql',root),'utf8'));sql.exec(readFileSync(new URL('drizzle/0007_overjoyed_scorpion.sql',root),'utf8'));sql.exec(readFileSync(new URL('drizzle/0008_free_phalanx.sql',root),'utf8'));sql.exec(readFileSync(new URL('drizzle/0009_horizontal_media_groups.sql',root),'utf8'));
 const activity=compile('lib/community-activity.ts',()=>({database:()=>db}));
 const featureTypes=compile('lib/community-features.ts',()=>{});
 const flags=compile('lib/community-flags.ts',id=>{
  if(id==='@/db/raw')return {database:()=>db};
  if(id==='@/lib/community-features')return featureTypes;
  throw new Error('Unexpected flag import '+id);
 });
 const requestContext=new AsyncLocalStorage();
 const anonymous=compile('lib/anonymous-session.ts',id=>{
  if(id==='cloudflare:workers')return {env:{BOARD_ANON_COOKIE_SECRET:'test-anon-cookie-secret-0123456789012345',BOARD_OWNER_SUBJECT:'owner-subject',BOARD_OWNER_ACCESS_TOKEN:'test-owner-access-token'}};
  throw new Error('Unexpected anonymous import '+id);
 });
 const api=compile('app/api/board/route.ts',id=>{
  if(id==='next/headers')return {headers:async()=>requestContext.getStore().headers};
  if(id==='cloudflare:workers')return {env:{BOARD_OWNER_EMAIL:'owner@example.invalid',BOARD_OWNER_SUBJECT:'owner-subject',BOARD_OWNER_ACCESS_TOKEN:'test-owner-access-token',BOARD_ANON_COOKIE_SECRET:'test-anon-cookie-secret-0123456789012345'}};
  if(id==='@/db/raw')return {database:()=>db};
  if(id==='@/lib/rules')return rules;
  if(id==='@/lib/community-activity')return activity;
  if(id==='@/lib/community-flags')return flags;
  if(id==='@/lib/community-features')return featureTypes;
  if(id==='@/lib/anonymous-session')return anonymous;
  throw new Error('Unexpected import '+id);
 });
 const call=async(body=null,who='test-a',path='',email='test@example.invalid',origin='https://review.example',cookie='')=>{
  const request=new Request('https://review.example/api/board'+path,{method:body?'POST':'GET',headers:{...(who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':email}:{}),...(cookie?{cookie}:{}),origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return requestContext.run(request,async()=>{const r=await (body?api.POST(request):api.GET(request));return {status:r.status,data:await r.json(),headers:r.headers};});};
 return {sql,call,anonymous,clearLimits(){sql.exec('DELETE FROM limits');}};
}
test('JST month boundaries and leap/year transitions',()=>{
 assert.equal(rules.monthJST(new Date('2026-09-30T14:59:59Z')),'2026-09');assert.equal(rules.monthJST(new Date('2026-09-30T15:00:00Z')),'2026-10');assert.equal(rules.monthJST(new Date('2026-12-31T15:00:00Z')),'2027-01');assert.equal(rules.monthJST(new Date('2028-02-29T15:00:00Z')),'2028-03');assert.equal(rules.validMonth('2026-13'),false);
});
test('media types are explicitly allowlisted and video type is preserved',()=>{
 assert.equal(rules.mediaExtension('image/jpeg'),'jpg');assert.equal(rules.mediaExtension('video/mp4'),'mp4');assert.equal(rules.mediaExtension('image/svg+xml'),null);assert.equal(rules.isVideoMedia('video/quicktime'),true);assert.equal(rules.isVideoMedia('image/png'),false);
 assert.equal(rules.maxMediaBytes,200*1024*1024);assert.equal(rules.mediaPartBytes,8*1024*1024);assert.equal(rules.mediaPartCount(8*1024*1024),1);assert.equal(rules.mediaPartCount(8*1024*1024+1),2);assert.equal(rules.mediaPartCount(rules.maxMediaBytes),25);assert.ok(rules.mediaPartCount(rules.maxMediaBytes)*rules.mediaPartAttempts<=rules.uploadPartLimit);assert.equal(rules.uploadPartWindowSeconds,10*60);
});
test('video replies reject URLs, media, embeds; plain text remains valid',()=>{
 for(const text of ['https://example.com','www.example.com','<img src=x>','[x](video)','youtu.be/abcdefghijk','watch.example.xyz/path'])assert.throws(()=>rules.validateReply(text,null));assert.throws(()=>rules.validateReply('Hello','https://youtu.be/abcdefghijk'));assert.doesNotThrow(()=>rules.validateReply('とても参考になりました。',null));
});
test('permission matrix does not grant management based on a name',()=>{
 assert.equal(rules.mayModerate('user','pin',false),false);assert.equal(rules.mayModerate('moderator','moderator',false),false);assert.equal(rules.mayModerate('moderator','delete',true),true);assert.equal(rules.mayModerate('moderator','delete',false),true);assert.equal(rules.mayModerate('owner','delete',true),true);
});
test('public browsing and anonymous mutations work while cross-origin writes fail closed',async()=>{
 const {call}=setup();const guest=await call(null,'');assert.equal(guest.status,200);assert.equal(guest.data.me.role,'user');assert.match(guest.data.me.name,/^ゲスト-/);const cookie=guest.headers.get('set-cookie');assert.match(cookie??'',/^__Host-lr_guest=v1\./);const same=await call(null,'','','test@example.invalid','https://review.example',cookie);assert.equal(same.data.me.id,guest.data.me.id);const forged=cookie.replace(/(v1\.[^;]+\.)[^;]+/,'$1x');const rotated=await call(null,'','','test@example.invalid','https://review.example',forged);assert.equal(rotated.status,200);assert.notEqual(rotated.data.me.id,guest.data.me.id);assert.match(rotated.headers.get('set-cookie')??'',/^__Host-lr_guest=v1\./);const profile=await call({action:'profile',name:'hello'},'','','test@example.invalid','https://review.example',cookie);assert.equal(profile.status,200);const profileCookie=profile.headers.get('set-cookie')??'';assert.match(profileCookie,/__Host-lr_display_name=hello/);const savedNameCookie=(profileCookie.match(/__Host-lr_display_name=[^,]+/)||[''])[0];const restored=await call(null,'','','test@example.invalid','https://review.example',savedNameCookie);assert.equal(restored.data.me.name,'hello');assert.equal((await call({action:'profile',name:'hello'},'a','','x','https://evil.example')).status,403);assert.equal((await call({action:'profile',name:'hello'},'')).status,200);
});
test('owner activation exchanges a private access key for a signed cookie without login',async()=>{
 const {call,anonymous}=setup();const activated=await anonymous.activateOwner('test-owner-access-token');assert.ok(activated);assert.match(activated.setCookie,/^__Host-lr_owner=o1\.[0-9]+\./);
 const session=await anonymous.sessionFromHeaders(new Headers({cookie:activated.setCookie}));assert.equal(session.owner,true);assert.equal(session.sub,'owner-subject');
 const owner=await call(null,'','','owner@example.invalid','https://review.example',activated.setCookie);assert.equal(owner.status,200);assert.equal(owner.data.me.role,'owner');assert.equal(owner.data.me.name,'LINEレンジャーは神ゲー');
 assert.equal(await anonymous.activateOwner('wrong-token'),null);
});
test('profile rename preserves identity and never grants owner via display name or payload',async()=>{
 const {call}=setup();await call({action:'profile',name:'運営',role:'owner'});const first=(await call()).data.me;assert.equal(first.role,'user');await call({action:'profile',name:'new name'});const second=(await call()).data.me;assert.equal(first.id,second.id);assert.equal(second.name,'new name');
});
test('only the first verified owner subject is bound as Owner',async()=>{
 const {call}=setup();await call({action:'profile',name:'Owner'},'owner-subject','', 'owner@example.invalid');await call({action:'profile',name:'Impersonator'},'owner-b','', 'owner@example.invalid');
 assert.equal((await call(null,'owner-subject','', 'owner@example.invalid')).data.me.role,'owner');
 assert.equal((await call(null,'owner-b','', 'owner@example.invalid')).data.me.role,'user');
});
test('opaque owner subject can bootstrap the Owner without exposing an email',async()=>{
 const {call}=setup();await call({action:'profile',name:'Owner'},'owner-subject','','different@example.invalid');assert.equal((await call(null,'owner-subject','','different@example.invalid')).data.me.role,'owner');
});
test('adding the owner secret later safely promotes only the verified subject',async()=>{
 const {call}=setup();await call({action:'profile',name:'Owner'},'owner-later','','different@example.invalid');
 const spoofed=(await call({action:'profile',name:'Owner renamed'},'owner-later','','owner@example.invalid')).data.me;
 assert.equal(spoofed.role,'user');assert.equal(spoofed.name,'Owner renamed');
 const other=(await call({action:'profile',name:'Other'},'owner-b','','owner@example.invalid')).data.me;assert.equal(other.role,'user');
});
test('a verified owner is promoted on read without requiring a profile edit',async()=>{
 const {call,sql}=setup();sql.prepare('INSERT INTO users(id,subject,name,role,created) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),'owner-subject','Existing Owner','user',Date.now());
 const result=await call(null,'owner-subject','','different@example.invalid');assert.equal(result.status,200);assert.equal(result.data.me.role,'owner');
});
test('owner-only feature flags keep reads available and enforce read-only writes server-side',async()=>{
 const {call,sql}=setup();await call({action:'profile',name:'Owner'},'owner-subject','','owner@example.invalid');await call({action:'profile',name:'Member'},'member','','member@example.invalid');
 const initial=(await call(null,'owner-subject','','owner@example.invalid')).data;assert.deepEqual(initial.flags,{commentsEnabled:true,videoUploadEnabled:true,translationEnabled:true,votingEnabled:true,readOnly:false});
 const memberToggle=await call({action:'feature_flag',name:'commentsEnabled',enabled:false},'member','','member@example.invalid');assert.equal(memberToggle.status,403);
 const disabled=await call({action:'feature_flag',name:'commentsEnabled',enabled:false},'owner-subject','','owner@example.invalid');assert.equal(disabled.status,200);assert.deepEqual(disabled.data,{ok:true,name:'commentsEnabled',enabled:false});
 const stoppedPost=await call({action:'post',board:initial.board,body:'Blocked while comments are disabled',request:crypto.randomUUID()},'owner-subject','','owner@example.invalid');assert.equal(stoppedPost.status,503);assert.equal(stoppedPost.data.error,'feature_disabled');
 assert.equal((await call({action:'feature_flag',name:'commentsEnabled',enabled:true},'owner-subject','','owner@example.invalid')).status,200);
 const posted=await call({action:'post',board:initial.board,body:'Existing content remains readable',request:crypto.randomUUID()},'owner-subject','','owner@example.invalid');assert.equal(posted.status,200);
 assert.equal((await call({action:'feature_flag',name:'readOnly',enabled:true},'owner-subject','','owner@example.invalid')).status,200);
 const readable=await call(null,'owner-subject','','owner@example.invalid');assert.equal(readable.status,200);assert.equal(readable.data.posts.length,1);assert.equal(readable.data.flags.readOnly,true);
 for(const action of [
  {action:'post',board:initial.board,body:'Blocked by read only',request:crypto.randomUUID()},
  {action:'like',post:posted.data.id,liked:true},
  {action:'helpful',post:posted.data.id,selected:true},
  {action:'vote',board:initial.board,poll:'strength',choice:0},
 ]){const result=await call(action,'owner-subject','','owner@example.invalid');assert.equal(result.status,503);assert.equal(result.data.error,'read_only');}
 assert.equal((await call({action:'feature_flag',name:'readOnly',enabled:false},'owner-subject','','owner@example.invalid')).status,200);
 assert.throws(()=>sql.prepare('INSERT INTO feature_flags(name,enabled,updated) VALUES(?,?,?)').run('commentsEnabled',1,Date.now()));
 assert.ok(sql.prepare("SELECT COUNT(*) n FROM audit WHERE action='feature_flag'").get().n>=4);
});
test('archived month boards remain visible even when not in the current confirmed topic list',async()=>{
 const {call,sql}=setup();sql.prepare('INSERT INTO boards(id,month,character,name,image) VALUES(?,?,?,?,?)').run('2026-08:archived-character','2026-08','archived-character','Archived Ranger','https://example.invalid/archived.png');await call({action:'profile',name:'Archive reader'},'archive-reader','','archive@example.invalid');
 const result=await call(null,'archive-reader','', 'archive@example.invalid');
 const archived=await call(null,'archive-reader','?month=2026-08','archive@example.invalid');
 assert.equal(result.status,200);assert.deepEqual(archived.data.boards.map(b=>b.id),['2026-08:archived-character']);
 const blockedPost=await call({action:'post',board:'2026-08:archived-character',body:'Archived write',request:crypto.randomUUID()},'archive-reader','','archive@example.invalid');assert.equal(blockedPost.status,409);assert.equal(blockedPost.data.error,'archive_readonly');
 const blockedVote=await call({action:'vote',board:'2026-08:archived-character',poll:'strength',choice:0},'archive-reader','','archive@example.invalid');assert.equal(blockedVote.status,409);assert.equal(blockedVote.data.error,'archive_readonly');
 sql.prepare('INSERT INTO boards(id,month,character,name,image) VALUES(?,?,?,?,?)').run('2026-09:unconfirmed-character','2026-09','unconfirmed-character','Unconfirmed Ranger','https://example.invalid/unconfirmed.png');
 const unconfirmedVote=await call({action:'vote',board:'2026-09:unconfirmed-character',poll:'strength',choice:0},'archive-reader','','archive@example.invalid');assert.equal(unconfirmedVote.status,404);assert.equal(unconfirmedVote.data.error,'not_found');
});
test('poll upsert keeps a single vote per user on the selected evolution board',async()=>{
 const {call}=setup();await call({action:'profile',name:'Tester'});const data=(await call()).data;assert.equal(data.boards.length,1);const id=data.boards[0].id;
 for(const choice of [0,1,2])assert.equal((await call({action:'vote',board:id,poll:'strength',choice})).status,200);
 const result=(await call()).data;assert.equal(result.poll.reduce((n,r)=>n+r.count,0),1);assert.equal(result.mine[0].choice,2);assert.equal((await call({action:'vote',board:id,poll:'strength',choice:8})).status,400);
});
test('posts persist, idempotent retry does not duplicate, and reaction names are private',async()=>{
 const {call}=setup();await call({action:'profile',name:'Tester'});const board=(await call()).data.board;const p={action:'post',board,body:'<script>alert(1)</script> is stored as text',request:crypto.randomUUID()};const first=await call(p);assert.equal(first.status,200);assert.equal((await call(p)).data.id,first.data.id);
 for(let i=0;i<2;i++)assert.equal((await call({action:'like',post:first.data.id,liked:true})).status,200);
 const result=(await call()).data;assert.equal(result.posts.length,1);assert.equal(result.posts[0].likes,1);assert.equal(result.posts[0].body,p.body);assert.equal((await call(null,'test-a','?likers='+first.data.id)).status,404);
});
test('users can delete only their own posts while moderation rules remain server-side',async()=>{
 const {call}=setup();await call({action:'profile',name:'Tester'});const board=(await call()).data.board;const own=(await call({action:'post',board,body:'自分で削除する投稿',request:crypto.randomUUID()})).data.id;
 assert.equal((await call({action:'moderate',operation:'delete',target:own})).status,200);assert.equal((await call()).data.posts.length,0);
});
test('JSON posts reject legacy video URLs and cap video comment replies at one nested level',async()=>{
 const {call,sql,clearLimits}=setup();await call({action:'profile',name:'Tester'});const state=(await call()).data;const parent=crypto.randomUUID();
 sql.prepare("INSERT INTO posts(id,board,author,parent,body,video,media_key,media_type,media_name,media_size,status,pinned,created,request) VALUES(?,?,?,NULL,?,NULL,?,?,?,?, 'visible',0,?,?)").run(parent,state.board,state.me.id,'Attached video','media/test.mp4','video/mp4','test.mp4',10,Date.now(),crypto.randomUUID());
 assert.equal((await call({action:'post',board:state.board,body:'Legacy URL',video:'https://youtu.be/abcdefghijk',request:crypto.randomUUID()})).data.error,'invalid_request');clearLimits();
 const reply=await call({action:'post',board:state.board,parent,body:'Thanks for sharing',request:crypto.randomUUID()});assert.equal(reply.status,200);clearLimits();
 const nested=await call({action:'post',board:state.board,parent:reply.data.id,body:'I agree',request:crypto.randomUUID()});assert.equal(nested.status,200);clearLimits();
 assert.equal((await call({action:'post',board:state.board,parent:nested.data.id,body:'Fourth layer',request:crypto.randomUUID()})).data.error,'text_only');
 assert.deepEqual((await call(null,'test-a','?replies='+parent)).data.posts.map(p=>p.id),[reply.data.id]);assert.deepEqual((await call(null,'test-a','?replies='+reply.data.id)).data.posts.map(p=>p.id),[nested.data.id]);
});
test('server moderation, owner-only role changes and audit records',async()=>{
 const {call,sql,clearLimits}=setup();await call({action:'profile',name:'Owner'},'owner-subject','','owner@example.invalid');await call({action:'profile',name:'Member'});const member=(await call()).data.me;const board=(await call()).data.board;const post=(await call({action:'post',board,body:'Review',request:crypto.randomUUID()})).data.id;
 assert.equal((await call({action:'moderate',operation:'pin',target:post})).status,403);
 assert.equal((await call({action:'moderate',operation:'moderator',target:member.id},'owner-subject')).status,200);assert.equal((await call({action:'moderate',operation:'pin',target:post})).status,200);
 assert.equal((await call({action:'moderate',operation:'moderator',target:member.id})).status,403);
 assert.equal((await call({action:'moderate',operation:'hide',target:post})).status,200);assert.equal((await call()).data.posts.length,0);assert.equal((await call(null,'test-a','?likers='+post)).status,404);
 clearLimits();assert.equal((await call({action:'moderate',operation:'restore',target:post})).status,200);assert.equal((await call()).data.posts.length,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM audit').get().n,4);
});
test('owner-only badges stay separate from roles and moderators can manage videos',async()=>{
 const {call,sql,clearLimits}=setup();await call({action:'profile',name:'Owner'},'owner-subject','','owner@example.invalid');await call({action:'profile',name:'Member'},'member','','member@example.invalid');
 const ownerState=(await call(null,'owner-subject','','owner@example.invalid')).data;const memberState=(await call(null,'member','','member@example.invalid')).data;
 assert.equal((await call({action:'badge',target:memberState.me.id,badge:'helpful_contributor',enabled:true},'member','','member@example.invalid')).status,403);
 assert.equal((await call({action:'badge',target:memberState.me.id,badge:'helpful_contributor',enabled:true},'owner-subject','','owner@example.invalid')).status,200);
 const textPost=(await call({action:'post',board:ownerState.board,body:'Useful information',request:crypto.randomUUID()},'member','','member@example.invalid')).data.id;
 const listed=(await call(null,'member','','member@example.invalid')).data.posts.find(p=>p.id===textPost);assert.deepEqual(listed.badges,['helpful_contributor']);
 const admin=(await call(null,'owner-subject','?admin=1','owner@example.invalid')).data;assert.deepEqual(admin.users.find(u=>u.id===memberState.me.id).badges,['helpful_contributor']);
 clearLimits();assert.equal((await call({action:'moderate',operation:'moderator',target:memberState.me.id},'owner-subject','','owner@example.invalid')).status,200);
 const video=crypto.randomUUID();sql.prepare("INSERT INTO posts(id,board,author,parent,body,video,media_key,media_type,media_name,media_size,status,pinned,created,request) VALUES(?,?,?,NULL,?,NULL,?,?,?,?, 'visible',0,?,?)").run(video,ownerState.board,memberState.me.id,'Uploaded video',`media/${video}`,'video/mp4','clip.mp4',100,Date.now(),crypto.randomUUID());
 clearLimits();assert.equal((await call({action:'moderate',operation:'delete',target:video},'member','','member@example.invalid')).status,200);assert.equal(sql.prepare("SELECT status FROM posts WHERE id=?").get(video).status,'deleted');
});
test('Owner permission list includes named loginless users but excludes anonymous sessions',async()=>{
 const {call}=setup();
 const owner=await call({action:'profile',name:'Owner'},'owner-subject','','owner@example.invalid');assert.equal(owner.status,200);
 const named=await call({action:'profile',name:'名前ありユーザー'},'');assert.equal(named.status,200);
 const anonymous=await call(null,'');assert.equal(anonymous.status,200);assert.match(anonymous.data.me.name,/^ゲスト-/);
 const admin=(await call(null,'owner-subject','?admin=1','owner@example.invalid')).data;
 assert.ok(admin.users.some(u=>u.name==='名前ありユーザー'));
 assert.ok(!admin.users.some(u=>/^ゲスト-/.test(u.name)));
});
test('legacy named profiles remain manageable without exposing generated guest labels',async()=>{
 const {call,sql}=setup();
 await call({action:'profile',name:'Owner'},'owner-subject','','owner@example.invalid');
 const legacyNamed=crypto.randomUUID();const legacyGuest=crypto.randomUUID();
 sql.prepare('INSERT INTO users(id,subject,name,role,created) VALUES(?,?,?,?,?)').run(legacyNamed,'legacy-named','保存済みの名前','user',Date.now());
 sql.prepare('INSERT INTO users(id,subject,name,role,created) VALUES(?,?,?,?,?)').run(legacyGuest,'legacy-guest','ゲスト-ABCD','user',Date.now());
 const admin=(await call(null,'owner-subject','?admin=1','owner@example.invalid')).data;
 assert.ok(admin.users.some(u=>u.id===legacyNamed));assert.ok(!admin.users.some(u=>u.id===legacyGuest));
});
test('server enforces bounded burst limits',async()=>{
 const {call}=setup();for(let i=0;i<3;i++)assert.equal((await call({action:'profile',name:'A'})).status,200);assert.equal((await call({action:'profile',name:'A'})).status,429);
});
test('helpful reactions are unique, removable, separate from likes, and names stay private',async()=>{
 const {call}=setup();await call({action:'profile',name:'Reader'});const board=(await call()).data.board;
 const post=(await call({action:'post',board,body:'A useful review',request:crypto.randomUUID()})).data.id;
 for(let i=0;i<2;i++)assert.equal((await call({action:'helpful',post,selected:true})).status,200);
 const row=(await call(null,'test-a','?sort=helpful')).data.posts[0];assert.equal(row.helpful,1);assert.equal(row.helped,true);assert.equal(row.likes,0);assert.equal('author' in row,false);
 assert.equal((await call(null,'test-a','?helpers='+post)).status,404);
 assert.equal((await call({action:'helpful',post,selected:false})).status,200);assert.equal((await call()).data.posts[0].helpful,0);
});
test('root comments can receive one direct text reply',async()=>{
 const {call,clearLimits}=setup();await call({action:'profile',name:'Author'});const board=(await call()).data.board;const root=(await call({action:'post',board,body:'Top-level review',request:crypto.randomUUID()})).data.id;
 clearLimits();const reply=await call({action:'post',board,parent:root,body:'Direct reply',request:crypto.randomUUID()});assert.equal(reply.status,200);
 assert.deepEqual((await call(null,'test-a','?replies='+root)).data.posts.map(p=>p.body),['Direct reply']);
});
test('initial board page uses a stable cursor after twenty posts and keeps offset only for ranked sorts',async()=>{
 const {call,sql}=setup();await call({action:'profile',name:'Author'});const state=(await call()).data;const now=Date.now();
 for(let i=0;i<21;i++)sql.prepare("INSERT INTO posts(id,board,author,parent,body,video,status,pinned,created,request) VALUES(?,?,?,NULL,?,NULL,'visible',0,?,?)").run(crypto.randomUUID(),state.board,state.me.id,'Post '+i,now+i,crypto.randomUUID());
 const first=(await call()).data;assert.equal(first.posts.length,20);assert.equal(first.stats.comments,21);assert.match(first.nextCursor,/^[01]:\d+:[a-f0-9-]{36}$/);
 const second=(await call(null,'test-a','?cursor='+encodeURIComponent(first.nextCursor))).data;assert.equal(second.posts.length,1);assert.equal(second.nextCursor,null);
 assert.equal((await call(null,'test-a','?cursor=2:1:'+crypto.randomUUID())).status,400);
 assert.equal((await call(null,'test-a','?sort=likes&offset=20')).data.posts.length,1);
});
test('new-post checks return only records after the caller cursor and preserve exact board activity',async()=>{
 const {call,sql}=setup();await call({action:'profile',name:'Author'});const initial=(await call()).data;const created=Date.now();
 sql.prepare("INSERT INTO posts(id,board,author,parent,body,video,status,pinned,created,request) VALUES(?,?,?,NULL,?,NULL,'visible',0,?,?)").run(crypto.randomUUID(),initial.board,initial.me.id,'Fresh board comment',created,crypto.randomUUID());
 const newer=(await call(null,'test-a','?newerThan='+initial.stats.latestCreated)).data;
 assert.equal(newer.posts.length,1);assert.equal(newer.count,1);assert.equal(newer.posts[0].body,'Fresh board comment');assert.equal(newer.latestCreated,created);
});
test('new-post cursor keeps same-timestamp records addressable by id',async()=>{
 const {call,sql}=setup();await call({action:'profile',name:'Author'});const initial=(await call()).data;const created=Date.now();
 const firstId='00000000-0000-4000-8000-000000000001';sql.prepare("INSERT INTO posts(id,board,author,parent,body,video,status,pinned,created,request) VALUES(?,?,?,NULL,?,NULL,'visible',0,?,?)").run(firstId,initial.board,initial.me.id,'Same-time first',created,crypto.randomUUID());
 const state=(await call()).data;const cursor=`${state.stats.latestCreated}.${state.stats.latestId}`;const secondId='00000000-0000-4000-8000-000000000002';sql.prepare("INSERT INTO posts(id,board,author,parent,body,video,status,pinned,created,request) VALUES(?,?,?,NULL,?,NULL,'visible',0,?,?)").run(secondId,initial.board,initial.me.id,'Same-time second',created,crypto.randomUUID());
 const newer=(await call(null,'test-a','?after='+encodeURIComponent(cursor))).data;assert.equal(newer.posts.length,1);assert.equal(newer.posts[0].body,'Same-time second');
});
test('read marker is persistent, monotonic and rejects future timestamps',async()=>{
 const {call}=setup();const before=(await call()).data;assert.equal(before.previousSeen,0);
 assert.equal((await call({action:'seen',until:before.viewUntil})).status,200);
 assert.equal((await call({action:'seen',until:before.viewUntil-1000})).status,200);
 assert.equal((await call()).data.previousSeen,before.viewUntil);
 assert.equal((await call({action:'seen',until:Date.now()+60000})).status,400);
});
