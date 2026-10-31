// Tiny DOM helpers. Text is always set via textContent/createTextNode, never innerHTML (no injection).
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
export const inr = (paise) => fmt.format(paise / 100);
export function parseRupeesToPaise(s) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(s).trim())) return null;
  const [w, f = ''] = String(s).trim().split('.');
  return Number(w) * 100 + Number(f.padEnd(2, '0'));
}

/** Every section renders loading, error (with retry), empty or ready (BRD section 2 core experience). */
export function section(title, status, { onRetry, emptyText = '' } = {}, ...content) {
  const id = 'h-' + title.replace(/\s+/g, '-').toLowerCase();
  const body = [];
  if (status === 'loading') body.push(h('p', { role: 'status' }, `Loading ${title.toLowerCase()}…`));
  else if (status === 'error') body.push(h('p', { role: 'alert' }, `Could not load ${title.toLowerCase()}. `, h('button', { onClick: onRetry }, 'Retry')));
  else if (status === 'empty') body.push(h('p', {}, emptyText));
  else body.push(...content);
  return h('section', { class: 'card', 'aria-labelledby': id }, h('h2', { id }, title), ...body);
}

export function dataTable(caption, head, rows) {
  return h('table', {},
    h('caption', { class: 'sr' }, caption),
    h('thead', {}, h('tr', {}, head.map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, j) => (j === 0 ? h('th', { scope: 'row' }, c) : h('td', {}, c))))))
  );
}

/** SVG bar chart; always rendered together with a dataTable carrying the same numbers (FR22). */
export function barChart(label, items) {
  const ns = 'http://www.w3.org/2000/svg';
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('viewBox', `0 0 300 ${items.length * 22}`);
  svg.setAttribute('class', 'chart');
  items.forEach((it, i) => {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(0 ${i * 22})`);
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', '90'); rect.setAttribute('height', '16'); rect.setAttribute('fill', '#2b6cb0');
    rect.setAttribute('width', String(Math.max(0, (Math.abs(it.value) / max) * 200)));
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('y', '12'); text.setAttribute('font-size', '11'); text.textContent = it.name;
    g.append(rect, text);
    svg.append(g);
  });
  return svg;
}
