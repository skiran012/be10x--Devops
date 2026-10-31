import { Ledger } from './domain/ledger.js';
import { localDate } from './domain/dates.js';
import { loadLedger } from './data.js';
import { h, section } from './ui/dom.js';
import { renderOverview } from './ui/overview.js';
import { renderAccounts } from './ui/accounts.js';
import { renderTransactions } from './ui/transactions.js';

export const TZ = 'Asia/Kolkata';
const PAGES = { Overview: renderOverview, Accounts: renderAccounts, Transactions: renderTransactions };

/**
 * App shell. Update mechanism: ledger.subscribe() fires synchronously after every mutation and the
 * current page is re-rendered from the new immutable snapshot (deterministic, no polling).
 */
export function mountApp(root, { loader = loadLedger, now = () => new Date() } = {}) {
  let ledger = null;
  let status = 'loading';
  let page = 'Overview';
  let unsubscribe = () => {};

  const render = () => {
    const active = document.activeElement;
    const keep = active && active.id ? active.id : null;
    const nav = h('nav', { 'aria-label': 'Primary' }, Object.keys(PAGES).map((p) =>
      h('button', { 'aria-current': p === page ? 'page' : null, onClick: () => { page = p; render(); } }, p)));
    const body = status !== 'ready'
      ? section('Financial position', status, { onRetry: load })
      : PAGES[page](ledger);
    root.replaceChildren(h('header', { class: 'top' }, h('strong', {}, 'SpendSight'), nav), h('main', {}, h('h1', {}, page), body));
    if (keep) document.getElementById(keep)?.focus();
  };

  function load() {
    status = 'loading'; render();
    loader().then((d) => {
      unsubscribe();
      ledger = new Ledger(d, now, (x) => localDate(x, TZ));
      unsubscribe = ledger.subscribe(render);
      status = 'ready'; render();
    }, () => { status = 'error'; render(); });
  }
  document.addEventListener('spendsight:rerender', render);
  load();
  return { render };
}
