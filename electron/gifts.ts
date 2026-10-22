// SEND_GIFT is the authoritative per-send event; combo summaries are not added again.
export function parseGift(message: unknown): {uid:number;amount:number;eventId:string}|null {
    const event=message as {cmd?:string;data?:Record<string,unknown>};
    if(event?.cmd!=='SEND_GIFT'||!event.data)return null;
    const data=event.data;
    if(data.coin_type!=='gold')return null;
    const uid=Number(data.uid),amount=Number(data.total_coin);
    const id=data.tid || data.rnd;
    if(!Number.isSafeInteger(uid)||uid<=0||!Number.isSafeInteger(amount)||amount<=0||!id)return null;
    return {uid,amount,eventId:`${uid}:${String(id)}:${String(data.giftId)}`};
}
