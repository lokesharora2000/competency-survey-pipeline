/* UI for the survey tools. All processing happens in the browser. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');
  const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const download = (name, text) => {
    const a = h('a', {href: URL.createObjectURL(new Blob([text], {type: 'text/csv'})), download: name});
    document.body.append(a); a.click(); a.remove();
  };
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? NaN : Number(v));

  // ---- State -----------------------------------------------------------------------
  const S = {table: null, name: '', items: {}, group: '', text: '', human: '', min: 1, max: 5, info: {}};
  const DEFAULT_CODEBOOK = [
    {code: 'time_workload', terms: 'time, workload, duties'},
    {code: 'need_hands_on', terms: 'hands-on, worked example, practice'},
    {code: 'confidence_stats', terms: 'statistic, which test, intimidat, method questions'},
    {code: 'institutional_support', terms: 'institution, budget, role'},
    {code: 'peer_community', terms: 'colleagues, community, peer'},
    {code: 'tools_access', terms: 'licen, nvivo, install, software'},
  ];
  let codebook = DEFAULT_CODEBOOK.map((c) => ({...c}));
  const sortState = {col: null, dir: 1};

  // ---- Loading ---------------------------------------------------------------------
  const err = (m) => { const e = $('#err'); e.hidden = !m; e.textContent = m || ''; };
  const isNumericCol = (t, c) => {
    const vals = t.data.map((r) => r[c]).filter((v) => v !== '');
    if (vals.length < 5) return false;
    const nums = vals.map(Number).filter((v) => !Number.isNaN(v));
    const distinct = new Set(nums);
    return nums.length / vals.length >= 0.9 && distinct.size >= 2 && distinct.size <= 11 && nums.every(Number.isInteger);
  };
  const looksLikeMeta = (c) => /(^id$|_id$|^id_|duration|progress|finished|status|latitude|longitude|recorded|response ?id|distribution|ip ?address)/i.test(c);

  function load(table, name, hints = {}) {
    err('');
    if (!table.data.length) { err('No rows found in that file.'); return; }
    S.table = table; S.name = name; S.info = hints.info || {};
    const numeric = table.cols.filter((c) => isNumericCol(table, c));
    const chosen = hints.prefix ? numeric.filter((c) => c.startsWith(hints.prefix)) : numeric.filter((c) => !looksLikeMeta(c));
    S.items = {};
    numeric.forEach((c) => { S.items[c] = {on: chosen.includes(c), rev: false}; });
    const avgLen = (c) => table.data.reduce((s, r) => s + r[c].length, 0) / table.data.length;
    const textCols = table.cols.filter((c) => !numeric.includes(c) && avgLen(c) > 25).sort((a, b) => avgLen(b) - avgLen(a));
    S.text = hints.text || textCols[0] || '';
    const distinct = (c) => new Set(table.data.map((r) => r[c]).filter(Boolean)).size;
    const cats = table.cols.filter((c) => c !== S.text && !numeric.includes(c) && distinct(c) >= 2 && distinct(c) <= 12);
    S.group = hints.group || cats[0] || '';
    S.human = hints.human || '';
    autoScale();
    renderSetup(); renderAll();
    $('#status').textContent = `${name}: ${table.data.length} rows, ${chosen.length} items selected.`;
  }
  function autoScale() {
    const vals = Object.keys(S.items).filter((c) => S.items[c].on).flatMap((c) => S.table.data.map((r) => num(r[c])).filter(Number.isFinite));
    S.min = vals.length ? Math.min(...vals) : 1; S.max = vals.length ? Math.max(...vals) : 5;
    $('#scale-min').value = S.min; $('#scale-max').value = S.max;
  }
  async function fetchTable(path) { const r = await fetch(path); if (!r.ok) throw new Error(path); return Stats.toTable(Stats.parseCSV(await r.text())); }
  async function loadSample(kind) {
    try {
      const isPilot = kind === 'pilot';
      const [t, items] = await Promise.all([fetchTable(isPilot ? 'data/pilot_survey.csv' : 'data/sample_survey.csv'), fetchTable(isPilot ? 'data/pilot_items.csv' : 'data/instrument_items.csv')]);
      const info = {};
      items.data.forEach((r) => { info[r.item_id] = {domain: r.domain, text: r.text}; });
      load(t, isPilot ? 'Pilot sample (synthetic)' : 'Sample survey (synthetic)',
        {info, prefix: isPilot ? 'p' : 'pre_', text: 'open_text', group: 'role', human: 'gold_themes'});
      if (isPilot) { Object.keys(S.items).forEach((c) => { S.items[c].on = /^p\d\d$/.test(c); }); autoScale(); renderSetup(); renderAll(); }
    } catch (e) { err('Could not load the sample (' + e.message + '). Open the live site, or serve this folder with a local web server.'); }
  }
  function infoFor(col) {
    const key = col.replace(/^(pre|post)_/, '');
    return S.info[col] || S.info[key] || {text: (S.table.qtext && S.table.qtext[col]) || '', domain: ''};
  }
  const label = (col) => { const t = infoFor(col).text; return t ? `${col}: ${t.length > 70 ? t.slice(0, 67) + '...' : t}` : col; };

  // ---- Setup panel -----------------------------------------------------------------
  function fillSelect(sel, cols, current, none) {
    sel.replaceChildren(...(none ? [h('option', {value: '', text: none})] : []), ...cols.map((c) => h('option', {value: c, text: c, selected: c === current})));
    sel.value = current || '';
  }
  function renderSetup() {
    const cols = S.table.cols;
    fillSelect($('#sel-group'), cols, S.group, '(none)'); fillSelect($('#sel-text'), cols, S.text, '(none)'); fillSelect($('#sel-human'), cols, S.human, '(none)');
    $('#items').replaceChildren(...Object.keys(S.items).map((c) => h('span', {class: 'row', style: 'gap:.4rem;flex-wrap:nowrap'},
      h('label', {title: label(c)}, h('input', {type: 'checkbox', checked: S.items[c].on, onchange: (e) => { S.items[c].on = e.target.checked; autoScale(); renderAll(); }}), c),
      h('label', {class: 'note'}, h('input', {type: 'checkbox', checked: S.items[c].rev, onchange: (e) => { S.items[c].rev = e.target.checked; renderAll(); }}), 'rev'))));
  }
  const selected = () => Object.keys(S.items).filter((c) => S.items[c].on);
  const value = (r, c) => { const v = num(r[c]); return S.items[c] && S.items[c].rev && Number.isFinite(v) ? S.min + S.max - v : v; };

  // ---- Instrument review -----------------------------------------------------------
  function renderReview() {
    const out = $('#review-out'); out.replaceChildren();
    const cols = selected();
    if (!S.table) return out.append(h('p', {class: 'note', text: 'Load a sample or upload a CSV to start.'}));
    if (cols.length < 3) return out.append(h('p', {class: 'note', text: 'Select at least 3 item columns in Column setup.'}));
    const T = {ceil: +$('#t-ceil').value, rest: +$('#t-rest').value, miss: +$('#t-miss').value, red: +$('#t-red').value};
    const M = S.table.data.map((r) => cols.map((c) => value(r, c)));
    const R = Stats.review(M, {min: S.min, max: S.max, redundantR: T.red});
    const names = cols;
    const rows = R.items.map((it) => {
      const flags = [], fixes = [];
      const col = names[it.j];
      if (it.itemRest < -0.1) { flags.push(['bad', 'negative']); fixes.push({col, sev: 0, text: `${col} correlates negatively with the rest (r = ${f2(it.itemRest)}). It is probably reverse-worded.`, action: S.items[col].rev ? null : 'rev'}); }
      else if (it.itemRest < T.rest) { flags.push(['bad', 'weak']); fixes.push({col, sev: 1, text: `${col} has a weak link to the rest of the scale (r = ${f2(it.itemRest)}). Reword it or move it to a different scale.`}); }
      if (it.ceilPct >= T.ceil) { flags.push(['warn', 'ceiling']); fixes.push({col, sev: 2, text: `${f1(it.ceilPct)}% choose the top answer on ${col}. There is little room to detect growth. Make the wording harder or widen the scale.`}); }
      if (it.floorPct >= T.ceil) { flags.push(['warn', 'floor']); fixes.push({col, sev: 2, text: `${f1(it.floorPct)}% choose the bottom answer on ${col}. Consider easier wording.`}); }
      if (it.missingPct > T.miss) { flags.push(['warn', 'skipped']); fixes.push({col, sev: 2, text: `${f1(it.missingPct)}% skipped ${col}. Check whether the wording confuses people or the item does not apply to everyone.`}); }
      if (it.sd < 0.5 && it.ceilPct < T.ceil && it.floorPct < T.ceil) { flags.push(['warn', 'low variance']); }
      if (it.alphaIfDeleted > R.alpha + 0.005 && !flags.some((f) => f[0] === 'bad')) { flags.push(['warn', 'lowers alpha']); fixes.push({col, sev: 3, text: `Dropping ${col} would raise alpha from ${f2(R.alpha)} to ${f2(it.alphaIfDeleted)}.`}); }
      return {it, col, flags, fixes};
    });
    R.pairs.forEach((p) => {
      const a = names[p.i], b = names[p.j];
      [a, b].forEach((c) => rows.find((r) => r.col === c).flags.push(['warn', 'redundant']));
      rows[0].fixes.push({col: a, sev: 3, text: `${a} and ${b} correlate at r = ${f2(p.r)}. They probably ask the same thing. Keep one.`});
    });
    const fixes = rows.flatMap((r) => r.fixes).sort((a, b) => a.sev - b.sev);
    const a = R.alpha;
    const aTxt = a >= 0.9 ? 'very high (check for redundancy)' : a >= 0.8 ? 'good' : a >= 0.7 ? 'acceptable' : 'low';

    out.append(
      h('div', {class: 'stats'},
        h('div', {class: 'stat'}, h('b', {text: R.k}), h('span', {text: 'items reviewed'})),
        h('div', {class: 'stat'}, h('b', {text: R.n}), h('span', {text: 'respondents'})),
        h('div', {class: 'stat'}, h('b', {text: f2(a)}), h('span', {text: `Cronbach's alpha, ${aTxt}`})),
        h('div', {class: 'stat'}, h('b', {text: f2(R.meanInterItem)}), h('span', {text: 'average inter-item correlation'})),
        h('div', {class: 'stat'}, h('b', {text: fixes.length}), h('span', {text: 'suggested edits'}))),
      h('div', {class: 'card'}, h('h3', {text: 'What to fix'}),
        fixes.length ? h('ol', {class: 'fixes'}, fixes.map((f) => h('li', {}, f.text + ' ',
          f.action === 'rev' ? h('button', {onclick: () => { S.items[f.col].rev = true; renderSetup(); renderAll(); }, text: `Reverse-code ${f.col}`}) : null)))
          : h('p', {class: 'note', text: 'No items crossed the thresholds above. Loosen them to see borderline items.'})),
      h('div', {class: 'card'}, h('h3', {text: 'Item statistics'}),
        h('p', {class: 'note', text: `Item-rest r is each item's correlation with the average of the other items. Alpha and correlations use pairwise-complete data, so skipped items do not drop whole respondents. Scale ${S.min} to ${S.max}.`}),
        reviewTable(rows, R)),
      h('div', {class: 'row'}, h('button', {text: 'Export review CSV', onclick: () => download('instrument_review.csv', Stats.toCSV([
        ['item', 'wording', 'n', 'missing_pct', 'mean', 'sd', 'floor_pct', 'ceiling_pct', 'item_rest_r', 'alpha_if_deleted', 'flags'],
        ...rows.map((r) => [r.col, infoFor(r.col).text, r.it.n, f1(r.it.missingPct), f2(r.it.mean), f2(r.it.sd), f1(r.it.floorPct), f1(r.it.ceilPct), f2(r.it.itemRest), f2(r.it.alphaIfDeleted), r.flags.map((f) => f[1]).join('; ')])])) })));
  }
  function reviewTable(rows, R) {
    const cols = [['Item', (r) => r.col], ['Wording', (r) => infoFor(r.col).text], ['n', (r) => r.it.n], ['Missing %', (r) => r.it.missingPct], ['Mean', (r) => r.it.mean], ['SD', (r) => r.it.sd],
      ['Floor %', (r) => r.it.floorPct], ['Top %', (r) => r.it.ceilPct], ['Item-rest r', (r) => r.it.itemRest], ['Alpha if deleted', (r) => r.it.alphaIfDeleted], ['Flags', (r) => r.flags.length]];
    let data = rows.slice();
    if (sortState.col != null) data.sort((a, b) => { const x = cols[sortState.col][1](a), y = cols[sortState.col][1](b); return (x > y ? 1 : x < y ? -1 : 0) * sortState.dir; });
    return h('div', {class: 'tbl'}, h('table', {},
      h('thead', {}, h('tr', {}, cols.map(([n], i) => h('th', {class: 'sort', title: 'Sort', onclick: () => { sortState.dir = sortState.col === i ? -sortState.dir : 1; sortState.col = i; renderReview(); }, text: n + (sortState.col === i ? (sortState.dir > 0 ? ' ▲' : ' ▼') : '')})))),
      h('tbody', {}, data.map((r) => h('tr', {},
        h('td', {class: 'nw', text: r.col}), h('td', {text: infoFor(r.col).text}), h('td', {text: r.it.n}), h('td', {text: f1(r.it.missingPct)}), h('td', {text: f2(r.it.mean)}), h('td', {text: f2(r.it.sd)}),
        h('td', {text: f1(r.it.floorPct)}), h('td', {text: f1(r.it.ceilPct)}),
        h('td', {class: 'nw'}, h('span', {class: 'bar' + (r.it.itemRest < 0 ? ' neg' : ''), style: `width:${Math.min(Math.abs(r.it.itemRest), 1) * 3.5}rem`}), ' ' + f2(r.it.itemRest)),
        h('td', {text: f2(r.it.alphaIfDeleted)}),
        h('td', {}, r.flags.length ? r.flags.map(([lvl, t]) => h('span', {class: 'chip ' + lvl, text: t})) : h('span', {class: 'chip ok', text: 'ok'})))))));
  }

  // ---- Coding workbench ------------------------------------------------------------
  function renderCodebook() {
    $('#cb-body').replaceChildren(...codebook.map((c, i) => h('tr', {},
      h('td', {}, h('input', {type: 'text', value: c.code, 'aria-label': 'Code name', oninput: (e) => { c.code = e.target.value.trim().toLowerCase().replace(/\s+/g, '_'); renderCoding(); }})),
      h('td', {}, h('input', {type: 'text', value: c.terms, 'aria-label': 'Terms', oninput: (e) => { c.terms = e.target.value; renderCoding(); }})),
      h('td', {}, h('button', {text: 'Remove', onclick: () => { codebook.splice(i, 1); renderCodebook(); renderCoding(); }})))));
  }
  function coded() {
    const idx = S.table.data.map((r, i) => i).filter((i) => S.text && S.table.data[i][S.text]);
    const texts = idx.map((i) => S.table.data[i][S.text]);
    const book = codebook.filter((c) => c.code);
    return {idx, texts, book, auto: Stats.applyCodebook(texts, book)};
  }
  function renderCoding() {
    const out = $('#coding-out'); out.replaceChildren();
    if (!S.table) return out.append(h('p', {class: 'note', text: 'Load a sample or upload a CSV to start.'}));
    if (!S.text) return out.append(h('p', {class: 'note', text: 'Choose a comment text column in Column setup.'}));
    const {idx, texts, book, auto} = coded();
    const n = texts.length, nCoded = auto.filter((s) => s.size).length;
    const counts = book.map((c) => auto.filter((s) => s.has(c.code)).length);
    const maxC = Math.max(1, ...counts);
    out.append(
      h('div', {class: 'stats'},
        h('div', {class: 'stat'}, h('b', {text: n}), h('span', {text: 'comments'})),
        h('div', {class: 'stat'}, h('b', {text: n ? Math.round(100 * nCoded / n) + '%' : '–'}), h('span', {text: 'have at least one code'})),
        h('div', {class: 'stat'}, h('b', {text: n - nCoded}), h('span', {text: 'uncoded comments'})),
        h('div', {class: 'stat'}, h('b', {text: n ? f2(auto.reduce((s, x) => s + x.size, 0) / n) : '–'}), h('span', {text: 'codes per comment'}))),
      h('div', {class: 'card'}, h('h3', {text: 'How often each code appears'}),
        h('div', {class: 'tbl'}, h('table', {}, h('tbody', {}, book.map((c, i) => h('tr', {},
          h('td', {class: 'nw', text: c.code}), h('td', {class: 'nw'}, h('span', {class: 'bar', style: `width:${14 * counts[i] / maxC}rem`})), h('td', {class: 'nw', text: `${counts[i]} (${n ? Math.round(100 * counts[i] / n) : 0}%)`}))))))));

    // Agreement with a human coder
    const hum = S.human ? idx.map((i) => new Set(Stats.splitLabels(S.table.data[i][S.human]))) : [];
    if (S.human && hum.some((s) => s.size)) {
      const rows = book.map((c) => ({c, k: Stats.kappa(hum.map((s) => s.has(c.code)), auto.map((s) => s.has(c.code)))}));
      const tag = (k) => (!Number.isFinite(k) ? ['', '–'] : k >= 0.8 ? ['ok', 'strong'] : k >= 0.6 ? ['ok', 'substantial'] : k >= 0.4 ? ['warn', 'moderate'] : ['bad', 'low']);
      const known = new Set(book.map((c) => c.code));
      const missing = [...new Set(hum.flatMap((s) => [...s]).filter((x) => !known.has(x)))];
      const diffs = idx.map((_, j) => j).filter((j) => { const a = auto[j], b = hum[j]; return a.size !== b.size || [...a].some((x) => !b.has(x)); });
      out.append(h('div', {class: 'card'}, h('h3', {text: `Agreement with the human coder (column "${S.human}")`}),
        h('p', {class: 'note', text: 'Cohen\'s kappa corrects raw agreement for chance. Low kappa means the terms need work, or the human and rule definitions differ.'}),
        h('div', {class: 'tbl'}, h('table', {}, h('thead', {}, h('tr', {}, ['Code', 'Kappa', '% agree', 'Missed by rules', 'Extra by rules'].map((t) => h('th', {text: t})))),
          h('tbody', {}, rows.map(({c, k}) => h('tr', {}, h('td', {class: 'nw', text: c.code}), h('td', {class: 'nw'}, f2(k.kappa) + ' ', h('span', {class: 'chip ' + tag(k.kappa)[0], text: tag(k.kappa)[1]})), h('td', {text: f1(100 * k.agreement)}), h('td', {text: k.fn}), h('td', {text: k.fp})))))),
        missing.length ? h('p', {class: 'note'}, 'Labels the human used that are not in the codebook: ', missing.map((m) => h('span', {class: 'chip warn', text: m}))) : null,
        h('h3', {text: `Disagreements to review (${diffs.length})`}),
        diffs.length ? h('div', {class: 'tbl'}, h('table', {}, h('thead', {}, h('tr', {}, ['Comment', 'Human', 'Rules'].map((t) => h('th', {text: t})))),
          h('tbody', {}, diffs.slice(0, 12).map((j) => h('tr', {}, h('td', {text: texts[j]}), h('td', {text: [...hum[j]].join('; ')}), h('td', {text: [...auto[j]].join('; ')})))))) : h('p', {class: 'note', text: 'None.'}),
        diffs.length > 12 ? h('p', {class: 'note', text: `Showing 12 of ${diffs.length}. Export the coded comments to see all.`}) : null));
    }

    // Uncoded comments: where the codebook is missing something
    const unc = texts.filter((_, j) => !auto[j].size);
    const words = Stats.topTerms(unc, 14);
    out.append(h('div', {class: 'card'}, h('h3', {text: `Uncoded comments (${unc.length})`}),
      unc.length ? [
        words.length ? h('div', {}, h('p', {class: 'note', text: 'Words that recur in uncoded comments. Candidates for new terms or codes:'}), h('div', {class: 'words'}, words.map(([w, c]) => h('span', {text: `${w} (${c})`})))) : null,
        h('ul', {class: 'quote'}, unc.slice(0, 6).map((t) => h('li', {text: t})))] : h('p', {class: 'note', text: 'Every comment has at least one code.'})));
  }
  function exportCoded() {
    if (!S.table || !S.text) return;
    const {idx, texts, book, auto} = coded();
    const idCol = S.table.cols[0];
    download('coded_comments.csv', Stats.toCSV([[idCol, 'comment', 'codes', ...book.map((c) => c.code)],
      ...idx.map((i, j) => [S.table.data[i][idCol], texts[j], [...auto[j]].join(';'), ...book.map((c) => (auto[j].has(c.code) ? 1 : 0))])]));
  }

  // ---- Gap explorer ----------------------------------------------------------------
  const pairs = () => (S.table ? S.table.cols.filter((c) => /^pre_/.test(c) && S.table.cols.includes(c.replace(/^pre_/, 'post_'))) : []);
  function renderGaps() {
    const out = $('#gaps-out'); out.replaceChildren();
    if (!S.table) return out.append(h('p', {class: 'note', text: 'Load a sample or upload a CSV to start.'}));
    const gcol = $('#gap-group').value;
    const mode = $('#gap-mode').value;
    const items = mode === 'change' ? pairs() : selected();
    if (!items.length) return out.append(h('p', {class: 'note', text: 'Select item columns in Column setup.'}));
    if (!gcol) return out.append(h('p', {class: 'note', text: 'Choose a column to group by.'}));
    const cellVal = (r, c) => (mode === 'change' ? num(r[c.replace(/^pre_/, 'post_')]) - num(r[c]) : value(r, c));
    const groups = [...new Set(S.table.data.map((r) => r[gcol]).filter(Boolean))].sort();
    const overall = items.map((c) => Stats.mean(Stats.valid(S.table.data.map((r) => cellVal(r, c)))));
    const cells = groups.map((g) => { const rs = S.table.data.filter((r) => r[gcol] === g); return {g, n: rs.length, v: items.map((c, j) => Stats.mean(Stats.valid(rs.map((r) => cellVal(r, c)))) ) }; });
    const maxDev = Math.max(0.01, ...cells.flatMap((x) => x.v.map((v, j) => Math.abs(v - overall[j])).filter(Number.isFinite)));
    const doms = items.map((c) => infoFor(c).domain || '');
    const hasDom = doms.some(Boolean);
    const domRow = [];
    doms.forEach((d, j) => { if (j && d === doms[j - 1]) domRow[domRow.length - 1].span++; else domRow.push({d, span: 1}); });
    const short = (c) => c.replace(/^(pre|post)_/, '');
    const unit = mode === 'change' ? 'average change' : 'average rating';
    const all = cells.filter((x) => x.n >= 5).flatMap((x) => x.v.map((v, j) => ({g: x.g, j, v, d: v - overall[j]}))).filter((x) => Number.isFinite(x.d)).sort((a, b) => a.d - b.d).slice(0, 6);

    out.append(
      h('div', {class: 'card'}, h('h3', {text: 'Largest gaps below the overall average'}),
        h('ol', {class: 'fixes'}, all.map((x) => h('li', {}, `${x.g}, ${short(items[x.j])}${infoFor(items[x.j]).text ? ' (' + infoFor(items[x.j]).text + ')' : ''}: ${f2(x.v)} vs ${f2(overall[x.j])} overall (${f2(x.d)}).`)))),
      h('div', {class: 'card'}, h('h3', {text: `${unit[0].toUpperCase() + unit.slice(1)} by ${gcol} and item`}),
        h('div', {class: 'tbl'}, h('table', {class: 'heat'},
          h('thead', {}, hasDom ? h('tr', {}, h('th'), h('th'), domRow.map((d) => h('th', {class: 'dom', colspan: d.span, text: d.d}))) : null,
            h('tr', {}, h('th', {text: gcol}), h('th', {text: 'n'}), items.map((c) => h('th', {title: label(c), style: 'text-align:center', text: short(c)})))),
          h('tbody', {}, cells.map((x) => h('tr', {}, h('td', {class: 'nw', text: x.g}), h('td', {text: x.n}),
            x.v.map((v, j) => { const dev = v - overall[j]; const pct = Number.isFinite(dev) ? Math.round(65 * Math.min(Math.abs(dev) / maxDev, 1)) : 0;
              return h('td', {class: 'cell' + (x.n < 5 ? ' small' : ''), title: `${x.g}: ${f2(v)} (overall ${f2(overall[j])})`, style: `background:color-mix(in srgb, var(--${dev < 0 ? 'warn' : 'accent'}) ${pct}%, transparent)`, text: f2(v)}); }))),
            h('tr', {}, h('td', {class: 'nw', text: 'Overall'}), h('td', {text: S.table.data.length}), overall.map((v) => h('td', {class: 'cell', text: f2(v)})))))),
        h('p', {class: 'note', text: 'Warm shading is below the overall average, blue is above. Hover a cell for the exact value.'})));
  }
  function fillGapControls() {
    if (!S.table) return;
    const sel = $('#gap-group'), cols = S.table.cols.filter((c) => !S.items[c] && c !== S.text);
    sel.replaceChildren(...cols.map((c) => h('option', {value: c, text: c, selected: c === S.group})));
    if (S.group) sel.value = S.group;
    const mode = $('#gap-mode'); const cur = mode.value;
    mode.replaceChildren(h('option', {value: 'level', text: 'Average rating'}), ...(pairs().length ? [h('option', {value: 'change', text: 'Change after training (post minus pre)'})] : []));
    mode.value = cur === 'change' && pairs().length ? 'change' : 'level';
  }

  // ---- Wiring ----------------------------------------------------------------------
  function renderAll() { fillGapControls(); renderReview(); renderCoding(); renderGaps(); }
  $('#btn-sample').onclick = () => loadSample('main');
  $('#btn-pilot').onclick = () => { loadSample('pilot'); show('review'); };
  $('#file').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => load(Stats.toTable(Stats.parseCSV(t)), f.name)).catch((x) => err('Could not read that file: ' + x.message));
    e.target.value = '';
  };
  $('#sel-group').onchange = (e) => { S.group = e.target.value; renderAll(); };
  $('#sel-text').onchange = (e) => { S.text = e.target.value; renderAll(); };
  $('#sel-human').onchange = (e) => { S.human = e.target.value; renderAll(); };
  $('#scale-min').onchange = (e) => { S.min = +e.target.value; renderAll(); };
  $('#scale-max').onchange = (e) => { S.max = +e.target.value; renderAll(); };
  const setItems = (fn) => { Object.keys(S.items).forEach((c) => { S.items[c].on = fn(c); }); autoScale(); renderSetup(); renderAll(); };
  $('#btn-prefix').onclick = () => { const p = $('#prefix').value; if (S.table && p) setItems((c) => c.startsWith(p)); };
  $('#btn-all').onclick = () => S.table && setItems(() => true);
  $('#btn-none').onclick = () => S.table && setItems(() => false);
  ['#t-ceil', '#t-rest', '#t-miss', '#t-red'].forEach((s) => { $(s).oninput = () => renderReview(); });
  $('#gap-group').onchange = renderGaps; $('#gap-mode').onchange = renderGaps;
  $('#cb-add').onclick = () => { codebook.push({code: 'new_code', terms: ''}); renderCodebook(); renderCoding(); };
  $('#cb-export-book').onclick = () => download('codebook.csv', Stats.toCSV([['code', 'terms'], ...codebook.map((c) => [c.code, c.terms])]));
  $('#cb-export-coded').onclick = exportCoded;

  function show(tab) {
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.querySelectorAll('section.tab').forEach((s) => { s.hidden = s.id !== 'tab-' + tab; });
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
  }
  document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => show(b.dataset.tab); });
  show(['overview', 'review', 'coding', 'gaps'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview');

  renderCodebook();
  loadSample('main');
})();
