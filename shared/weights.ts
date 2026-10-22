export const MAX_PERSONAL_WEIGHTS = 100000;
export function validWeight(value: number): boolean {
    return Number.isFinite(value) && value >= 1 && value <= 10000 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
}
export function probabilityLabel(weight: number, total: number): string {
    const percent = total > 0 ? weight / total * 100 : 0;
    return percent > 0 && percent < 0.01 ? '<0.01%' : `${percent.toFixed(2)}%`;
}
