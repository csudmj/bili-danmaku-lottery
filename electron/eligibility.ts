export type MedalRule = 'off' | 'wear';
export type GuardLevel = 0 | 1 | 2 | 3;

// info[7] is the live room's guard identity. A medal may belong to another room.
export function parseGuard(info: unknown, anchorUid: number): GuardLevel | null {
    if (!Array.isArray(info)) return null;
    const valid=(value: unknown): value is GuardLevel => typeof value==='number' && Number.isInteger(value) && value>=0 && value<=3;
    if (valid(info[7])) return info[7];
    const medal=parseMedal(info);
    if (!medal || anchorUid<=0 || medal.anchorUid!==anchorUid) return null;
    const modern=info[0]?.[15]?.user?.medal;
    const value=modern?.guard_level ?? info[3]?.[10];
    return valid(value)?value:null;
}

export interface FanMedal {
    name: string;
    level: number;
    anchorUid: number;
}

// DANMU_MSG: prefer the named user.medal fields; support the older info[3] array.
export function parseMedal(info: unknown): FanMedal | null {
    if (!Array.isArray(info)) return null;
    const modern = info[0]?.[15]?.user?.medal;
    const legacy = Array.isArray(info[3]) ? info[3] : [];
    const name = modern?.name ?? legacy[1];
    const level = Number(modern?.level ?? legacy[0]);
    if (typeof name !== 'string' || !name || !Number.isFinite(level) || level <= 0) return null;
    return {
        name, level,
        anchorUid: Number(modern?.ruid ?? legacy[12]) || 0,
    };
}

export function isEligible(content: string, keyword: string, medal: FanMedal | null,
                           rule: MedalRule, anchorUid: number): boolean {
    if (!keyword.trim() || !content.includes(keyword)) return false;
    if (rule === 'off') return true;
    if (!medal || anchorUid <= 0 || medal.anchorUid !== anchorUid) return false;
    return rule === 'wear';
}
