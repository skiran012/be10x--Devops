export const r = (rupees) => rupees * 100;
export const FX_TODAY = '2026-10-31';
export const FX_MONTH = '2026-10';
const t = (id, date, type, amount, accountId, extra = {}) => ({ id, date, type, amount: r(amount), accountId, version: 1, ...extra });
/** Hand-computed reconciliation fixture (see tests/reconciliation.test.ts for the expected figures). */
export function fixtureData() {
    return {
        accounts: [
            { id: 'acc-bank', name: 'HDFC Savings', type: 'bank', openingBalance: r(50000), openingDate: '2026-01-01' },
            { id: 'acc-cash', name: 'Wallet', type: 'cash', openingBalance: r(5000), openingDate: '2026-01-01' },
            { id: 'acc-card', name: 'Credit card', type: 'card', openingBalance: 0, openingDate: '2026-01-01' },
            { id: 'acc-loan', name: 'Home loan', type: 'loan', openingBalance: r(100000), openingDate: '2026-01-01' },
        ],
        categories: [
            { id: 'cat-rent', name: 'Rent' },
            { id: 'cat-groceries', name: 'Groceries' },
            { id: 'cat-dining', name: 'Dining' },
        ],
        transactions: [
            t('t1', '2026-10-01', 'income', 80000, 'acc-bank', { note: 'Salary' }),
            t('t2', '2026-10-02', 'expense', 20000, 'acc-bank', { categoryId: 'cat-rent' }),
            t('t3', '2026-10-05', 'expense', 3000, 'acc-card', { categoryId: 'cat-groceries' }),
            t('t4', '2026-10-06', 'refund', 500, 'acc-card', { refundOfId: 't3' }),
            t('t5', '2026-10-07', 'transfer', 2000, 'acc-bank', { toAccountId: 'acc-cash' }),
            t('t6', '2026-10-10', 'transfer', 2500, 'acc-bank', { toAccountId: 'acc-card', note: 'Card repayment' }),
            t('t7', '2026-10-15', 'debt_payment', 10000, 'acc-bank', { toAccountId: 'acc-loan', principal: r(8000), interest: r(2000) }),
            t('t8', '2026-10-18', 'expense', 1200, 'acc-cash', { categoryId: 'cat-dining' }),
            t('t9', '2026-10-20', 'expense', 4000, 'acc-bank', { categoryId: 'cat-groceries' }),
            t('t10', '2026-11-05', 'expense', 999, 'acc-bank', { categoryId: 'cat-dining', note: 'Scheduled draft' }),
            t('t11', '2026-09-30', 'expense', 700, 'acc-bank', { categoryId: 'cat-groceries' }),
        ],
        bills: [
            { id: 'b-rent', name: 'Rent', amount: r(20000), recurrence: 'monthly', anchorDate: '2026-01-02', skipped: [], paid: { '2026-10-02': 't2' } },
            { id: 'b-net', name: 'Internet', amount: r(1000), recurrence: 'monthly', anchorDate: '2026-01-31', skipped: [], paid: {} },
            { id: 'b-ins', name: 'Insurance', amount: r(12000), recurrence: 'annual', anchorDate: '2025-10-20', skipped: ['2026-10-20'], paid: {} },
        ],
        budgets: [
            { id: 'bud-groc', month: FX_MONTH, categoryId: 'cat-groceries', limit: r(8000) },
            { id: 'bud-dine', month: FX_MONTH, categoryId: 'cat-dining', limit: r(1000) },
        ],
        goals: [
            { id: 'g-emerg', name: 'Emergency fund', target: r(120000), targetDate: '2027-04-30', allocations: [{ id: 'a1', amount: r(30000), date: '2026-10-01' }] },
        ],
        firedAlerts: [],
        alerts: [],
        revision: 0,
    };
}
