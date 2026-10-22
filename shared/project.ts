export const PROJECT = {
    name: '抽奖姬', developer: '想吃金丝虾球',
    owner: 'csudmj', repository: 'bili-danmaku-lottery',
    url: 'https://github.com/csudmj/bili-danmaku-lottery',
} as const;
export const PROJECT_LINKS = {
    repository: PROJECT.url,
    issues: `${PROJECT.url}/issues`,
    pulls: `${PROJECT.url}/pulls`,
    releases: `${PROJECT.url}/releases/latest`,
} as const;
export type UpdateState = {
    status: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error' | 'unsupported';
    version?: string; percent?: number; message?: string;
};
