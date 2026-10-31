import { categoryName } from '../domain/overview.js';
import { h, inr, section } from './dom.js';

let message = null;

// FR03/FR05: list, recategorize and delete; every change flows to the Overview through the ledger store.
export function renderTransactions(ledger) {
  const data = ledger.getSnapshot();
  const acc = (id) => data.accounts.find((a) => a.id === id)?.name ?? '';
  const rows = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const run = (res, okText) => {
    message = res.ok ? { kind: 'ok', text: okText } : { kind: 'err', text: Object.values(res.errors).join(' ') };
    document.dispatchEvent(new CustomEvent('spendsight:rerender'));
  };

  const table = h('table', {}, h('caption', { class: 'sr' }, 'All transactions'),
    h('thead', {}, h('tr', {}, ['Date', 'Type', 'Account', 'Category', 'Amount', 'Actions'].map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, rows.map((t) => h('tr', {},
      h('th', { scope: 'row' }, t.date),
      h('td', {}, t.type.replace('_', ' ')),
      h('td', {}, acc(t.accountId) + (t.toAccountId ? ` → ${acc(t.toAccountId)}` : '')),
      h('td', {}, t.type === 'expense'
        ? h('select', { 'aria-label': `Category for ${t.id}`, onChange: (e) => run(ledger.recategorize(t.id, e.target.value), 'Category updated.') },
          h('option', { value: '', disabled: true, selected: !t.categoryId }, 'Select…'),
          data.categories.map((c) => h('option', { value: c.id, selected: c.id === t.categoryId }, c.name)))
        : (t.categoryId ? categoryName(data, t.categoryId) : '')),
      h('td', {}, inr(t.amount)),
      h('td', {}, h('button', { onClick: () => run(ledger.deleteTransaction(t.id), 'Transaction deleted.') }, `Delete ${t.id}`))))));

  return h('div', { class: 'stack' },
    section('Transactions', rows.length ? 'ready' : 'empty', { emptyText: 'No transactions yet. Add an expense from the Overview.' },
      message ? h('p', { role: message.kind === 'ok' ? 'status' : 'alert' }, message.text) : null, table));
}
