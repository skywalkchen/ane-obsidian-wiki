
/* search.js — 首頁全文搜尋（ES5，獨立於 wiki.js） */
(function () {
  'use strict';

  if ((document.body.getAttribute('data-page') || '') !== 'index') return;

  var box = document.getElementById('home-search');
  if (!box) return;
  var input = document.getElementById('hs-input');
  var clear = document.getElementById('hs-clear');
  var meta  = document.getElementById('hs-meta');
  var out   = document.getElementById('hs-results');
  if (!input || !meta || !out) return;

  var DATA = null, HAY = null, MAX = 60, timer = null, started = false;

  /* ── 載入索引：優先用內嵌資料，失敗才退回下載 ─────────────────────────── */
  function boot() {
    var el = document.getElementById('hs-data');
    if (el) {
      var raw = el.textContent || el.innerText || '';
      if (raw.length > 2) {
        try { start(JSON.parse(raw)); return; }
        catch (e) { fail('內嵌索引解析失敗：' + e.message); return; }
      }
    }
    loadRemote();
  }

  function loadRemote() {
    var url = './assets/search-index.json?v=' + (window.WIKI_V || '');
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.onreadystatechange = function () {
        if (x.readyState !== 4) return;
        if (!((x.status >= 200 && x.status < 300) || x.status === 0)) {
          fail('索引下載失敗（HTTP ' + x.status + '）— 請確認 assets/search-index.json 已上傳');
          return;
        }
        try { start(JSON.parse(x.responseText)); }
        catch (e) { fail('索引解析失敗：' + e.message); }
      };
      x.onerror = function () { fail('索引下載失敗（網路或 CORS 限制）'); };
      x.send();
    } catch (e) {
      fail('索引下載失敗：' + e.message);
    }
  }

  function start(d) {
    started = true;
    DATA = d;
    HAY = [];
    for (var i = 0; i < d.length; i++) {
      var p = d[i], parts = [p.t, (p.tg || []).join(' '), p.m ? 'miller ch ' + p.m : ''];
      for (var k = 0; k < p.sec.length; k++) { parts.push(p.sec[k].h, p.sec[k].x); }
      HAY.push(parts.join(' ').toLowerCase());
    }
    input.disabled = false;
    input.placeholder = '輸入關鍵字，搜尋全部 ' + d.length + ' 個章節的內文…';
    if (input.value && input.value.replace(/^\s+|\s+$/g, '')) run();
  }

  function fail(msg) {
    started = true;
    input.disabled = false;
    input.placeholder = '搜尋索引載入失敗';
    meta.textContent = '⚠ ' + msg;
    box.className = 'active';
  }

  /* 逾時保險：15 秒還沒好就講清楚，不要一直卡在「載入中」 */
  setTimeout(function () {
    if (!started) fail('索引載入逾時，請重新整理頁面（或清除瀏覽器快取）');
  }, 15000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ── 事件 ─────────────────────────────────────────────────────────────── */
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.keyCode === 27) { input.value = ''; run(); }
  });
  if (clear) {
    clear.addEventListener('click', function () { input.value = ''; input.focus(); run(); });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });

  /* ── 工具 ─────────────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function rxEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function hl(text, terms) {
    var rx = new RegExp('(' + terms.map(rxEsc).join('|') + ')', 'gi');
    var res = '', last = 0, m;
    while ((m = rx.exec(text)) !== null) {
      if (m[0].length === 0) { rx.lastIndex++; continue; }
      res += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return res + esc(text.slice(last));
  }

  function snippet(text, terms) {
    var low = text.toLowerCase(), pos = -1;
    for (var i = 0; i < terms.length; i++) {
      var p = low.indexOf(terms[i]);
      if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    }
    if (pos < 0) pos = 0;
    var s = Math.max(0, pos - 45), e = Math.min(text.length, pos + 135);
    return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
  }

  function countOf(hay, term) { return hay.split(term).length - 1; }

  /* ── 搜尋 ─────────────────────────────────────────────────────────────── */
  function run() {
    var q = input.value.replace(/^\s+|\s+$/g, '').toLowerCase();
    if (!q) { box.className = ''; meta.textContent = ''; out.innerHTML = ''; return; }
    box.className = 'active';
    if (!DATA) { if (!started) meta.textContent = '索引載入中…'; return; }

    var terms = q.split(/\s+/), hits = [];
    for (var i = 0; i < DATA.length; i++) {
      var p = DATA[i], hay = HAY[i], ok = true;
      for (var k = 0; k < terms.length; k++) { if (hay.indexOf(terms[k]) < 0) { ok = false; break; } }
      if (!ok) continue;

      var titleLow = p.t.toLowerCase(), tagLow = (p.tg || []).join(' ').toLowerCase(), score = 0;
      for (k = 0; k < terms.length; k++) {
        if (titleLow.indexOf(terms[k]) >= 0) score += 200;
        if (tagLow.indexOf(terms[k]) >= 0) score += 60;
        score += countOf(hay, terms[k]);
      }

      var secs = [];
      for (var j = 0; j < p.sec.length; j++) {
        var s = p.sec[j], sl = (s.h + ' ' + s.x).toLowerCase(), n = 0, c = 0;
        for (k = 0; k < terms.length; k++) {
          if (sl.indexOf(terms[k]) >= 0) { n++; c += countOf(sl, terms[k]); }
          if (s.h.toLowerCase().indexOf(terms[k]) >= 0) c += 5;
        }
        if (/相關頁面|參考|延伸閱讀|完整資料|references|see also/i.test(s.h)) c -= 4;
        if (n) secs.push({ s: s, n: n, c: c });
      }
      secs.sort(function (a, b) { return (b.n - a.n) || (b.c - a.c); });
      var picked = [];
      for (j = 0; j < secs.length && j < 3; j++) picked.push(secs[j].s);
      if (!picked.length && p.sec.length) picked = [p.sec[0]];

      hits.push({ p: p, score: score, secs: picked });
    }

    hits.sort(function (a, b) { return (b.score - a.score) || a.p.t.localeCompare(b.p.t); });
    render(hits, terms);
  }

  function render(hits, terms) {
    out.innerHTML = '';
    if (!hits.length) {
      meta.textContent = '找不到含「' + input.value.replace(/^\s+|\s+$/g, '') + '」的章節';
      return;
    }
    meta.textContent = '找到 ' + hits.length + ' 個章節' +
      (hits.length > MAX ? '（顯示前 ' + MAX + ' 個）' : '');

    var frag = document.createDocumentFragment();
    for (var i = 0; i < hits.length && i < MAX; i++) {
      var h = hits[i];
      var card = document.createElement('div');
      card.className = 'hs-card';
      var html = '<a class="hs-title" href="./' + h.p.s + '.html">' + hl(h.p.t, terms) + '</a>';
      var badges = '';
      if (h.p.m) badges += '<span class="hs-ch">Miller Ch. ' + esc(h.p.m) + '</span>';
      var tg = h.p.tg || [];
      for (var k = 0; k < tg.length && k < 5; k++) {
        badges += '<span class="hs-tag">' + hl(tg[k], terms) + '</span>';
      }
      if (badges) html += '<span class="hs-badges">' + badges + '</span>';
      for (var j = 0; j < h.secs.length; j++) {
        var s = h.secs[j];
        var href = './' + h.p.s + '.html' + (s.a ? '#' + s.a : '');
        html += '<div class="hs-hit">';
        if (s.h) html += '<a class="hs-sec" href="' + href + '">§ ' + hl(s.h, terms) + '</a>';
        html += '<div class="hs-snip">' + hl(snippet(s.x, terms), terms) + '</div></div>';
      }
      card.innerHTML = html;
      frag.appendChild(card);
    }
    out.appendChild(frag);
  }
})();
