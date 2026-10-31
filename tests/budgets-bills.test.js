import { describe, expect, it } from 'vitest';
import { fixtureData, FX_MONTH, FX_TODAY, r } from '../js/fixtures.js';
import { buildOverview } from '../js/domain/overview.js';
import { Ledger } from '../js/domain/ledger.js';
import { evaluateBudgetAlerts, occurrenceDates, reminderState, billOccurrences } from '../js/domain/calc.js';
const q = { month: FX_MONTH, today: FX_TODAY };
const ledger = () => new Ledger(fixtureData(), () => new Date('2026-10-31T06:00:00Z'), () => FX_TODAY);
describe('FR12 budget use', () => {
    const o = buildOverview(fixtureData(), q);
    it('FR12 limit, eligible spending, remaining, variance', () => {
        expect(o.budgets.find((b) => b.budgetId === 'bud-groc')).toMatchObject({
            limit: r(8000), eligibleSpending: r(6500), remaining: r(1500), variance: r(-1500),
        });
    });
    it('FR12 negative remaining means overspending', () => {
        expect(o.budgets.find((b) => b.budgetId === 'bud-dine')).toMatchObject({ remaining: r(-200), variance: r(200) });
    });
    it('FR12 month boundary: other months spending is excluded', () => {
        const d = fixtureData();
        const nov = buildOverview({ ...d, budgets: [{ id: 'x', month: '2026-09', categoryId: 'cat-groceries', limit: r(1000) }] }, { month: '2026-09', today: FX_TODAY });
        expect(nov.budgets[0].eligibleSpending).toBe(r(700));
    });
});
describe('FR13 threshold alerts fire once per threshold per period', () => {
    it('FR13 80% only for groceries, 80% and 100% for dining', () => {
        const d = fixtureData();
        const { newAlerts } = evaluateBudgetAlerts(d.budgets, d.transactions, FX_TODAY, new Set());
        expect(newAlerts.map((a) => a.key).sort()).toEqual(['bud-dine|2026-10|100', 'bud-dine|2026-10|80', 'bud-groc|2026-10|80']);
    });
    it('FR13 re-evaluation produces no duplicates; edits and new spend only add new thresholds', () => {
        const l = ledger();
        expect(l.getSnapshot().alerts).toHaveLength(3);
        l.addTransaction({ date: '2026-10-26', type: 'expense', amount: r(10), accountId: 'acc-bank', categoryId: 'cat-dining' });
        l.updateTransaction('t8', { amount: r(1300) }, 1);
        expect(l.getSnapshot().alerts).toHaveLength(3);
        l.addTransaction({ date: '2026-10-27', type: 'expense', amount: r(1500), accountId: 'acc-bank', categoryId: 'cat-groceries' });
        const keys = l.getSnapshot().alerts.map((a) => a.key);
        expect(keys).toHaveLength(4);
        expect(new Set(keys).size).toBe(4);
        expect(keys).toContain('bud-groc|2026-10|100');
    });
    it('FR13 exact boundary: 80.00% triggers, one paisa below does not', () => {
        const b = [{ id: 'b', month: FX_MONTH, categoryId: 'c', limit: 10000 }];
        const mk = (amount) => [{ id: 't', date: '2026-10-02', type: 'expense', amount, accountId: 'a', categoryId: 'c', version: 1 }];
        expect(evaluateBudgetAlerts(b, mk(7999), FX_TODAY, new Set()).newAlerts).toHaveLength(0);
        expect(evaluateBudgetAlerts(b, mk(8000), FX_TODAY, new Set()).newAlerts).toHaveLength(1);
    });
});
describe('FR14 recurring bills and reminders', () => {
    const bill = (recurrence, anchorDate) => ({ id: 'b', name: 'B', amount: 100, recurrence, anchorDate, skipped: [], paid: {} });
    it('FR14 weekly', () => {
        expect(occurrenceDates(bill('weekly', '2026-10-03'), '2026-10-10', '2026-10-24')).toEqual(['2026-10-10', '2026-10-17', '2026-10-24']);
    });
    it('FR14 monthly falls on last day when the date is missing', () => {
        expect(occurrenceDates(bill('monthly', '2026-01-31'), '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    });
    it('FR14 annual leap-day anchor clamps in non-leap years', () => {
        expect(occurrenceDates(bill('annual', '2024-02-29'), '2025-01-01', '2028-12-31')).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    });
    it('FR14 timezone: same instant is a different local due date in IST vs UTC-8', () => {
        const occ = billOccurrences([bill('monthly', '2026-11-01')], '2026-11-01', '2026-11-01', '2026-11-01')[0];
        const now = new Date('2026-10-31T20:00:00Z'); // 01:30 IST on 1 Nov, 12:00 on 31 Oct in PST
        const quiet = { startHour: 22, endHour: 7 };
        expect(reminderState(occ, now, { timezone: 'Asia/Kolkata', quietHours: quiet }, 0)).toBe('deferred');
        expect(reminderState(occ, now, { timezone: 'America/Los_Angeles', quietHours: quiet }, 0)).toBe('none');
        expect(reminderState(occ, new Date('2026-11-01T04:30:00Z'), { timezone: 'Asia/Kolkata', quietHours: quiet }, 0)).toBe('send');
    });
});
describe('FR15 bill status and no duplicate expense on linking', () => {
    it('FR15 due, paid, overdue, skipped statuses', () => {
        const l = ledger();
        const occ = buildOverview(l.getSnapshot(), q).bills;
        const status = (id, d) => occ.find((o) => o.billId === id && o.dueDate === d)?.status;
        expect(status('b-rent', '2026-10-02')).toBe('paid');
        expect(status('b-net', '2026-10-31')).toBe('due');
        expect(status('b-ins', '2026-10-20')).toBe('skipped');
        const overdue = billOccurrences([{ id: 'w', name: 'W', amount: 1, recurrence: 'weekly', anchorDate: '2026-10-03', skipped: [], paid: {} }], '2026-10-01', '2026-10-31', FX_TODAY);
        expect(overdue.find((o) => o.dueDate === '2026-10-24').status).toBe('overdue');
    });
    it('FR15 UAT05 linking an existing transaction posts no second expense', () => {
        const l = ledger();
        const before = buildOverview(l.getSnapshot(), q);
        const count = l.getSnapshot().transactions.length;
        expect(l.linkBill('b-net', '2026-10-31', 't9').ok).toBe(true);
        const after = buildOverview(l.getSnapshot(), q);
        expect(l.getSnapshot().transactions).toHaveLength(count);
        expect(after.expenses).toBe(before.expenses);
        expect(after.position).toEqual(before.position);
        expect(after.bills.find((b) => b.billId === 'b-net' && b.dueDate === '2026-10-31').status).toBe('paid');
    });
    it('FR15 a transaction or occurrence cannot be linked twice; deleting the transaction unlinks', () => {
        const l = ledger();
        l.linkBill('b-net', '2026-10-31', 't9');
        expect(l.linkBill('b-net', '2026-10-31', 't8').ok).toBe(false);
        expect(l.linkBill('b-ins', '2026-10-20', 't9').ok).toBe(false);
        l.deleteTransaction('t9');
        expect(buildOverview(l.getSnapshot(), q).bills.find((b) => b.billId === 'b-net' && b.dueDate === '2026-10-31').status).toBe('due');
    });
});
describe('FR03/FR17 validation', () => {
    it('FR03 rejects zero amount, bad date, missing category with explanations', () => {
        const res = ledger().addTransaction({ date: '2026-13-40', type: 'expense', amount: 0, accountId: 'acc-bank' });
        expect(res.ok).toBe(false);
        if (!res.ok)
            expect(Object.keys(res.errors).sort()).toEqual(['amount', 'categoryId', 'date']);
    });
    it('FR04 unlinked refund requires classification', () => {
        const res = ledger().addTransaction({ date: '2026-10-25', type: 'refund', amount: 100, accountId: 'acc-bank' });
        expect(res.ok).toBe(false);
    });
});
