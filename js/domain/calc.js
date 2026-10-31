import { INTEREST_CATEGORY_ID, UNCATEGORIZED_ID, isCashType, isLiabilityType, } from './types.js';
import { addDays, addMonthsClamped, diffDays, inMonth, localParts, monthEnd, monthOf } from './dates.js';
const included = (f, id) => !f || f.has(id);
/** A transaction counts once posted: future-dated entries are scheduled drafts (BRD §5). */
export const isPosted = (t, today) => t.date <= today;
export function postings(t) {
    switch (t.type) {
        case 'income':
        case 'refund':
            return [{ accountId: t.accountId, flow: 'in', amount: t.amount }];
        case 'expense':
            return [{ accountId: t.accountId, flow: 'out', amount: t.amount }];
        case 'transfer':
            return [
                { accountId: t.accountId, flow: 'out', amount: t.amount },
                { accountId: t.toAccountId, flow: 'in', amount: t.amount },
            ];
        case 'debt_payment': // cash out for the total, liability reduced by principal only (FR20)
            return [
                { accountId: t.accountId, flow: 'out', amount: t.amount },
                { accountId: t.toAccountId, flow: 'in', amount: t.principal ?? 0 },
            ];
    }
}
export function computePosition(accounts, txns, asOf, today, filter) {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const bal = new Map();
    for (const a of accounts)
        if (included(filter, a.id) && a.openingDate <= asOf)
            bal.set(a.id, a.openingBalance);
    for (const t of txns) {
        if (t.date > asOf || !isPosted(t, today))
            continue;
        for (const p of postings(t)) {
            const acc = byId.get(p.accountId);
            if (!acc || !bal.has(acc.id))
                continue;
            const sign = (p.flow === 'in' ? 1 : -1) * (isLiabilityType(acc.type) ? -1 : 1);
            bal.set(acc.id, bal.get(acc.id) + sign * p.amount);
        }
    }
    let cashAssets = 0, liabilities = 0;
    for (const [id, v] of bal) {
        const acc = byId.get(id);
        if (isLiabilityType(acc.type))
            liabilities += v;
        else
            cashAssets += v;
    }
    return { cashAssets, liabilities, netWorth: cashAssets - liabilities };
}
export function computePeriod(txns, month, today, filter) {
    const byId = new Map(txns.map((t) => [t.id, t]));
    const cat = new Map();
    const add = (c, v) => cat.set(c ?? UNCATEGORIZED_ID, (cat.get(c ?? UNCATEGORIZED_ID) ?? 0) + v);
    let income = 0, expenses = 0;
    for (const t of txns) {
        if (!inMonth(t.date, month) || !isPosted(t, today) || !included(filter, t.accountId))
            continue;
        if (t.type === 'income')
            income += t.amount;
        else if (t.type === 'expense') {
            expenses += t.amount;
            add(t.categoryId, t.amount);
        }
        else if (t.type === 'debt_payment' && t.interest) {
            expenses += t.interest;
            add(INTEREST_CATEGORY_ID, t.interest);
        }
        else if (t.type === 'refund') {
            const orig = t.refundOfId ? byId.get(t.refundOfId) : undefined;
            if (orig) {
                expenses -= t.amount;
                add(orig.categoryId, -t.amount);
            } // linked refund reduces the original category
            else if (t.refundAs === 'income')
                income += t.amount;
        }
    }
    return { income, expenses, expenseByCategory: cat };
}
export function categoryBreakdown(period) {
    const rows = [...period.expenseByCategory].filter(([, v]) => v !== 0);
    const total = rows.reduce((s, [, v]) => s + v, 0);
    return rows
        .map(([categoryId, amount]) => ({
        categoryId, amount, share: total > 0 ? Math.round((amount * 10000) / total) / 100 : 0,
    }))
        .sort((a, b) => b.amount - a.amount || a.categoryId.localeCompare(b.categoryId));
}
export function netCashMovement(accounts, txns, month, today, filter) {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const isIncludedCash = (id) => {
        const a = id ? byId.get(id) : undefined;
        return !!a && isCashType(a.type) && included(filter, a.id);
    };
    let inflow = 0, outflow = 0;
    for (const t of txns) {
        if (!inMonth(t.date, month) || !isPosted(t, today))
            continue;
        // transfers between two included cash accounts net to zero: drop both legs
        if (t.type === 'transfer' && isIncludedCash(t.accountId) && isIncludedCash(t.toAccountId))
            continue;
        for (const p of postings(t)) {
            if (!isIncludedCash(p.accountId))
                continue;
            if (p.flow === 'in')
                inflow += p.amount;
            else
                outflow += p.amount;
        }
    }
    return { inflow, outflow, net: inflow - outflow };
}
/* ---------- FR12: budgets ---------- */
export function budgetUse(budget, period) {
    const eligible = period.expenseByCategory.get(budget.categoryId) ?? 0;
    return {
        budgetId: budget.id, categoryId: budget.categoryId, limit: budget.limit, eligibleSpending: eligible,
        remaining: budget.limit - eligible, variance: eligible - budget.limit,
        percentUsed: budget.limit > 0 ? Math.round((eligible * 10000) / budget.limit) / 100 : 0,
    };
}
/* ---------- FR13: threshold alerts, once per threshold per budget period ---------- */
export const ALERT_THRESHOLDS = [80, 100];
export function evaluateBudgetAlerts(budgets, txns, today, fired) {
    const nextFired = new Set(fired);
    const newAlerts = [];
    const periods = new Map();
    for (const b of budgets) {
        if (b.limit <= 0)
            continue;
        if (!periods.has(b.month))
            periods.set(b.month, computePeriod(txns, b.month, today));
        const eligible = periods.get(b.month).expenseByCategory.get(b.categoryId) ?? 0;
        for (const threshold of ALERT_THRESHOLDS) {
            const key = `${b.id}|${b.month}|${threshold}`;
            if (eligible * 100 >= b.limit * threshold && !nextFired.has(key)) {
                nextFired.add(key);
                newAlerts.push({ key, budgetId: b.id, month: b.month, threshold });
            }
        }
    }
    return { newAlerts, fired: nextFired };
}
export function goalProgress(goal, today) {
    const allocated = goal.allocations.reduce((s, a) => s + a.amount, 0);
    const gap = Math.max(0, goal.target - allocated);
    const months = (Number(goal.targetDate.slice(0, 4)) - Number(today.slice(0, 4))) * 12
        + Number(goal.targetDate.slice(5, 7)) - Number(today.slice(5, 7));
    const monthsLeft = Math.max(1, months);
    return { goalId: goal.id, target: goal.target, allocated, gap, monthsLeft, requiredMonthly: Math.ceil(gap / monthsLeft) };
}
/** Allocations never touch balances; warn when they exceed cash assets (FR18). */
export const allocationsExceedFunds = (goals, cashAssets) => goals.reduce((s, g) => s + g.allocations.reduce((x, a) => x + a.amount, 0), 0) > cashAssets;
/* ---------- FR14/FR15: bills ---------- */
export function occurrenceDates(bill, from, to) {
    const out = [];
    if (bill.recurrence === 'weekly') {
        const k0 = Math.max(0, Math.floor(diffDays(bill.anchorDate, from) / 7));
        for (let k = k0;; k++) {
            const d = addDays(bill.anchorDate, 7 * k);
            if (d > to)
                break;
            if (d >= from)
                out.push(d);
        }
    }
    else {
        const step = bill.recurrence === 'monthly' ? 1 : 12;
        for (let k = 0;; k++) {
            const d = addMonthsClamped(bill.anchorDate, k * step);
            if (d > to)
                break;
            if (d >= from)
                out.push(d);
        }
    }
    return out;
}
export function billOccurrences(bills, from, to, todayLocal) {
    const res = [];
    for (const b of bills) {
        for (const dueDate of occurrenceDates(b, from, to)) {
            const transactionId = b.paid[dueDate];
            const status = transactionId ? 'paid' : b.skipped.includes(dueDate) ? 'skipped'
                : dueDate < todayLocal ? 'overdue' : 'due';
            res.push({ billId: b.id, name: b.name, amount: b.amount, dueDate, status, transactionId });
        }
    }
    return res.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.billId.localeCompare(b.billId));
}
/** In-app reminder decision in the user's timezone, deferred during quiet hours (FR14). */
export function reminderState(occ, now, settings, leadDays = 3) {
    if (occ.status !== 'due' && occ.status !== 'overdue')
        return 'none';
    const local = localParts(now, settings.timezone);
    if (local.date < addDays(occ.dueDate, -leadDays))
        return 'none';
    const { startHour: s, endHour: e } = settings.quietHours;
    const quiet = s === e ? false : s < e ? local.hour >= s && local.hour < e : local.hour >= s || local.hour < e;
    return quiet ? 'deferred' : 'send';
}
export { monthEnd, monthOf };
