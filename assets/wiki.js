
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
