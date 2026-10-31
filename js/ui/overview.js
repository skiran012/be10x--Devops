import { buildOverview, categoryName } from '../domain/overview.js';
import { h, inr, parseRupeesToPaise, section, dataTable, barChart } from './dom.js';

// Overview page state lives outside render so re-renders (triggered by ledger changes) keep filters.
const view = { month: null, accountIds: undefined, form: { amount: '', date: '', accountId: '', categoryId: '' }, errors: {}, saved: false };

/** FR21/FR22: every section is derived from buildOverview(), a pure function of the ledger snapshot. */
export function renderOverview(ledger) {
  const data = ledger.getSnapshot();
  const today = ledger.today();
  view.month ||= today.slice(0, 7);
  view.form.date ||= today;
  view.form.accountId ||= data.accounts[0]?.id ?? '';
  const rerender = () => document.dispatchEvent(new CustomEvent('spendsight:rerender'));
  const o = buildOverview(data, { month: view.month, today, accountIds: view.accountIds });
  const empty = data.transactions.length === 0;
  const st = (isEmpty) => (isEmpty ? 'empty' : 'ready');
  const acc = (id) => data.accounts.find((a) => a.id === id)?.name ?? id;

  const filters = h('div', { class: 'filters' },
    h('label', {}, 'Month ', h('input', { type: 'month', value: view.month, onChange: (e) => { if (e.target.value) { view.month = e.target.value; rerender(); } } })),
    h('fieldset', {}, h('legend', {}, 'Included accounts'),
      data.accounts.map((a) => {
        const on = !view.accountIds || view.accountIds.includes(a.id);
        return h('label', {}, h('input', { type: 'checkbox', checked: on, onChange: () => {
          const cur = view.accountIds ?? data.accounts.map((x) => x.id);
          const next = on ? cur.filter((i) => i !== a.id) : [...cur, a.id];
          view.accountIds = next.length === data.accounts.length ? undefined : next;
          rerender();
        } }), ' ', a.name);
      })));

  const alerts = data.alerts.length
    ? h('div', { role: 'status', class: 'alerts' }, data.alerts.map((a) => {
      const cat = categoryName(data, data.budgets.find((b) => b.id === a.budgetId)?.categoryId ?? '');
      return h('p', {}, `Budget alert: ${cat} reached ${a.threshold}% of its limit for ${a.month}.`);
    })) : null;

  return h('div', { class: 'stack' },
    h('p', { class: 'note' }, 'Tracking only. SpendSight never moves money. All amounts in INR.'),
    filters, alerts,
    section('Financial position', st(empty), { emptyText: 'Add an account and a transaction to see your position.' },
      dataTable('Cash assets, liabilities and net worth', ['Measure', 'Amount'], [
        ['Cash assets', inr(o.position.cashAssets)], ['Liabilities', inr(o.position.liabilities)], ['Net worth', inr(o.position.netWorth)]])),
    section('Income and expenses', st(empty), { emptyText: 'No transactions in this period.' },
      dataTable('Income, expenses and net cash movement', ['Measure', 'Amount'], [
        ['Income', inr(o.income)], ['Expenses', inr(o.expenses)], ['Income minus expenses', inr(o.incomeMinusExpenses)],
        ['Cash inflow', inr(o.cash.inflow)], ['Cash outflow', inr(o.cash.outflow)], ['Net cash movement', inr(o.cash.net)],
        ['Difference (debt principal, card payments, non-cash expenses)', inr(o.nonExpenseDifference)]])),
    section('Spending by category', st(o.categories.length === 0), { emptyText: 'No spending in this period.' },
      barChart('Spending by category', o.categories.map((c) => ({ name: c.name, value: c.amount }))),
      dataTable('Spending by category', ['Category', 'Amount', 'Share'], o.categories.map((c) => [c.name, inr(c.amount), `${c.share.toFixed(2)}%`]))),
    section('Budgets', st(o.budgets.length === 0), { emptyText: 'No budgets for this month.' },
      dataTable('Budget use', ['Category', 'Limit', 'Spent', 'Remaining', 'Variance', 'Used'], o.budgets.map((b) => [
        categoryName(data, b.categoryId), inr(b.limit), inr(b.eligibleSpending),
        b.remaining < 0 ? `${inr(b.remaining)} (overspent)` : inr(b.remaining), inr(b.variance), `${b.percentUsed}%`]))),
    section('Upcoming bills', st(o.bills.length === 0), { emptyText: 'No bills due in the next 30 days.' },
      dataTable('Bills', ['Bill', 'Due', 'Amount', 'Status'], o.bills.map((b) => [b.name, b.dueDate, inr(b.amount), b.status])),
      h('p', { class: 'note' }, 'Bill status never means a payment was made by SpendSight.')),
    section('Goals', st(o.goals.length === 0), { emptyText: 'No goals yet.' },
      o.allocationWarning ? h('p', { role: 'alert' }, 'Allocations exceed your cash assets.') : null,
      dataTable('Goal progress', ['Goal', 'Target', 'Allocated', 'Remaining gap', 'Required per month'], o.goals.map((g, i) => [
        data.goals[i].name, inr(g.target), inr(g.allocated), inr(g.gap), inr(g.requiredMonthly)]))),
    section('Recent transactions', st(o.recent.length === 0), { emptyText: 'No transactions yet.' },
      dataTable('Recent transactions', ['Date', 'Type', 'Account', 'Amount'], o.recent.map((t) => [t.date, t.type.replace('_', ' '), acc(t.accountId), inr(t.amount)]))),
    quickAdd(ledger, data, rerender));
}

function quickAdd(ledger, data, rerender) {
  const f = view.form;
  const submit = (e) => {
    e.preventDefault();
    const paise = parseRupeesToPaise(f.amount);
    const res = ledger.addTransaction({ type: 'expense', amount: paise ?? 0, date: f.date, accountId: f.accountId, categoryId: f.categoryId || undefined });
    if (res.ok) { view.errors = {}; view.saved = true; f.amount = ''; }
    else { view.saved = false; view.errors = paise === null ? { ...res.errors, amount: 'Enter a valid amount, for example 250.50.' } : res.errors; }
    rerender(); // on failure the typed values stay in view.form so nothing is lost (BRD section 2)
  };
  const err = (k) => (view.errors[k] ? h('p', { role: 'alert' }, view.errors[k]) : null);
  return h('section', { class: 'card', 'aria-labelledby': 'h-add' }, h('h2', { id: 'h-add' }, 'Add expense'),
    h('form', { onSubmit: submit, novalidate: true },
      h('label', {}, 'Amount (INR) ', h('input', { value: f.amount, 'aria-invalid': !!view.errors.amount, onInput: (e) => { f.amount = e.target.value; } })), err('amount'),
      h('label', {}, 'Date ', h('input', { type: 'date', value: f.date, onChange: (e) => { f.date = e.target.value; } })), err('date'),
      h('label', {}, 'Account ', h('select', { onChange: (e) => { f.accountId = e.target.value; } },
        data.accounts.map((a) => h('option', { value: a.id, selected: a.id === f.accountId }, a.name)))), err('accountId'),
      h('label', {}, 'Category ', h('select', { onChange: (e) => { f.categoryId = e.target.value; } },
        h('option', { value: '' }, 'Select…'),
        data.categories.map((c) => h('option', { value: c.id, selected: c.id === f.categoryId }, c.name)))), err('categoryId'),
      h('button', { type: 'submit' }, 'Save expense'),
      view.saved ? h('p', { role: 'status' }, 'Expense saved. Figures updated.') : null));
}
