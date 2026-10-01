import {passTheme} from './theme.js';
export const templates = {
 united: { name: 'United Airlines', brand: 'UNITED', color: '#083ca6', accent: '#e9ed9a', prefix: 'UA' },
 emirates: { name: 'Emirates', brand: 'Emirates', color: '#b82331', accent: '#f4dfbe', prefix: 'EK' },
 etihad: { name: 'Etihad Airways', brand: 'ETIHAD', color: '#202b2b', accent: '#d6b46d', prefix: 'EY' },
 klm: { name: 'KLM', brand: 'KLM', color: '#0086bd', accent: '#dcf6ff', prefix: 'KL' },
 singapore: { name: 'Singapore Airlines', brand: 'SINGAPORE AIRLINES', color: '#092e61', accent: '#ffb24a', prefix: 'SQ' },
};
const rgb = hex => `rgb(${hex.match(/\w\w/g).map(x => parseInt(x,16)).join(', ')})`;
export function validatePass(data) {
 if (!data || !templates[data.template]) throw new Error('Choose a valid template.');
 if(data.color!==undefined&&(typeof data.color!=='string'||!/^#[0-9a-f]{6}$/i.test(data.color)))throw new Error('Choose a valid pass color.');
 const required = { name:80, cabin:30, flight:12, seat:6, gate:8, boardingTime:5, date:10, group:4 };
 for (const [key,max] of Object.entries(required)) if (typeof data[key]!=='string' || !data[key].trim() || data[key].length>max) throw new Error(`Enter a valid ${key}.`);
 if (!['Economy','Premium Economy','Business','First'].includes(data.cabin)) throw new Error('Choose a valid cabin class.');
 if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.boardingTime)) throw new Error('Enter a valid boarding time.');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(new Date(data.date+'T00:00:00Z').getTime()) || new Date(data.date+'T00:00:00Z').toISOString().slice(0,10)!==data.date) throw new Error('Enter a valid date.');
 for (const field of ['from','to']) if (!data[field] || !/^[A-Z]{3}$/.test(data[field].code) || typeof data[field].city!=='string' || !data[field].city || data[field].city.length>120) throw new Error('Select both airports from search results.');
 if (data.from.code===data.to.code) throw new Error('Choose two different airports.');
 if (data.barcode && (typeof data.barcode!=='string' || data.barcode.length>1000)) throw new Error('Barcode text must be under 1,000 characters.');
 return data;
}
export function passJSON(data,identifiers={}) {
 validatePass(data);
 const t=templates[data.template];
 const theme=passTheme(t,data.color);
 const time = new Date(`2000-01-01T${data.boardingTime}:00`).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
 return {
 formatVersion:1, passTypeIdentifier:identifiers.passTypeIdentifier||'pass.com.example.passport', teamIdentifier:identifiers.teamIdentifier||'TEAMIDHERE',
 serialNumber:crypto.randomUUID(), organizationName:'PassPort Studio', description:`${t.name} boarding pass template`,
 backgroundColor:rgb(theme.background), foregroundColor:rgb(theme.foreground), labelColor:rgb(theme.accent),
 barcodes:[{format:'PKBarcodeFormatQR',message:data.barcode||`PASSPORT-DEMO:${JSON.stringify({name:data.name,from:data.from.code,to:data.to.code,date:data.date,flight:data.flight,seat:data.seat})}`,messageEncoding:'utf-8'}],
 boardingPass:{transitType:'PKTransitTypeAir',headerFields:[{key:'gate',label:'GATE',value:data.gate.toUpperCase()}],
 primaryFields:[{key:'origin',label:data.from.city.toUpperCase(),value:data.from.code},{key:'destination',label:data.to.city.toUpperCase(),value:data.to.code}],
 secondaryFields:[{key:'boarding',label:'BOARDS',value:time},{key:'flight',label:'FLIGHT',value:data.flight.toUpperCase()},{key:'seat',label:'SEAT',value:data.seat.toUpperCase()},{key:'group',label:'GROUP',value:data.group}],
 auxiliaryFields:[{key:'passenger',label:'PASSENGER',value:data.name.toUpperCase()},{key:'class',label:'CLASS',value:data.cabin}],
 backFields:[{key:'date',label:'TRAVEL DATE',value:data.date},{key:'airports',label:'ROUTE',value:`${data.from.city} (${data.from.code}) → ${data.to.city} (${data.to.code})`}]}
 };
}
