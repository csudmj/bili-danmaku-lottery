export function overlayFontScale(requested:number,width:number,height:number){
    const desired=Number.isFinite(requested)?Math.max(85,Math.min(180,requested)):100;
    const ceiling=Math.max(85,Math.min(180,width/250*100,height/470*100));
    return Math.round(Math.min(desired,ceiling));
}
