import {randomInt} from 'node:crypto';
import type {FanMedal, MedalRule} from './eligibility.ts';

export type ActivityMode = 'lottery' | 'queue';
export interface Participant {name: string; uid: number; medal?: FanMedal | null; weight?: number}
export interface Danmu extends Participant {content: string}
export type ConnectionState = 'connecting' | 'connected' | 'stopped';
export interface LotterySnapshot {
    mode: ActivityMode;
    queueLimit: number;
    removedCount: number;
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
        this.participants.push({...structuredClone(person), weight: 1});
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
    }

    snapshot() {
        return structuredClone({participants: this.participants, winners: this.winners,
            latestWinners: this.latestWinners, drawNumber: this.drawNumber, total: this.seen.size,
            mode: this.mode, queueLimit: this.queueLimit, removedCount: this.removedCount});
    }
}
