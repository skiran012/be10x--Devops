import { evaluateBudgetAlerts } from './calc.js';
import { isValidDate } from './dates.js';
import { isCashType, isLiabilityType, } from './types.js';
const fail = (errors) => ({ ok: false, errors });
/** Validation errors are explained before posting (FR03, FR17, BRD §5 validation rules). */
export function validateTransaction(t, data, selfId) {
    const e = {};
    const acc = (id) => data.accounts.find((a) => a.id === id);
    if (!Number.isInteger(t.amount) || t.amount <= 0)
        e.amount = 'Enter an amount greater than zero.';
    if (!isValidDate(t.date))
        e.date = 'Enter a valid date.';
    const a = acc(t.accountId);
    if (!a)
        e.accountId = 'Select an account.';
    else if (a.archived)
        e.accountId = 'Archived accounts cannot receive new entries.';
    else if (isValidDate(t.date) && t.date < a.openingDate)
        e.date = 'Date is before the account opening date.';
    if (t.type === 'income' && a && isLiabilityType(a.type))
        e.accountId = 'Choose a cash account.';
    if (t.type === 'expense' && !t.categoryId)
        e.categoryId = 'Select a category.';
    if (t.type === 'transfer') {
        const to = acc(t.toAccountId);
        if (!to)
            e.toAccountId = 'Select a destination account.';
        else if (to.id === t.accountId)
            e.toAccountId = 'Destination must differ from source.';
        else if (to.archived)
            e.toAccountId = 'Archived accounts cannot receive new entries.';
    }
    if (t.type === 'debt_payment') {
        const to = acc(t.toAccountId);
        if (!to || to.type !== 'loan')
            e.toAccountId = 'Select a loan account.';
        if (a && !isCashType(a.type))
            e.accountId = 'Pay from a cash account.';
        if ((t.principal ?? 0) < 0 || (t.interest ?? 0) < 0 || (t.principal ?? 0) + (t.interest ?? 0) !== t.amount) {
            e.amount = 'Principal plus interest must equal the total payment.';
        }
    }
    if (t.type === 'refund') {
        if (t.refundOfId) {
            const orig = data.transactions.find((x) => x.id === t.refundOfId);
            if (!orig || orig.type !== 'expense')
                e.refundOfId = 'Link a refund to an existing expense.';
        }
        else if (t.refundAs !== 'income')
            e.refundOfId = 'Link the refund to an expense or classify it as income.';
    }
    void selfId;
    return e;
}
export class Ledger {
    now;
    todayOf;
    data;
    listeners = new Set();
    seq = 1000;
    constructor(seed, now = () => new Date(), todayOf = (d) => d.toISOString().slice(0, 10)) {
        this.now = now;
        this.todayOf = todayOf;
        this.data = { ...seed };
        this.reevaluateAlerts();
    }
    /**
     * Update mechanism: every mutation builds a new immutable snapshot and synchronously notifies
     * subscribers (React useSyncExternalStore). All figures are pure functions of the snapshot, so
     * recalculation is deterministic and identical after create, edit, delete or recategorize.
     */
    subscribe = (fn) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
    getSnapshot = () => this.data;
    today = () => this.todayOf(this.now());
    commit(next) {
        this.data = { ...this.data, ...next, revision: this.data.revision + 1 };
        this.reevaluateAlerts();
        this.listeners.forEach((l) => l());
    }
    // Edits re-evaluate thresholds; keys already fired never notify again (FR13).
    reevaluateAlerts() {
        const { newAlerts, fired } = evaluateBudgetAlerts(this.data.budgets, this.data.transactions, this.today(), new Set(this.data.firedAlerts));
        if (newAlerts.length)
            this.data = { ...this.data, firedAlerts: [...fired], alerts: [...this.data.alerts, ...newAlerts] };
    }
    addTransaction(input) {
        const errors = validateTransaction(input, this.data);
        if (Object.keys(errors).length)
            return fail(errors);
        const id = `t${++this.seq}`;
        this.commit({ transactions: [...this.data.transactions, { ...input, id, version: 1 }] });
        return { ok: true, id };
    }
    updateTransaction(id, patch, expectedVersion) {
        const cur = this.data.transactions.find((t) => t.id === id);
        if (!cur)
            return fail({ form: 'Transaction not found.' });
        if (cur.version !== expectedVersion)
            return fail({ form: 'This transaction changed elsewhere. Refresh and review.' });
        const next = { ...cur, ...patch, id, version: cur.version + 1 };
        const errors = validateTransaction(next, this.data, id);
        if (Object.keys(errors).length)
            return fail(errors);
        this.commit({ transactions: this.data.transactions.map((t) => (t.id === id ? next : t)) });
        return { ok: true, id };
    }
    recategorize(id, categoryId) {
        const cur = this.data.transactions.find((t) => t.id === id);
        return cur ? this.updateTransaction(id, { categoryId }, cur.version) : fail({ form: 'Transaction not found.' });
    }
    deleteTransaction(id) {
        if (this.data.transactions.some((t) => t.refundOfId === id)) {
            return fail({ form: 'Delete the linked refunds first.' });
        }
        const bills = this.data.bills.map((b) => ({
            ...b, paid: Object.fromEntries(Object.entries(b.paid).filter(([, tid]) => tid !== id)),
        }));
        this.commit({ transactions: this.data.transactions.filter((t) => t.id !== id), bills });
        return { ok: true, id };
    }
    /** FR15: links an EXISTING expense to a bill occurrence; never creates a transaction. */
    linkBill(billId, dueDate, transactionId) {
        const bill = this.data.bills.find((b) => b.id === billId);
        const txn = this.data.transactions.find((t) => t.id === transactionId);
        if (!bill || !txn)
            return fail({ form: 'Bill or transaction not found.' });
        if (txn.type !== 'expense')
            return fail({ transactionId: 'Only an expense can be linked to a bill.' });
        if (bill.paid[dueDate])
            return fail({ form: 'This bill is already marked paid.' });
        if (this.data.bills.some((b) => Object.values(b.paid).includes(transactionId))) {
            return fail({ transactionId: 'This transaction is already linked to a bill.' });
        }
        this.commit({
            bills: this.data.bills.map((b) => (b.id === billId
                ? { ...b, paid: { ...b.paid, [dueDate]: transactionId }, skipped: b.skipped.filter((d) => d !== dueDate) } : b)),
        });
        return { ok: true, id: billId };
    }
    skipBill(billId, dueDate) {
        this.commit({ bills: this.data.bills.map((b) => (b.id === billId && !b.paid[dueDate] ? { ...b, skipped: [...b.skipped, dueDate] } : b)) });
        return { ok: true, id: billId };
    }
    /** FR18: allocation changes goal state only, never transactions or balances. */
    allocate(goalId, amount) {
        if (!Number.isInteger(amount) || amount <= 0)
            return fail({ amount: 'Enter an amount greater than zero.' });
        const date = this.today();
        this.commit({
            goals: this.data.goals.map((g) => (g.id === goalId
                ? { ...g, allocations: [...g.allocations, { id: `a${++this.seq}`, amount, date }] } : g)),
        });
        return { ok: true, id: goalId };
    }
    /** FR02: accounts need a name and a non-negative opening balance; MVP accounts are INR only. */
    addAccount(input) {
        const errors = {};
        if (!input.name.trim())
            errors.name = 'Enter an account name.';
        if (!Number.isInteger(input.openingBalance) || input.openingBalance < 0)
            errors.openingBalance = 'Enter an opening balance of zero or more.';
        if (!isValidDate(input.openingDate))
            errors.openingDate = 'Enter a valid opening date.';
        if (Object.keys(errors).length)
            return fail(errors);
        const id = `acc${++this.seq}`;
        this.commit({ accounts: [...this.data.accounts, { ...input, name: input.name.trim(), id }] });
        return { ok: true, id };
    }
    /** FR02: archived accounts keep history but cannot receive new entries. */
    archiveAccount(id) {
        this.commit({ accounts: this.data.accounts.map((a) => (a.id === id ? { ...a, archived: true } : a)) });
        return { ok: true, id };
    }
}
