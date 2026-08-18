// ni_sh_a.char — repo index. No framework, no build step.

const ORG = 'ni-sh-a-char';
const HIDE = [/^monsterrr-/i, /^\.github$/];

const LANG_COLOR = {
  Python: '#3572A5', Java: '#b07219', Kotlin: '#A97BFF', JavaScript: '#f1e05a',
  TypeScript: '#3178c6', 'Jupyter Notebook': '#DA5B0B', HTML: '#e34c26', CSS: '#563d7c',
  SCSS: '#c6538c', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600', Shell: '#89e051',
  Dockerfile: '#384d54', Solidity: '#AA6746', Go: '#00ADD8', Rust: '#dea584',
  Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Dart: '#00B4AB', Vue: '#41b883',
  Makefile: '#427819', Assembly: '#6E4C13', Lua: '#000080', R: '#198CE7',
};
const langColor = (l) => LANG_COLOR[l] || '#626c7d';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = new Intl.NumberFormat('en');

function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  const y = Math.floor(days / 365);
  return `${y}y ago`;
}

const state = { repos: [], ai: {}, lang: null, q: '', sort: 'pushed' };

// ── data ──────────────────────────────────────────────────────

const keep = (r) => !HIDE.some((re) => re.test(r.name));

const fromApi = (r) => ({
  name: r.name,
  description: r.description,
  html_url: r.html_url,
  homepage: r.homepage?.trim() || null,
  language: r.language,
  topics: r.topics || [],
  stars: r.stargazers_count,
  forks: r.forks_count,
  open_issues: r.open_issues_count,
  is_fork: r.fork,
  archived: r.archived,
  license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
  created_at: r.created_at,
  pushed_at: r.pushed_at,
  default_branch: r.default_branch,
});

async function loadStatic() {
  const [repos, ai] = await Promise.all([
    fetch('data/repos.json').then((r) => r.json()).catch(() => null),
    fetch('data/ai.json').then((r) => r.json()).catch(() => ({})),
  ]);
  state.ai = ai || {};
  if (repos?.repos) {
    state.repos = repos.repos.filter(keep);
    if (repos.generated_at) {
      $('freshness').textContent = `Project data refreshed ${ago(repos.generated_at)}`;
    }
  }
}

// Keeps the page honest between scheduled rebuilds. Must page through the whole
// org — filtering a single truncated page silently drops repositories. Replaces
// the snapshot only on a complete read; a rate limit or a dropped connection
// leaves the already-rendered snapshot alone.
async function refreshLive() {
  try {
    const live = [];
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `https://api.github.com/orgs/${ORG}/repos?per_page=100&type=public&sort=pushed&page=${page}`,
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (!res.ok) return;
      const batch = await res.json();
      if (!Array.isArray(batch)) return;
      live.push(...batch);
      if (batch.length < 100) break;
    }
    const next = live.filter((r) => !r.private).map(fromApi).filter(keep);
    if (!next.length) return;
    state.repos = next;
    $('freshness').textContent = 'Project data live from the GitHub API';
    render();
  } catch { /* offline — the snapshot stands */ }
}

// ── render ────────────────────────────────────────────────────

function renderStats() {
  const r = state.repos;
  $('s-repos').textContent = nf.format(r.length);
  $('s-stars').textContent = nf.format(r.reduce((n, x) => n + (x.stars || 0), 0));
  $('s-langs').textContent = new Set(r.map((x) => x.language).filter(Boolean)).size;
  $('s-live').textContent = r.filter((x) => x.homepage).length;
}

function renderChips() {
  const counts = {};
  for (const r of state.repos) if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
  const langs = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  $('chips').innerHTML =
    `<button class="chip" data-lang="" aria-pressed="${state.lang === null}">All<span class="chip__n">${state.repos.length}</span></button>` +
    langs.map(([l, n]) => `
      <button class="chip" data-lang="${esc(l)}" aria-pressed="${state.lang === l}">
        <span class="chip__dot" style="background:${langColor(l)}"></span>${esc(l)}<span class="chip__n">${n}</span>
      </button>`).join('');
}

