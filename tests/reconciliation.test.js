import { describe, expect, it } from 'vitest';
import { fixtureData, FX_MONTH, FX_TODAY, r } from '../js/fixtures.js';
import { buildOverview } from '../js/domain/overview.js';
import { Ledger } from '../js/domain/ledger.js';
import { computePeriod, netCashMovement, computePosition } from '../js/domain/calc.js';
const q = { month: FX_MONTH, today: FX_TODAY };
const ledger = () => new Ledger(fixtureData(), () => new Date('2026-10-31T06:00:00Z'), () => FX_TODAY);
describe('FR21 reconciliation fixture: position, income/expenses, net cash movement', () => {
    const o = buildOverview(fixtureData(), q);
    it('FR21 cash assets, liabilities, net worth', () => {
        expect(o.position).toEqual({ cashAssets: r(96600), liabilities: r(92000), netWorth: r(4600) });
    });
    it('FR21 UAT02 card purchase + repayment keeps expense once and liability returns to zero', () => {
        const d = fixtureData();
        const card = computePosition(d.accounts.filter((a) => a.id === 'acc-card'), d.transactions, FX_TODAY, FX_TODAY);
        expect(card.liabilities).toBe(0);
    });
    it('FR21 income and expenses (interest is expense, linked refund reduces, drafts excluded)', () => {
        expect(o.income).toBe(r(80000));
        expect(o.expenses).toBe(r(29700));
        expect(o.incomeMinusExpenses).toBe(r(50300));
    });
    it('FR21 net cash movement is separate from income - expenses and explains the difference', () => {
        expect(o.cash).toEqual({ inflow: r(80000), outflow: r(37700), net: r(42300) });
        expect(o.nonExpenseDifference).toBe(r(-8000));
    });
    it('FR21 transfer-netting: transfer between included cash accounts nets to zero', () => {
        const d = fixtureData();
        const only = d.transactions.filter((t) => t.id === 't5');
        expect(netCashMovement(d.accounts, only, FX_MONTH, FX_TODAY)).toEqual({ inflow: 0, outflow: 0, net: 0 });
        // transfer to an account outside the filter is a real outflow
        const f = new Set(['acc-bank']);
        expect(netCashMovement(d.accounts, only, FX_MONTH, FX_TODAY, f).net).toBe(r(-2000));
    });
    it('UAT03 transfer does not change income; linked refund reduces category expense', () => {
        const groceries = o.categories.find((c) => c.categoryId === 'cat-groceries');
        expect(groceries.amount).toBe(r(6500));
        expect(o.income).toBe(r(80000));
    });
});
describe('FR22 category breakdown reconciles to ledger totals under every filter', () => {
    const d = fixtureData();
    const filters = [undefined, ['acc-bank'], ['acc-cash'], ['acc-card'], ['acc-bank', 'acc-cash']];
    it.each(filters)('FR22 category sum equals expenses for filter %j', (ids) => {
        const o = buildOverview(d, { ...q, accountIds: ids });
        expect(o.categories.reduce((s, c) => s + c.amount, 0)).toBe(o.expenses);
        const shares = o.categories.reduce((s, c) => s + c.share, 0);
        if (o.categories.length)
            expect(Math.abs(shares - 100)).toBeLessThan(0.1);
    });
    it('FR22 category shares', () => {
        const o = buildOverview(d, q);
        expect(o.categories.map((c) => [c.name, c.share])).toEqual([
            ['Rent', 67.34], ['Groceries', 21.89], ['Loan interest', 6.73], ['Dining', 4.04],
        ]);
    });
});
describe('UAT07 / FR21-22: mutations update every figure deterministically', () => {
    it('UAT07 create, edit, recategorize and delete recompute overview, budgets and breakdown', () => {
        const l = ledger();
        let notified = 0;
        l.subscribe(() => notified++);
        const res = l.addTransaction({ date: '2026-10-25', type: 'expense', amount: r(500), accountId: 'acc-bank', categoryId: 'cat-dining' });
        expect(res.ok).toBe(true);
        const id = res.id;
        let o = buildOverview(l.getSnapshot(), q);
        expect(o.expenses).toBe(r(30200));
        expect(o.position.cashAssets).toBe(r(96100));
        expect(o.budgets.find((b) => b.categoryId === 'cat-dining').eligibleSpending).toBe(r(1700));
        l.recategorize(id, 'cat-groceries');
        o = buildOverview(l.getSnapshot(), q);
        expect(o.budgets.find((b) => b.categoryId === 'cat-dining').eligibleSpending).toBe(r(1200));
        expect(o.budgets.find((b) => b.categoryId === 'cat-groceries').eligibleSpending).toBe(r(7000));
        l.updateTransaction(id, { amount: r(300) }, 2);
        expect(buildOverview(l.getSnapshot(), q).expenses).toBe(r(30000));
        l.deleteTransaction(id);
        const back = buildOverview(l.getSnapshot(), q);
        expect(back).toEqual(buildOverview(fixtureData(), q));
        expect(notified).toBe(4);
    });
    it('UAT07 stale version edits are rejected', () => {
        const l = ledger();
        expect(l.updateTransaction('t9', { amount: r(1) }, 99).ok).toBe(false);
    });
    it('FR22 recalculation is deterministic regardless of transaction order', () => {
        const d = fixtureData();
        const a = computePeriod(d.transactions, FX_MONTH, FX_TODAY);
        const b = computePeriod([...d.transactions].reverse(), FX_MONTH, FX_TODAY);
        expect(b.expenses).toBe(a.expenses);
        expect([...b.expenseByCategory].sort()).toEqual([...a.expenseByCategory].sort());
    });
});
describe('UAT06 / FR17-18 goals', () => {
    it('FR17 target, allocated, gap, required monthly', () => {
        const g = buildOverview(fixtureData(), q).goals[0];
        expect(g).toMatchObject({ allocated: r(30000), gap: r(90000), monthsLeft: 6, requiredMonthly: r(15000) });
    });
    it('FR18 allocation changes no balances or income', () => {
        const l = ledger();
        const before = buildOverview(l.getSnapshot(), q);
        expect(l.allocate('g-emerg', r(5000)).ok).toBe(true);
        const after = buildOverview(l.getSnapshot(), q);
        expect(after.position).toEqual(before.position);
        expect(after.income).toBe(before.income);
        expect(after.goals[0].allocated).toBe(r(35000));
    });
    it('FR18 warns when allocations exceed eligible funds', () => {
        const l = ledger();
        l.allocate('g-emerg', r(70000));
        expect(buildOverview(l.getSnapshot(), q).allocationWarning).toBe(true);
    });
});
