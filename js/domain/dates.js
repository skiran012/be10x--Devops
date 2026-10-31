const pad = (n) => String(n).padStart(2, '0');
const toUTC = (d) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
};
const fromUTC = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && fromUTC(toUTC(d)) === d;
export const addDays = (d, n) => fromUTC(toUTC(d) + n * 86400000);
export const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
export const monthOf = (d) => d.slice(0, 7);
export const lastDayOfMonth = (m) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(Date.UTC(y, mo, 0)).getUTCDate();
};
export const monthStart = (m) => `${m}-01`;
export const monthEnd = (m) => `${m}-${pad(lastDayOfMonth(m))}`;
export const inMonth = (d, m) => monthOf(d) === m;
// BRD FR14: a day-of-month missing in a month falls on that month's last day.
export function addMonthsClamped(anchor, months) {
    const [y, m, day] = anchor.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    const ny = Math.floor(total / 12);
    const nm = total % 12;
    const key = `${ny}-${pad(nm + 1)}`;
    return `${key}-${pad(Math.min(day, lastDayOfMonth(key)))}`;
}
// Local calendar date / hour of an instant in an IANA timezone (BRD FR14 timezone awareness).
export function localParts(now, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t).value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}
export const localDate = (now, tz) => localParts(now, tz).date;
