export const languages = ['ja','en','zh','ko','th','id','vi'] as const;
export type Language = typeof languages[number];
export function requestUUID(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const s=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
export function monthJST(now = new Date()) { return new Date(now.getTime()+9*3600000).toISOString().slice(0,7); }
export function validMonth(value: unknown): value is string { return typeof value==='string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value); }
export function textInput(value: unknown, max: number) {
  if (typeof value!=='string') throw new Error('invalid_text');
  const s=value.normalize('NFC').trim();
  if (!s || [...s].length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) throw new Error('invalid_text');
  return s;
}
export function optionalTextInput(value: unknown, max: number) {
  if (typeof value!=='string') throw new Error('invalid_text');
  const s=value.normalize('NFC').trim();
  if ([...s].length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) throw new Error('invalid_text');
  return s;
}
// Large uploads are sent in R2 multipart chunks. Keeping each request at 8 MiB
// avoids buffering a long phone video inside the Worker while allowing a practical
// 200 MiB evaluation upload without making uploads unlimited.
export const maxMediaBytes=200*1024*1024;
export const mediaPartBytes=8*1024*1024;
export const legacyMultipartMediaBytes=12*1024*1024;
// A maximum-size video uses 25 parts. Each part can retry three times, with
// room for an ordinary recovery retry while keeping a bounded per-user
// upload allowance.
export const mediaPartAttempts=3;
export const uploadPartLimit=100;
export const uploadPartWindowSeconds=10*60;
// A direct video request without a Range header must never turn into a full
// 200 MB response. The player can request later ranges as it buffers/seeks.
export const videoInitialRangeBytes=4*1024*1024;
export function mediaPartCount(size:number){return Math.ceil(size/mediaPartBytes);}
const mediaExtensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
export function mediaExtension(type:string){return mediaExtensions[type]||null;}
export function isVideoMedia(type:string|null|undefined){return !!type&&type.startsWith('video/');}
export function validMediaHeader(type:string, bytes:Uint8Array){
  const starts=(...values:number[])=>values.every((v,i)=>bytes[i]===v);
  const ftyp=bytes[4]===0x66&&bytes[5]===0x74&&bytes[6]===0x79&&bytes[7]===0x70;
  return type==='image/jpeg'?starts(0xff,0xd8,0xff):type==='image/png'?starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a):type==='image/gif'?(starts(0x47,0x49,0x46,0x38,0x37,0x61)||starts(0x47,0x49,0x46,0x38,0x39,0x61)):type==='image/webp'?(starts(0x52,0x49,0x46,0x46)&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50):type==='video/webm'?starts(0x1a,0x45,0xdf,0xa3):ftyp;
}
export async function validateMedia(file:File, limit=maxMediaBytes){
  const extension=mediaExtension(file.type);if(!extension||file.size<32||file.size>limit)throw new Error('invalid_media');
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
  if(!validMediaHeader(file.type,bytes))throw new Error('invalid_media');return extension;
}
export function validateReply(body: string, attachment: unknown) {
  // Video-detail replies are deliberately plain text.  Reject both full URLs
  // and bare domain-like text so a link cannot be smuggled in without a scheme.
  if(attachment || /(?:https?:|ftp:|www\.|youtu\.?be|<[^>]*>|\]\(|(?:^|\s)(?:[a-z0-9-]+\.)+[a-z]{2,63}(?:[/?#:]|\s|$))/i.test(body)) throw new Error('text_only');
}
export type Role='user'|'moderator'|'owner';
export const contributionBadges=['video_contributor','helpful_contributor'] as const;
export type ContributionBadge=typeof contributionBadges[number];
export function mayModerate(role:Role, action:string){
  if(role==='owner')return ['pin','unpin','hide','restore','delete','moderator','user'].includes(action);
  // Moderators may manage any visible post, including uploaded videos. Role
  // checks happen again in the API; contribution badges are presentation only.
  return role==='moderator' && ['pin','unpin','hide','restore','delete'].includes(action);
}
// Confirmed identity mappings from the existing production image registry.
// These are evaluation topics, NOT inferred release dates.
export type CharacterTopic={id:string;name:string;image:string;releaseMonth:string;confirmed:boolean};
// A topic is shown only after its exact ID, image and JST release month are
// explicitly verified. A calendar change by itself never switches the board.
export const characters:readonly CharacterTopic[]=[
 {id:'u1631e-sally',name:'かに座 サリー',image:'https://line-rangers-fan.github.io/line-rangers-pvp/assets/characters/u1631e-sally.png',releaseMonth:'2026-09',confirmed:true},
];
export function confirmedCharactersForMonth(month:string){return characters.filter(character=>character.confirmed&&character.releaseMonth===month);}
export function isKnownCharacter(id:string){return characters.some(character=>character.id===id);}
export function isConfirmedCharacterForMonth(id:string,month:string){return confirmedCharactersForMonth(month).some(character=>character.id===id);}
