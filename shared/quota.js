export const DAILY_FREE_LIMIT=30;
export function updateQuota(saved,action='status',now=new Date()){
 const day=now.toISOString().slice(0,10);
 let value=saved?.day===day?{...saved}:{day,used:0,blocked:false};
 if(action==='reserve'&&!value.blocked&&value.used<DAILY_FREE_LIMIT)value.used++;
 else if(action==='release')value.used=Math.max(0,value.used-1);
 else if(action==='block')value.blocked=true;
 const resetsAt=new Date(`${day}T00:00:00Z`);resetsAt.setUTCDate(resetsAt.getUTCDate()+1);
 return {value,status:{remaining:value.blocked?0:Math.max(0,DAILY_FREE_LIMIT-value.used),limit:DAILY_FREE_LIMIT,resetsAt:resetsAt.toISOString(),shared:true,source:'site'}};
}
