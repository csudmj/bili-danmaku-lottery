import {randomInt} from 'node:crypto';
import type {FanMedal, MedalRule, GuardLevel} from './eligibility.ts';

export type ActivityMode = 'lottery' | 'queue';
export interface Participant {name: string; uid: number; medal?: FanMedal | null; weight?: number; guardLevel?: GuardLevel | null; hasRoomMedal?: boolean}
export interface WeightRules {captain:number; admiral:number; governor:number; fan:number; ordinary:number}
export interface PersonalWeight {uid:number|null;name:string;weight:number}
export function validatePersonalWeights(value:unknown):PersonalWeight[]{
    if(!Array.isArray(value)||value.length>500)throw new Error('专属名单最多保存 500 人');
    const seen=new Set<string>();
    return value.map(entry=>{
        if(!entry||typeof entry.name!=='string'||entry.name.length>80||!Number.isInteger(entry.weight)||entry.weight<1||entry.weight>10000)throw new Error('请检查昵称、UID 及权重');
        const uid=entry.uid??null,name=entry.name.trim();
        if(uid!==null&&(!Number.isSafeInteger(uid)||uid<=0))throw new Error('UID 必须为正整数，或留空按昵称匹配');
        if(uid===null&&!name)throw new Error('昵称和 UID 至少填写一项');
        const key=uid===null?`name:${name}`:`uid:${uid}`;
        if(seen.has(key))throw new Error('同一 UID 或同一昵称规则只能保存一条');
        seen.add(key);return {uid,name,weight:entry.weight};
    });
}
export const DEFAULT_WEIGHTS: WeightRules = {captain:1,admiral:1,governor:1,fan:1,ordinary:1};
export function weightGroup(person: Participant): keyof WeightRules {
    if(person.guardLevel===1)return 'governor';
    if(person.guardLevel===2)return 'admiral';
    if(person.guardLevel===3)return 'captain';
    return person.hasRoomMedal?'fan':'ordinary';
}
export interface Danmu extends Participant {content: string}
export type ConnectionState = 'connecting' | 'connected' | 'stopped';
export interface LotterySnapshot {
    mode: ActivityMode;
    queueLimit: number;
    removedCount: number;
    weightRules: WeightRules;
    queueOrderEdited: boolean;
    loginStatus: 'checking' | 'authenticated' | 'anonymous' | 'error';
    participants: Participant[];
    winners: Participant[];
    latestWinners: Participant[];
    drawNumber: number;
    total: number;
    roomId: string;
    keyword: string;
    medalRule: MedalRule;
    connection: ConnectionState;
    user: {name: string; avatar: string} | null;
    overlayOpen: boolean;
    overlayPinned: boolean;
    ready: boolean;
}

// A single pool in the main process is shared by every window.
export class LotteryPool {
    private seen = new Set<number>();
    private participants: Participant[] = [];
    private winners: Participant[] = [];
    private latestWinners: Participant[] = [];
    private drawNumber = 0;
    private mode: ActivityMode = 'lottery';
    private queueLimit = 20;
    private removedCount = 0;
    private weightRules: WeightRules = {...DEFAULT_WEIGHTS};
    private queueOrderEdited = false;
    private personalWeights = new Map<number,PersonalWeight>();
    private nameWeights = new Map<string,PersonalWeight>();
    setPersonalWeights(entries: PersonalWeight[]){
        const valid=validatePersonalWeights(entries);
        this.personalWeights=new Map(valid.filter(entry=>entry.uid!==null).map(entry=>[entry.uid!,entry]));
        this.nameWeights=new Map(valid.filter(entry=>entry.uid===null).map(entry=>[entry.name,entry]));
    }
    private defaultWeight(person:Participant){return this.personalWeights.get(person.uid)?.weight??this.nameWeights.get(person.name.trim())?.weight??this.weightRules[weightGroup(person)];}

