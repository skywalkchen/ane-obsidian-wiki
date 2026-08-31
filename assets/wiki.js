
/* wiki.js — 麻醉學 Wiki front-end */
(function () {
  'use strict';

  const PAGE = document.body.dataset.page || '';
  const TYPE_COLORS = {
    concept: '#3b82f6', entity: '#8b5cf6', source: '#10b981', note: '#f59e0b'
  };

  // ── Load all data files ──────────────────────────────────────────────────
  Promise.all([
    fetch('./assets/nav-data.json').then(r => r.json()),
    fetch('./assets/graph-data.json').then(r => r.json()),
    fetch('./assets/backlinks.json').then(r => r.json()),
  ]).then(([navData, graphData, backlinksData]) => {
    buildNav(navData);
    buildTagPanel(navData);
    buildBacklinks(backlinksData[PAGE] || []);
    initSearch(navData);
    initGraph(graphData);
    initCalloutFold();
    initMermaid();
  }).catch(e => console.warn('[wiki] data load error:', e));

  // ── Navigation ───────────────────────────────────────────────────────────
  function buildNav(pages) {
    const nav = document.getElementById('page-nav');
    const sections = { concept: '📘 Concepts', entity: '💊 Entities',
                        source: '📄 Sources', note: '📝 Notes' };
    const grouped = { concept: [], entity: [], source: [], note: [] };
    pages.forEach(p => (grouped[p.type] || (grouped[p.type] = [])).push(p));

    Object.entries(sections).forEach(([type, label]) => {
      if (!grouped[type]?.length) return;
      const hdr = document.createElement('div');
      hdr.className = 'nav-section-header'; hdr.textContent = label;
      nav.appendChild(hdr);
      grouped[type].forEach(p => {
        const a = document.createElement('a');
        a.className = 'nav-link' + (p.slug === PAGE ? ' active' : '');
        a.href = './' + p.slug + '.html';
        a.textContent = p.title;
        a.dataset.tags = (p.tags || []).join(' ');
        a.dataset.q = p.title.toLowerCase();
        nav.appendChild(a);
      });
    });
  }

  // ── Tag panel ─────────────────────────────────────────────────────────────
  let activeTag = null;
  function buildTagPanel(pages) {
    const freq = {};
    pages.forEach(p => (p.tags || []).forEach(t => freq[t] = (freq[t] || 0) + 1));
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const panel = document.getElementById('tag-panel');
    sorted.forEach(([tag, n]) => {
      const el = document.createElement('span');
      el.className = 'tag-chip'; el.textContent = `${tag} ${n}`;
      el.dataset.tag = tag;
      el.onclick = () => {
        if (activeTag === tag) {
          activeTag = null; el.classList.remove('active');
        } else {
          if (activeTag) panel.querySelector(`.tag-chip[data-tag="${activeTag}"]`)?.classList.remove('active');
          activeTag = tag; el.classList.add('active');
        }
        applyFilters();
      };
      panel.appendChild(el);
    });
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function initSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;
    input.addEventListener('input', applyFilters);
  }

  function applyFilters() {
    const q = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    document.querySelectorAll('.nav-link').forEach(el => {
      const tagOk = !activeTag || el.dataset.tags.split(' ').includes(activeTag);
      const qOk   = !q || el.dataset.q.includes(q);
      el.classList.toggle('hidden', !(tagOk && qOk));
    });
    // Hide section headers with no visible items
    document.querySelectorAll('.nav-section-header').forEach(hdr => {
      let sib = hdr.nextElementSibling;
      let anyVisible = false;
      while (sib && sib.classList.contains('nav-link')) {
        if (!sib.classList.contains('hidden')) anyVisible = true;
        sib = sib.nextElementSibling;
      }
      hdr.style.display = anyVisible ? '' : 'none';
    });
  }

  // ── Backlinks ─────────────────────────────────────────────────────────────
  function buildBacklinks(links) {
    const el = document.getElementById('backlinks-list');
    if (!el) return;
    if (!links.length) {
      el.innerHTML = '<span class="bl-empty">尚無其他頁面連結至此頁面</span>'; return;
    }
    links.forEach(({ slug, title, type }) => {
      const div = document.createElement('div');
      div.className = 'backlink-item';
      div.innerHTML = `<a href="./${slug}.html">${title}</a><span class="bl-type">${type}</span>`;
      el.appendChild(div);
    });
  }

  // ── Graph ─────────────────────────────────────────────────────────────────
  function initGraph(graphData) {
    const btn     = document.getElementById('graph-btn');
    const overlay = document.getElementById('graph-overlay');
    const closeEl = document.getElementById('graph-close');
    if (!btn || !overlay) return;
    let rendered = false;
    btn.onclick = () => {
      overlay.classList.remove('hidden');
      if (!rendered) { renderGraph(graphData); rendered = true; }
    };
    closeEl.onclick = () => overlay.classList.add('hidden');
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }

  function renderGraph(data) {
    const svg = d3.select('#graph-svg');
    const cont = document.getElementById('graph-container');
    const W = cont.clientWidth, H = cont.clientHeight;
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    // zoom
    const g = svg.append('g');
    svg.call(d3.zoom().scaleExtent([.2, 5]).on('zoom', e => g.attr('transform', e.transform)));

    const sim = d3.forceSimulation(data.nodes)
      .force('link',      d3.forceLink(data.links).id(d => d.id).distance(90).strength(.4))
      .force('charge',    d3.forceManyBody().strength(-220))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(d => 8 + Math.sqrt(d.inlinks || 0) * 2.5));

    const link = g.append('g').attr('stroke', '#334155').attr('stroke-opacity', .5)
      .selectAll('line').data(data.links).join('line').attr('stroke-width', 1);

    const nodeG = g.append('g').selectAll('g').data(data.nodes).join('g')
      .attr('class', 'graph-node')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    nodeG.append('circle')
      .attr('r', d => 5 + Math.sqrt(d.inlinks || 0) * 2.5)
      .attr('fill', d => TYPE_COLORS[d.type] || '#94a3b8')
      .attr('stroke', d => d.id === PAGE ? '#ffffff' : 'none')
      .attr('stroke-width', 2)
      .on('click', (e, d) => { window.location.href = './' + d.id + '.html'; })
      .on('mouseover', function () { d3.select(this).attr('opacity', .75); })
      .on('mouseout',  function () { d3.select(this).attr('opacity', 1); });

    nodeG.append('title').text(d => d.title);

    const labels = g.append('g').selectAll('text').data(data.nodes).join('text')
      .attr('class', 'graph-node-label')
      .text(d => d.title.length > 22 ? d.title.slice(0, 20) + '…' : d.title);

    // Legend
    const legend = document.getElementById('graph-legend');
    if (legend) {
      Object.entries(TYPE_COLORS).forEach(([type, color]) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<div class="legend-dot" style="background:${color}"></div>${type}`;
        legend.appendChild(item);
      });
    }

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
      labels.attr('x', d => d.x + 9).attr('y', d => d.y + 3);
    });
  }

  // ── Callout fold ──────────────────────────────────────────────────────────
  function initCalloutFold() {
    document.querySelectorAll('.callout-title.foldable').forEach(el => {
      el.addEventListener('click', () => {
        const c = el.closest('.callout');
        c.classList.toggle('collapsed');
        const fold = el.querySelector('.callout-fold');
        if (fold) fold.textContent = c.classList.contains('collapsed') ? '▸' : '▾';
      });
    });
  }

  // ── Mermaid ───────────────────────────────────────────────────────────────
  function initMermaid() {
    if (!document.querySelector('.mermaid')) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js';
    script.onload = () => mermaid.initialize({ startOnLoad: true, theme: 'default' });
    document.head.appendChild(script);
  }

})();


/* ── 首頁全文搜尋 ───────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if ((document.body.dataset.page || '') !== 'index') return;

  var box   = document.getElementById('home-search');
  if (!box) return;
  var input = document.getElementById('hs-input');
  var clear = document.getElementById('hs-clear');
  var meta  = document.getElementById('hs-meta');
  var out   = document.getElementById('hs-results');

  var DATA = null, HAY = null, MAX = 60, timer = null;

  fetch('./assets/search-index.json')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      DATA = d;
      HAY = d.map(function (p) {
        var parts = [p.t, (p.tg || []).join(' '), p.m ? 'miller ch ' + p.m : ''];
        p.sec.forEach(function (s) { parts.push(s.h, s.x); });
        return parts.join(' ').toLowerCase();
      });
      input.disabled = false;
      input.placeholder = '輸入關鍵字，搜尋全部 ' + d.length + ' 個章節的內文…';
      if (input.value.trim()) run();
    })
    .catch(function (e) {
      meta.textContent = '搜尋索引載入失敗（請確認 assets/search-index.json 已部署）';
      console.warn('[search]', e);
    });

  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { input.value = ''; run(); }
  });
  clear.addEventListener('click', function () { input.value = ''; input.focus(); run(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });

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
    var start = Math.max(0, pos - 45), end = Math.min(text.length, pos + 135);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  function countOf(hay, term) { return hay.split(term).length - 1; }

  function run() {
    var q = input.value.trim().toLowerCase();
    if (!q) {
      box.classList.remove('active'); meta.textContent = ''; out.innerHTML = ''; return;
    }
    box.classList.add('active');
    if (!DATA) { meta.textContent = '索引載入中…'; return; }

    var terms = q.split(/\s+/).filter(Boolean);
    var hits = [];

    DATA.forEach(function (p, i) {
      var hay = HAY[i];
      for (var k = 0; k < terms.length; k++) { if (hay.indexOf(terms[k]) < 0) return; }

      var titleLow = p.t.toLowerCase(), tagLow = (p.tg || []).join(' ').toLowerCase();
      var score = 0;
      terms.forEach(function (t) {
        if (titleLow.indexOf(t) >= 0) score += 200;
        if (tagLow.indexOf(t) >= 0) score += 60;
        score += countOf(hay, t);
      });

      var secs = [];
      p.sec.forEach(function (s) {
        var sl = (s.h + ' ' + s.x).toLowerCase(), n = 0, c = 0;
        terms.forEach(function (t) {
          if (sl.indexOf(t) >= 0) { n++; c += countOf(sl, t); }
          if (s.h.toLowerCase().indexOf(t) >= 0) c += 5;
        });
        if (/相關頁面|參考|延伸閱讀|完整資料|references|see also/i.test(s.h)) c -= 4;
        if (n) secs.push({ s: s, n: n, c: c });
      });
      secs.sort(function (a, b) { return (b.n - a.n) || (b.c - a.c); });
      var picked = secs.slice(0, 3).map(function (o) { return o.s; });
      if (!picked.length && p.sec.length) picked = [p.sec[0]];

      hits.push({ p: p, score: score, secs: picked });
    });

    hits.sort(function (a, b) { return (b.score - a.score) || a.p.t.localeCompare(b.p.t); });
    render(hits, terms);
  }

  function render(hits, terms) {
    out.innerHTML = '';
    if (!hits.length) {
      meta.textContent = '找不到含「' + input.value.trim() + '」的章節';
      return;
    }
    meta.textContent = '找到 ' + hits.length + ' 個章節' +
      (hits.length > MAX ? '（顯示前 ' + MAX + ' 個）' : '');

    var frag = document.createDocumentFragment();
    hits.slice(0, MAX).forEach(function (h) {
      var card = document.createElement('div');
      card.className = 'hs-card';
      var html = '<a class="hs-title" href="./' + h.p.s + '.html">' + hl(h.p.t, terms) + '</a>';
      var badges = '';
      if (h.p.m) badges += '<span class="hs-ch">Miller Ch. ' + esc(h.p.m) + '</span>';
      (h.p.tg || []).slice(0, 5).forEach(function (t) {
        badges += '<span class="hs-tag">' + hl(t, terms) + '</span>';
      });
      if (badges) html += '<span class="hs-badges">' + badges + '</span>';
      h.secs.forEach(function (s) {
        var href = './' + h.p.s + '.html' + (s.a ? '#' + s.a : '');
        html += '<div class="hs-hit">';
        if (s.h) html += '<a class="hs-sec" href="' + href + '">§ ' + hl(s.h, terms) + '</a>';
        html += '<div class="hs-snip">' + hl(snippet(s.x, terms), terms) + '</div></div>';
      });
      card.innerHTML = html;
      frag.appendChild(card);
    });
    out.appendChild(frag);
  }
})();
