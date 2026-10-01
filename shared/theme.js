const luminance=hex=>{
 const channels=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
 return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
};
export function passTheme(template,customColor){
 const background=customColor||template.color;
 const isCustom=background.toLowerCase()!==template.color.toLowerCase();
 const darkInk=isCustom&&luminance(background)>.179;
 const foreground=darkInk?'#171717':'#ffffff';
 const bgLum=luminance(background),accentLum=luminance(template.accent);
 const contrast=(Math.max(bgLum,accentLum)+.05)/(Math.min(bgLum,accentLum)+.05);
 return {background,foreground,accent:isCustom&&contrast<3?foreground:template.accent,darkInk};
}
