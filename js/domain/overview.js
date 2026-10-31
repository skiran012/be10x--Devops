import { allocationsExceedFunds, billOccurrences, budgetUse, categoryBreakdown, computePeriod, computePosition, goalProgress, isPosted, netCashMovement, } from './calc.js';
import { addDays, monthEnd } from './dates.js';
import { UNCATEGORIZED_ID, INTEREST_CATEGORY_ID, } from './types.js';
export const categoryName = (data, id) => id === UNCATEGORIZED_ID ? 'Uncategorized' : id === INTEREST_CATEGORY_ID ? 'Loan interest'
    : data.categories.find((c) => c.id === id)?.name ?? id;
/** FR21/FR22: one pure function feeds every section, so all figures share one set of ledger totals. */
export function buildOverview(data, q) {
    const filter = q.accountIds ? new Set(q.accountIds) : undefined;
    const asOf = monthEnd(q.month) < q.today ? monthEnd(q.month) : q.today;
    const position = computePosition(data.accounts, data.transactions, asOf, q.today, filter);
    const period = computePeriod(data.transactions, q.month, q.today, filter);
    const cash = netCashMovement(data.accounts, data.transactions, q.month, q.today, filter);
    const recent = data.transactions
        .filter((t) => isPosted(t, q.today) && (!filter || filter.has(t.accountId) || (t.toAccountId && filter.has(t.toAccountId))))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        .slice(0, 8);
    return {
        position,
        income: period.income,
        expenses: period.expenses,
        incomeMinusExpenses: period.income - period.expenses,
        cash,
        nonExpenseDifference: cash.net - (period.income - period.expenses),
        categories: categoryBreakdown(period).map((r) => ({ ...r, name: categoryName(data, r.categoryId) })),
        recent,
        bills: billOccurrences(data.bills, addDays(q.today, -30), addDays(q.today, 30), q.today),
        budgets: data.budgets.filter((b) => b.month === q.month).map((b) => budgetUse(b, period)),
        goals: data.goals.map((g) => goalProgress(g, q.today)),
        allocationWarning: allocationsExceedFunds(data.goals, position.cashAssets),
    };
}
