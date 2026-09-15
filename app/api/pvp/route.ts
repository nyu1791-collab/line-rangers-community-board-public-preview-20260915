import {confirmedCharactersForMonth,monthJST,validMonth} from '@/lib/rules';

export const dynamic='force-dynamic';

// The board reads the PvP repository's published snapshot through this small
// server-side adapter.  The browser never receives the 1MB+ source JSON, and
// the board cannot write to the PvP data set.
const SOURCE_URL='https://raw.githubusercontent.com/line-rangers-fan/line-rangers-pvp/main/docs/data/character_usage.json';
const CACHE_TTL_MS=60_000;
const STALE_TTL_MS=5*60_000;
const cache=new Map<string,{data:PvpResponse;expires:number;staleUntil:number}>();

type EquipmentItem={itemCode:string;image:string|null;rank:number;occurrenceCount:number;playerCount:number;adoptionRate:number};
type EquipmentGroup={equippedOccurrenceCount:number;equippedPlayerCount:number;items:EquipmentItem[]};
type PvpResponse={status:'fresh'|'stale';source:'pvp_character_usage';month:string;character:{unitCode:string;name:string;image:string;rank:number;occurrenceCount:number;playerCount:number;adoptionRate:number;slotRate:number;equipmentRankings:Record<string,EquipmentGroup>};snapshot:{updatedAt:string;targetPlayers:number;sampledPlayers:number;completeTarget:boolean;collectionQuality:number|null}};
type JsonRecord=Record<string,unknown>;

function number(value:unknown,fallback=0){return typeof value==='number'&&Number.isFinite(value)?value:fallback;}
function integer(value:unknown,fallback=0){const result=number(value,fallback);return Number.isSafeInteger(result)?result:fallback;}
function safeHttpsImage(value:unknown){if(typeof value!=='string')return null;try{const url=new URL(value);if(url.protocol!=='https:')return null;if(!['rangers.lerico.net','line-rangers-fan.github.io'].includes(url.hostname))return null;return url.toString();}catch{return null;}}
function compactEquipment(value:unknown):Record<string,EquipmentGroup>{
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const output:Record<string,EquipmentGroup>={};
 for(const [slot,raw] of Object.entries(value as JsonRecord)){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
  const group=raw as JsonRecord;
  const items=Array.isArray(group.items)?group.items.slice(0,5).flatMap(item=>{
   if(!item||typeof item!=='object'||Array.isArray(item))return [];
   const row=item as JsonRecord;const itemCode=typeof row.item_code==='string'?row.item_code:'';
   if(!itemCode)return [];
   return [{itemCode,image:safeHttpsImage(row.image),rank:integer(row.rank),occurrenceCount:integer(row.occurrence_count),playerCount:integer(row.player_count),adoptionRate:number(row.adoption_rate)}];
  }):[];
  output[slot]={equippedOccurrenceCount:integer(group.equipped_occurrence_count),equippedPlayerCount:integer(group.equipped_player_count),items};
 }
 return output;
}
function compactSnapshot(raw:unknown,month:string,topic:{id:string;name:string;image:string}) : PvpResponse|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const root=raw as JsonRecord;const characters=Array.isArray(root.characters)?root.characters:[];
 const record=characters.find(item=>item&&typeof item==='object'&&!Array.isArray(item)&&(item as JsonRecord).unit_code===topic.id) as JsonRecord|undefined;
 if(!record)return null;
 const quality=root.collection_quality&&typeof root.collection_quality==='object'&&!Array.isArray(root.collection_quality)?(root.collection_quality as JsonRecord).sample_coverage:null;
 const collectionQuality=typeof quality==='number'&&Number.isFinite(quality)?quality:null;
 return {status:'fresh',source:'pvp_character_usage',month,character:{unitCode:topic.id,name:topic.name,image:topic.image,rank:integer(record.rank),occurrenceCount:integer(record.occurrence_count),playerCount:integer(record.player_count),adoptionRate:number(record.adoption_rate),slotRate:number(record.slot_rate),equipmentRankings:compactEquipment(record.equipment_rankings)},snapshot:{updatedAt:typeof root.updated_at==='string'?root.updated_at:'',targetPlayers:integer(root.target_players),sampledPlayers:integer(root.sampled_players),completeTarget:root.complete_target===true,collectionQuality}};
}
function json(data:unknown,status=200,cacheControl='public, max-age=60, stale-while-revalidate=300'){
 return Response.json(data,{status,headers:{'Cache-Control':cacheControl,'X-Content-Type-Options':'nosniff','Vary':'Accept-Encoding'}});
}
export async function GET(request:Request){
 const url=new URL(request.url);const current=monthJST();const month=url.searchParams.get('month')||current;const character=url.searchParams.get('character')||'';
 if(!validMonth(month)||month>current)return json({error:'invalid_request'},400,'no-store');
 const topic=confirmedCharactersForMonth(month).find(item=>item.id===character);
 if(!topic)return json({error:'not_found'},404,'no-store');
 const key=`${month}:${topic.id}`;const now=Date.now();const existing=cache.get(key);
 if(existing&&existing.expires>now)return json(existing.data);
 try{
  const upstream=await fetch(SOURCE_URL,{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});
  if(!upstream.ok)throw new Error('upstream');
  const result=compactSnapshot(await upstream.json(),month,topic);if(!result)throw new Error('invalid_snapshot');
  const fresh={data:result,expires:now+CACHE_TTL_MS,staleUntil:now+STALE_TTL_MS};cache.set(key,fresh);return json(result);
 }catch{
  if(existing&&existing.staleUntil>now)return json({...existing.data,status:'stale'},200,'public, max-age=15, stale-while-revalidate=60');
  // Do not turn a failed source read into a fake zero-valued ranking. The
  // board renders this section as unavailable while comments remain usable.
  return json({status:'unavailable',error:'unavailable'},503,'no-store');
 }
}