    setWeightRules(value: WeightRules, applyExisting: boolean) {
        if (this.mode!=='lottery' && this.participants.length) throw new Error('排队模式不使用权重');
        const next={...DEFAULT_WEIGHTS};
        for(const key of Object.keys(next) as (keyof WeightRules)[]){
            const weight=value?.[key];
            if(!Number.isInteger(weight)||weight<1||weight>10000)throw new Error('每档权重需为 1–10000 的整数');
            next[key]=weight;
        }
        this.weightRules=next;
        if(applyExisting)for(const person of this.participants)person.weight=this.defaultWeight(person);
    }
    resetWeights(){this.setWeightRules({...DEFAULT_WEIGHTS},false);for(const person of this.participants)person.weight=1;}
    move(uid: number, targetUid: number, placement: 'before'|'after') {
        if(this.mode!=='queue')throw new Error('仅排队模式可调整顺序');
        if(!['before','after'].includes(placement))throw new Error('无效的插入位置');
        const index=this.participants.findIndex(p=>p.uid===uid);
        if(index<0||!this.participants.some(p=>p.uid===targetUid))throw new Error('名单已变化，请重新拖动');
        if(uid===targetUid)return;
        const [person]=this.participants.splice(index,1);
        const target=this.participants.findIndex(p=>p.uid===targetUid);
        this.participants.splice(target+(placement==='after'?1:0),0,person);
        this.queueOrderEdited=true;
    }

    configure(mode: ActivityMode, limit: number) {
        if (!['lottery', 'queue'].includes(mode)) throw new Error('请选择抽奖或排队模式');
        if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('排队上限需为 1–10000 的整数');
        if (this.seen.size && mode !== this.mode) throw new Error('请重置后再切换模式');
        if (mode === 'queue' && limit < this.participants.length) throw new Error('上限不能小于当前排队人数');
        this.mode = mode; this.queueLimit = limit;
    }

    remove(uid: number) {
        const index = this.participants.findIndex(person => person.uid === uid);
        if (index < 0) throw new Error('该参与者已不在名单中');
        this.participants.splice(index, 1);
        this.removedCount++;
        // Keep seen: removed viewers cannot reclaim a slot by repeatedly sending messages.
    }

    setWeight(uid: number, weight: number) {
        if (this.mode !== 'lottery') throw new Error('排队模式不使用权重');
        if (!Number.isInteger(weight) || weight < 1 || weight > 10000) throw new Error('权重需为 1–10000 的整数');
        const person = this.participants.find(person => person.uid === uid);
        if (!person) throw new Error('该参与者已不在待抽名单中');
        person.weight = weight;
    }

    add(person: Participant): boolean {
        if (!Number.isSafeInteger(person.uid) || person.uid <= 0 || !person.name || this.seen.has(person.uid)) return false;
        if (this.mode === 'queue' && this.participants.length >= this.queueLimit) return false;
        this.seen.add(person.uid);
        this.participants.push({...structuredClone(person), weight: this.mode==='lottery'?this.defaultWeight(person):1});
        return true;
    }

    draw(count: number, random: (maximum: number) => number = randomInt): Participant[] {
        if (this.mode !== 'lottery') throw new Error('排队模式不能抽奖');
        if (!Number.isInteger(count) || count < 1 || count > this.participants.length) throw new Error('请选择有效的抽取人数');
        const pool = [...this.participants];
        const selected: Participant[] = [];
        for (let i = 0; i < count; i++) {
            const totalWeight = pool.reduce((sum, person) => sum + (person.weight ?? 1), 0);
            if (!Number.isSafeInteger(totalWeight) || totalWeight >= 2 ** 48) throw new Error('总权重超出范围');
            const ticket = random(totalWeight);
            if (!Number.isInteger(ticket) || ticket < 0 || ticket >= totalWeight) throw new Error('抽奖随机数无效');
            let index = 0, boundary = pool[0].weight ?? 1;
            while (ticket >= boundary) {index++; boundary += pool[index].weight ?? 1;}
            selected.push(pool.splice(index, 1)[0]);
        }
        this.participants = pool;
        this.latestWinners = selected;
        this.winners = [...selected, ...this.winners];
        this.drawNumber++;
        return structuredClone(selected);
    }

    reset() {
        this.seen.clear();
        this.participants = [];
        this.winners = [];
        this.latestWinners = [];
        this.drawNumber = 0;
        this.removedCount = 0;
        this.queueOrderEdited = false;
    }

    snapshot() {
        return structuredClone({participants: this.participants, winners: this.winners,
            latestWinners: this.latestWinners, drawNumber: this.drawNumber, total: this.seen.size,
            mode: this.mode, queueLimit: this.queueLimit, removedCount: this.removedCount,
            weightRules:this.weightRules,queueOrderEdited:this.queueOrderEdited});
    }
}