function visible() {
  const q = state.q.toLowerCase().trim();
  let list = state.repos.filter((r) => {
    if (state.lang && r.language !== state.lang) return false;
    if (!q) return true;
    const ai = state.ai[r.name];
    return [r.name, r.description, r.language, ...(r.topics || []), ai?.tagline, ai?.what]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  const by = {
    pushed: (a, b) => new Date(b.pushed_at) - new Date(a.pushed_at),
    created: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    stars: (a, b) => b.stars - a.stars || new Date(b.pushed_at) - new Date(a.pushed_at),
    name: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  };
  return list.sort(by[state.sort]);
}

function card(r) {
  const ai = state.ai[r.name];
  const blurb = ai?.tagline || r.description;
  return `
    <button class="card" data-name="${esc(r.name)}">
      <div class="card__top">
        <div class="card__name">${esc(r.name)}</div>
        <div class="card__badges">
          ${r.homepage ? '<span class="badge badge--live">Live</span>' : ''}
          ${r.archived ? '<span class="badge badge--arch">Archived</span>' : ''}
          ${r.is_fork ? '<span class="badge">Fork</span>' : ''}
        </div>
      </div>
      <p class="card__desc">${blurb ? esc(blurb) : '<em>No description yet — open to read the details.</em>'}</p>
      <div class="card__meta">
        ${r.language ? `<span class="meta"><span class="lang-dot" style="background:${langColor(r.language)}"></span>${esc(r.language)}</span>` : ''}
        <span class="meta" title="Stars">&#9733; ${nf.format(r.stars)}</span>
        ${r.open_issues ? `<span class="meta" title="Open issues">&#9679; ${r.open_issues} open</span>` : ''}
        <span class="meta" style="margin-left:auto">${ago(r.pushed_at)}</span>
      </div>
    </button>`;
}

function render() {
  const list = visible();
  $('count').textContent = `${list.length} of ${state.repos.length}`;
  $('grid').innerHTML = list.length
    ? list.map(card).join('')
    : `<div class="empty">Nothing matches that. <button class="chip" data-lang="">Clear filters</button></div>`;
  renderStats();
  renderChips();
}

// ── detail dialog ─────────────────────────────────────────────

function openDetail(name) {
  const r = state.repos.find((x) => x.name === name);
  if (!r) return;
  const ai = state.ai[name];

  $('detail-title').textContent = r.name;
  $('detail-tagline').textContent = ai?.tagline || r.description || '';

  const block = (h, body) => body ? `<div class="block"><h4>${h}</h4>${body}</div>` : '';
  const para = (t) => t ? `<p>${esc(t)}</p>` : '';

  const facts = [
    ['Language', r.language || '—'],
    ['Stars', nf.format(r.stars)],
    ['Open issues', nf.format(r.open_issues)],
    ['Licence', r.license || 'Not specified'],
    ['Created', new Date(r.created_at).toLocaleDateString('en', { month: 'short', year: 'numeric' })],
    ['Last push', ago(r.pushed_at)],
  ];

  const tags = ai?.stack?.length ? ai.stack : r.topics;

  $('detail-body').innerHTML =
    (ai
      ? block('What it is', para(ai.what)) +
        block('Why it exists', para(ai.why)) +
        block('When to reach for it', para(ai.when)) +
        block('Highlights', ai.highlights?.length
          ? `<ul>${ai.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '')
      : block('About', para(r.description ||
          'No summary has been generated for this project yet — it will appear after the next scheduled build. The repository itself is the best source in the meantime.'))
    ) +
    (tags?.length
      ? block('Stack &amp; topics', `<div class="chips">${tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>`)
      : '') +
    block('At a glance',
      `<div class="facts">${facts.map(([l, v]) =>
        `<div class="fact"><div class="fact__l">${l}</div><div class="fact__v">${esc(v)}</div></div>`).join('')}</div>`) +
    (ai ? `<div class="ai-note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>
        </svg>
        Written by ${esc(ai.model || 'an AI model')} from this repository's README and metadata. It can be wrong — the source is authoritative.
      </div>` : '');

  $('detail-foot').innerHTML = [
    `<a class="btn btn--primary" href="${esc(r.html_url)}" target="_blank" rel="noopener">Repository &nearr;</a>`,
    r.homepage ? `<a class="btn btn--ghost" href="${esc(r.homepage)}" target="_blank" rel="noopener">Live site &nearr;</a>` : '',
    `<a class="btn btn--ghost" href="${esc(r.html_url)}/issues" target="_blank" rel="noopener">Issues (${r.open_issues})</a>`,
    `<a class="btn btn--ghost" href="${esc(r.html_url)}/issues/new" target="_blank" rel="noopener">Report something</a>`,
  ].join('');

  $('detail').showModal();
}

// ── command palette ───────────────────────────────────────────

let pIndex = 0;

function renderPalette() {
  const q = $('palette-input').value.toLowerCase().trim();
  const hits = state.repos
    .filter((r) => !q || r.name.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q))
    .slice(0, 40);
  pIndex = Math.min(pIndex, Math.max(hits.length - 1, 0));

  $('palette-list').innerHTML = hits.length
    ? hits.map((r, i) => `
        <button class="palette__item" role="option" data-name="${esc(r.name)}" aria-selected="${i === pIndex}">
          <span class="lang-dot" style="background:${langColor(r.language)}"></span>
          <b>${esc(r.name)}</b>
          <em>${esc(r.description || '')}</em>
        </button>`).join('')
    : '<div class="empty" style="border:0">No projects match.</div>';

  $('palette-list').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  return hits;
}

function openPalette() {
  pIndex = 0;
  $('palette-input').value = '';
  renderPalette();
  $('palette').showModal();
  $('palette-input').focus();
}

// ── wiring ────────────────────────────────────────────────────

$('search').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-lang]');
  if (chip) {
    const l = chip.dataset.lang;
    state.lang = l && state.lang !== l ? l : null;
    render();
    return;
  }
  const card = e.target.closest('.card, .palette__item');
  if (card?.dataset.name) {
    if (card.classList.contains('palette__item')) $('palette').close();
    openDetail(card.dataset.name);
  }
});

$('detail-close').addEventListener('click', () => $('detail').close());
$('open-palette').addEventListener('click', openPalette);
$('palette-input').addEventListener('input', () => { pIndex = 0; renderPalette(); });

$('palette-input').addEventListener('keydown', (e) => {
  const hits = state.repos.length ? renderPalette() : [];
  if (e.key === 'ArrowDown') { e.preventDefault(); pIndex = Math.min(pIndex + 1, hits.length - 1); renderPalette(); }
  if (e.key === 'ArrowUp')   { e.preventDefault(); pIndex = Math.max(pIndex - 1, 0); renderPalette(); }
  if (e.key === 'Enter' && hits[pIndex]) {
    e.preventDefault();
    $('palette').close();
    openDetail(hits[pIndex].name);
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('palette').open ? $('palette').close() : openPalette();
  }
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
    e.preventDefault();
    openPalette();
  }
});

// close dialogs on backdrop click
for (const id of ['detail', 'palette']) {
  $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).close(); });
}

$('year').textContent = new Date().getFullYear();

await loadStatic();
render();
refreshLive();
