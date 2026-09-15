import {database} from '@/db/raw';
export async function enrichPosts(rows:Record<string,unknown>[],userId:string){
 if(!rows.length)return rows;
 const ids=rows.map(p=>String(p.id));const marks=ids.map(()=>'?').join(',');
 const ratings=(await database().prepare(`SELECT post,COUNT(*) count,MAX(user=?) selected FROM helpful WHERE post IN (${marks}) GROUP BY post`).bind(userId,...ids).all()).results;
 const authors=[...new Set(rows.map(p=>String(p.author)))];
 const badges=(await database().prepare(`SELECT user,badge FROM user_badges WHERE user IN (${authors.map(()=>'?').join(',')}) ORDER BY badge`).bind(...authors).all()).results;
 const ratingsByPost=new Map(ratings.map(r=>[String(r.post),r]));
 const badgesByUser=new Map<string,string[]>();for(const badge of badges){const key=String(badge.user);badgesByUser.set(key,[...(badgesByUser.get(key)||[]),String(badge.badge)]);}
 return rows.map(p=>{const rating=ratingsByPost.get(String(p.id));const {author,...publicPost}=p;return {...publicPost,mine:!!userId&&String(author)===userId,helpful:Number(rating?.count||0),helped:!!rating?.selected,title:null,badges:badgesByUser.get(String(author))||[]};});
}
