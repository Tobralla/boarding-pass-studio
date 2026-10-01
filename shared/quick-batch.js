import {templates,validatePass} from './pass-data.js';
const hubs=['CPH','LHR','JFK','LAX','SFO','DEN','JAC','DXB','AUH','AMS','SIN','HND','NRT','CDG','FRA','ZRH','MUC','MAD','BCN','FCO','SYD','MEL','HKG','ICN','YYZ','MIA','ORD','BOS','ARN','OSL','BKK'];
export function normalizeBatchName(value){
 if(typeof value!=='string')throw new Error('Enter your name as LASTNAME/FIRSTNAME.');
 const parts=value.split('/').map(p=>p.trim().replace(/\s+/g,' '));
 if(parts.length!==2||parts.some(p=>!p)||value.length>80)throw new Error('Enter your name as LASTNAME/FIRSTNAME, for example SMITH/ALEX.');
 const name=parts.join('/').toUpperCase();
 if(name.length>80)throw new Error('Passenger name must be 80 characters or fewer.');
 return name;
}
function shuffled(values,random){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function createQuickBatch({name,count,template,color,mixedTemplates=false,airports,random=Math.random,now=new Date()}){
 name=normalizeBatchName(name);
 if(!Number.isInteger(count)||count<1||count>5)throw new Error('Choose between 1 and 5 boarding passes.');
 if(!templates[template])throw new Error('Choose an airline template.');
 const directory=new Map((airports||[]).filter(a=>/^[A-Z]{3}$/.test(a.code)&&a.city).map(a=>[a.code,a]));
 let pool=hubs.map(code=>directory.get(code)).filter(Boolean);if(pool.length<count*2)pool=[...directory.values()];
 if(pool.length<count*2)throw new Error('The airport directory is still loading. Try again in a moment.');
 const selected=shuffled(pool,random).slice(0,count*2),times=shuffled(Array.from({length:64},(_,i)=>360+i*15),random);
 const airlines=Object.keys(templates);
 const airlineTemplates=Array.from({length:count},()=>mixedTemplates?airlines[Math.floor(random()*airlines.length)]:template);
 return Array.from({length:count},(_,i)=>{
  const date=new Date(now);date.setHours(12,0,0,0);date.setDate(date.getDate()+Math.floor(random()*21));
  const minutes=times[i];
  const airline=airlineTemplates[i];
  const pass={template:airline,...(color?{color}:{}),name,cabin:'First',from:selected[i*2],to:selected[i*2+1],date:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,boardingTime:`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,flight:`${templates[airline].prefix} ${100+Math.floor(random()*8900)}`,seat:`${1+Math.floor(random()*4)}${['A','D','F'][Math.floor(random()*3)]}`,gate:`${'ABCDEF'[Math.floor(random()*6)]}${1+Math.floor(random()*40)}`,group:'1',barcode:''};
  validatePass(pass);return pass;
 });
}
