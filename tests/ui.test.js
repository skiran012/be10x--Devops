// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountApp } from '../js/app.js';
import { fixtureData } from '../js/fixtures.js';

const now = () => new Date('2026-10-31T06:00:00Z');
const tick = () => new Promise((r) => setTimeout(r, 0));
let root;
const text = () => root.textContent;
const byText = (sel, t) => [...root.querySelectorAll(sel)].find((e) => e.textContent === t);

async function mount(loader) {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  mountApp(root, { loader, now });
  await tick(); await tick();
}

describe('FR21 Overview UI states', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('FR21 shows loading, then ready figures from the ledger', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app');
    mountApp(root, { loader: async () => fixtureData(), now });
    expect(root.querySelector('[role=status]').textContent).toMatch(/Loading/);
    await tick(); await tick();
    expect(text()).toContain('₹96,600.00');
    expect(text()).toContain('₹4,600.00');
  });

  it('FR21 shows an error state whose retry recovers', async () => {
    let calls = 0;
    await mount(async () => { if (calls++ === 0) throw new Error('x'); return fixtureData(); });
    expect(root.querySelector('[role=alert]')).toBeTruthy();
    byText('button', 'Retry').click();
    await tick(); await tick();
    expect(text()).toContain('Net worth');
  });

  it('FR21 shows empty states for a new user', async () => {
    await mount(async () => ({ ...fixtureData(), transactions: [], bills: [], budgets: [], goals: [] }));
    expect(text()).toContain('Add an account and a transaction to see your position.');
    expect(text()).toContain('No budgets for this month.');
  });

  it('FR22 every chart has a table with the same numbers', async () => {
    await mount(async () => fixtureData());
    expect(root.querySelector('svg[aria-label="Spending by category"]')).toBeTruthy();
    const table = [...root.querySelectorAll('table')].find((t) => t.querySelector('caption').textContent === 'Spending by category');
    expect(table.textContent).toContain('₹20,000.00');
  });

  it('UAT07 validation error, then success updates totals live', async () => {
    await mount(async () => fixtureData());
    byText('button', 'Save expense').click();
    expect(root.querySelectorAll('[role=alert]').length).toBeGreaterThan(0);
    const amount = [...root.querySelectorAll('label')].find((l) => l.textContent.startsWith('Amount')).querySelector('input');
    amount.value = '500'; amount.dispatchEvent(new Event('input'));
    const cat = [...root.querySelectorAll('label')].find((l) => l.textContent.startsWith('Category')).querySelector('select');
    cat.value = 'cat-dining'; cat.dispatchEvent(new Event('change'));
    byText('button', 'Save expense').click();
    expect(text()).toContain('Expense saved. Figures updated.');
    expect(text()).toContain('₹96,100.00');
  });

  it('FR03 Transactions page: recategorize and delete flow back to the Overview', async () => {
    await mount(async () => fixtureData());
    byText('button', 'Transactions').click();
    const sel = root.querySelector('select[aria-label="Category for t9"]');
    sel.value = 'cat-dining'; sel.dispatchEvent(new Event('change'));
    byText('button', 'Delete t9').click();
    expect(text()).toContain('Transaction deleted.');
    byText('button', 'Overview').click();
    expect(text()).toContain('₹1,00,600.00');
  });

  it('FR02 Accounts page: validation error then account saved', async () => {
    await mount(async () => fixtureData());
    byText('button', 'Accounts').click();
    byText('button', 'Save account').click();
    expect(text()).toContain('Enter an account name.');
    const name = [...root.querySelectorAll('label')].find((l) => l.textContent.startsWith('Name')).querySelector('input');
    name.value = 'Emergency'; name.dispatchEvent(new Event('input'));
    byText('button', 'Save account').click();
    expect(text()).toContain('Account saved.');
    expect(text()).toContain('Emergency');
  });
});
