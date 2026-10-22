const KEY = 'last-room-id';
export function parseRoom(value: string): string | null {
    const text=value.trim();
    if (!text) return '';
    if (/^\d+$/.test(text)) return text;
    try {
        const url=new URL(text);
        if (!['https:','http:'].includes(url.protocol) || url.hostname!=='live.bilibili.com') return null;
        const match=url.pathname.match(/^\/(\d+)\/?$/);
        return match ? match[1] : null;
    } catch {return null;}
}
export function readRoom(storage: Pick<Storage,'getItem'>): string {
    try {const value=storage.getItem(KEY)||'';return /^\d+$/.test(value)?value:'';} catch {return '';}
}
export function saveRoom(storage: Pick<Storage,'setItem'|'removeItem'>, value: string): boolean {
    const room=parseRoom(value);
    if (room===null) return false;
    try {if(room)storage.setItem(KEY,room);else storage.removeItem(KEY);return true;} catch {return false;}
}
