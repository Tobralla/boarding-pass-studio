import {passJSON,templates} from './pass-data.js';
import {passTheme} from './theme.js';
export function providerArguments(data,images){
 const pass=passJSON(data),theme=passTheme(templates[data.template],data.color);
 const message=data.barcode||pass.barcodes[0].message.replace(/[\u0080-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if([...message].some(c=>c.codePointAt(0)>255)){const error=new Error('Custom barcode text contains characters the free signing service cannot encode.');error.status=400;throw error;}
 return {style:'boardingPass',transit_type:'Air',organization_name:pass.organizationName,description:pass.description,serial_number:pass.serialNumber,background_color:theme.background,foreground_color:theme.foreground,label_color:theme.accent,barcode_message:message,barcode_format:'QR',logo_png_b64:images['logo.png'],icon_png_b64:images['icon.png'],header_fields:pass.boardingPass.headerFields,primary_fields:pass.boardingPass.primaryFields,secondary_fields:pass.boardingPass.secondaryFields,auxiliary_fields:pass.boardingPass.auxiliaryFields,back_fields:pass.boardingPass.backFields};
}
