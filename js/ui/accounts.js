import { computePosition } from '../domain/calc.js';
import { h, inr, parseRupeesToPaise, section, dataTable } from './dom.js';

const TYPES = ['cash', 'bank', 'savings', 'card', 'loan'];
const state = { name: '', type: 'bank', opening: '0', date: '', errors: {}, ok: false };

// FR02: create accounts with opening balances and dates; archived accounts keep history.
export function renderAccounts(ledger) {
  const data = ledger.getSnapshot();
  const today = ledger.today();
  state.date ||= today;
  const rerender = () => document.dispatchEvent(new CustomEvent('spendsight:rerender'));
  const balance = (a) => {
    const p = computePosition([a], data.transactions, today, today);
    return a.type === 'card' || a.type === 'loan' ? p.liabilities : p.cashAssets;
  };
  const submit = (e) => {
    e.preventDefault();
    const paise = parseRupeesToPaise(state.opening);
    const res = ledger.addAccount({ name: state.name, type: state.type, openingBalance: paise ?? -1, openingDate: state.date });
    if (res.ok) { state.errors = {}; state.ok = true; state.name = ''; state.opening = '0'; }
    else { state.ok = false; state.errors = res.errors; }
    rerender();
  };
  const err = (k) => (state.errors[k] ? h('p', { role: 'alert' }, state.errors[k]) : null);

  return h('div', { class: 'stack' },
    section('Accounts', data.accounts.length ? 'ready' : 'empty', { emptyText: 'No accounts yet. Add one below.' },
      dataTable('Accounts', ['Account', 'Type', 'Balance', 'State'], data.accounts.map((a) => [a.name, a.type, inr(balance(a)), a.archived ? 'Archived' : 'Active'])),
      data.accounts.filter((a) => !a.archived).map((a) => h('button', { onClick: () => { ledger.archiveAccount(a.id); } }, `Archive ${a.name}`))),
    h('section', { class: 'card', 'aria-labelledby': 'h-addacc' }, h('h2', { id: 'h-addacc' }, 'Add account'),
      h('form', { onSubmit: submit, novalidate: true },
        h('label', {}, 'Name ', h('input', { value: state.name, onInput: (e) => { state.name = e.target.value; } })), err('name'),
        h('label', {}, 'Type ', h('select', { onChange: (e) => { state.type = e.target.value; } },
          TYPES.map((t) => h('option', { selected: t === state.type }, t)))),
        h('label', {}, 'Opening balance (INR) ', h('input', { value: state.opening, onInput: (e) => { state.opening = e.target.value; } })), err('openingBalance'),
        h('label', {}, 'Opening date ', h('input', { type: 'date', value: state.date, onChange: (e) => { state.date = e.target.value; } })), err('openingDate'),
        h('button', { type: 'submit' }, 'Save account'),
        state.ok ? h('p', { role: 'status' }, 'Account saved.') : null)));
}
