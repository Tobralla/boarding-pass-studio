import sharp from 'sharp';
import {copyFile} from 'node:fs/promises';
const inputs={united:'United_Airlines_Logo.svg.webp',emirates:'Emirates.png',etihad:'Etihad-airways-logo.svg.webp',klm:'klm-logo-png_seeklogo-79086.png',singapore:'Singapore-Airlines-logo.jpg'};
for(const [id,file] of Object.entries(inputs)){
 await copyFile(`/Users/tobiaslauritsen/Downloads/${file}`,`public/logos/original-${file}`);
 let {data,info}=await sharp(`/Users/tobiaslauritsen/Downloads/${file}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(['emirates','singapore'].includes(id))for(let i=0;i<data.length;i+=4){if(data[i]>235&&data[i+1]>235&&data[i+2]>235)data[i+3]=0;}
 await sharp(data,{raw:info}).trim({threshold:15}).resize({width:600}).png().toFile(`public/logos/${id==='emirates'?'emirates-logo':id}.png`);
}
