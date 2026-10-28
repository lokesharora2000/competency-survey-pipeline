/* Pure functions for the survey tools. No DOM access, so they can be tested in Node. */
(function (root) {
  const Stats = {};

  // ---- CSV -------------------------------------------------------------------------
  Stats.parseCSV = function (text) {
    text = text.replace(/^﻿/, '');
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); f = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  };

  Stats.toCSV = function (rows) {
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return rows.map((r) => r.map(esc).join(',')).join('\r\n');
  };

  // Turns parsed rows into {cols, data, qtext}. Qualtrics exports carry a question-text row and an
  // ImportId row under the header; both are removed and the question text is kept for labelling.
  Stats.toTable = function (rows) {
    if (!rows.length) return {cols: [], data: [], qtext: {}};
    let header = rows[0].map((h) => h.trim()), body = rows.slice(1), qtext = {};
    const isImport = (r) => r && r.some((c) => /ImportId/.test(c));
    if (isImport(rows[2])) { header.forEach((h, i) => { qtext[h] = (rows[1][i] || '').trim(); }); body = rows.slice(3); }
    else if (isImport(rows[1])) body = rows.slice(2);
    const seen = {};
    header = header.map((h) => { h = h || 'column'; seen[h] = (seen[h] || 0) + 1; return seen[h] > 1 ? h + '_' + seen[h] : h; });
    const data = body.map((r) => { const o = {}; header.forEach((h, i) => { o[h] = (r[i] || '').trim(); }); return o; });
    return {cols: header, data, qtext};
  };

  // ---- Descriptives ----------------------------------------------------------------
  const valid = (a) => a.filter((v) => !Number.isNaN(v));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  Stats.mean = mean; Stats.sd = sd; Stats.valid = valid;

  function pcov(a, b) {
    let n = 0, sa = 0, sb = 0;
    for (let i = 0; i < a.length; i++) if (!Number.isNaN(a[i]) && !Number.isNaN(b[i])) { n++; sa += a[i]; sb += b[i]; }
    if (n < 3) return NaN;
    const ma = sa / n, mb = sb / n; let s = 0;
    for (let i = 0; i < a.length; i++) if (!Number.isNaN(a[i]) && !Number.isNaN(b[i])) s += (a[i] - ma) * (b[i] - mb);
    return s / (n - 1);
  }
  const pcorr = (a, b) => pcov(a, b) / Math.sqrt(pcov(a, a) * pcov(b, b));

  // ---- Instrument review -----------------------------------------------------------
  // M: n x k matrix (NaN = missing), already reverse-coded. Covariances are pairwise-complete,
  // so a few skipped items do not discard whole respondents.
  Stats.review = function (M, opts) {
    const k = M[0].length, n = M.length;
    const X = Array.from({length: k}, (_, j) => M.map((r) => r[j]));
    const C = X.map((a) => X.map((b) => pcov(a, b)));
    const alphaOf = (idx) => {
      if (idx.length < 2) return NaN;
      let tot = 0, sv = 0;
      idx.forEach((i) => { sv += C[i][i]; idx.forEach((j) => { tot += C[i][j]; }); });
      return idx.length / (idx.length - 1) * (1 - sv / tot);
    };
    const all = [...Array(k).keys()];
    const alpha = alphaOf(all);
    const R = C.map((row, i) => row.map((c, j) => c / Math.sqrt(C[i][i] * C[j][j])));
    let rsum = 0, rcount = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (!Number.isNaN(R[i][j])) { rsum += R[i][j]; rcount++; }

    const items = X.map((x, j) => {
      const v = valid(x);
      const others = all.filter((i) => i !== j);
      const rest = M.map((r) => { const o = others.map((i) => r[i]).filter((t) => !Number.isNaN(t)); return o.length >= Math.ceil(others.length / 2) ? mean(o) : NaN; });
      return {
        j, n: v.length, missingPct: 100 * (1 - v.length / n),
        mean: mean(v), sd: sd(v),
        floorPct: 100 * v.filter((t) => t === opts.min).length / v.length,
        ceilPct: 100 * v.filter((t) => t === opts.max).length / v.length,
        itemRest: pcorr(x, rest), alphaIfDeleted: alphaOf(others),
      };
    });
    const pairs = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (R[i][j] > opts.redundantR) pairs.push({i, j, r: R[i][j]});
    return {alpha, meanInterItem: rsum / rcount, items, pairs, n, k};
  };

  // ---- Qualitative coding ----------------------------------------------------------
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Terms are comma-separated; each matches at the start of a word, so "statistic" finds "statistics".
  Stats.termsRegex = function (terms) {
    const parts = terms.split(',').map((t) => t.trim()).filter(Boolean).map((t) => '\\b' + esc(t));
    return parts.length ? new RegExp(parts.join('|'), 'i') : null;
  };
  Stats.applyCodebook = function (texts, codebook) {
    const rx = codebook.map((c) => Stats.termsRegex(c.terms));
    return texts.map((t) => new Set(codebook.filter((c, i) => rx[i] && rx[i].test(t)).map((c) => c.code)));
  };
  Stats.splitLabels = (s) => (s || '').split(/[;|,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

  Stats.kappa = function (h, a) {
    const n = h.length; let tp = 0, fp = 0, fn = 0, tn = 0;
    for (let i = 0; i < n; i++) { if (h[i] && a[i]) tp++; else if (!h[i] && a[i]) fp++; else if (h[i] && !a[i]) fn++; else tn++; }
    const po = (tp + tn) / n;
    const pe = ((tp + fn) / n) * ((tp + fp) / n) + ((fp + tn) / n) * ((fn + tn) / n);
    return {kappa: pe === 1 ? NaN : (po - pe) / (1 - pe), agreement: po, tp, fp, fn, tn};
  };

  const STOP = new Set('the and for that this with have has not are was were but you your our from they them their what which when how would could should about into more some very much can will just than then also been being its it\'s there here these those only other such any all out one get got make made like want need needs'.split(' '));
  Stats.topTerms = function (texts, limit) {
    const f = {};
    texts.forEach((t) => new Set((t.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter((w) => !STOP.has(w))).forEach((w) => { f[w] = (f[w] || 0) + 1; }));
    return Object.entries(f).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Stats; else root.Stats = Stats;
})(typeof window !== 'undefined' ? window : globalThis);
