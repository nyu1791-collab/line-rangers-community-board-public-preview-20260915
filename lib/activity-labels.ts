import type {Language} from './rules';
const copy={
 ja:{helpful:'役に立った',helpers:'役に立ったを押した人',sort:'役に立った順',featured:'注目コメント',title:'動画投稿者'},
 en:{helpful:'Helpful',helpers:'People who found this helpful',sort:'Most helpful',featured:'Featured comment',title:'Video contributor'},
 zh:{helpful:'有幫助',helpers:'覺得有幫助的人',sort:'最有幫助',featured:'精選留言',title:'影片投稿者'},
 ko:{helpful:'도움이 됐어요',helpers:'도움이 됐다고 한 사람',sort:'도움순',featured:'주목할 댓글',title:'영상 기여자'},
 th:{helpful:'มีประโยชน์',helpers:'ผู้ที่เห็นว่ามีประโยชน์',sort:'มีประโยชน์มากที่สุด',featured:'ความคิดเห็นเด่น',title:'ผู้แบ่งปันวิดีโอ'},
 id:{helpful:'Bermanfaat',helpers:'Pengguna yang terbantu',sort:'Paling bermanfaat',featured:'Komentar pilihan',title:'Kontributor video'},
 vi:{helpful:'Hữu ích',helpers:'Người thấy hữu ích',sort:'Hữu ích nhất',featured:'Bình luận nổi bật',title:'Người chia sẻ video'}
};
export function activityLabels(lang:Language){return copy[lang];}
