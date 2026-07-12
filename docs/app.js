// 소싱함 · 신제품 소싱 링크 저장소 대시보드
// data.json + categories.json → 검색/필터/정렬 렌더

const CATEGORY_EMOJI = {
  '애견': '🐶',
  '주방가전': '🍳',
  '미용가전': '💇',
  '건강가전': '💆',
  '생활가전': '🏠',
  '패키지·인쇄': '📦',
  '기타': '🗂️',
  '미분류': '❓',
};

const state = {
  items: [],
  filter: { search: '', category: 'all' },
  sort: 'saved_desc',
};

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRelativeKo(iso) {
  const diffMs = new Date() - new Date(iso);
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return '방금 전';
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  return `${Math.floor(day / 30)}개월 전`;
}

async function loadData() {
  try {
    const res = await fetch(`./data.json?v=${Date.now()}`);
    const data = await res.json();
    state.items = data.items || [];
  } catch (e) {
    console.error('데이터 로드 실패', e);
    document.getElementById('mainContent').innerHTML =
      '<div class="empty-state"><div class="empty-emoji">⚠️</div><div class="empty-title">데이터를 불러올 수 없어</div></div>';
  }
}

function applyFilter() {
  const q = state.filter.search.trim().toLowerCase();
  const cat = state.filter.category;
  let result = state.items.filter((it) => {
    if (cat !== 'all' && it.category !== cat) return false;
    if (!q) return true;
    return [it.title, it.desc_ko, it.category, it.domain].join(' ').toLowerCase().includes(q);
  });
  if (state.sort === 'name_asc') {
    result.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  } else {
    result.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
  }
  return result;
}

function renderCardHtml(it) {
  const emoji = CATEGORY_EMOJI[it.category] || '🗂️';
  const conf = it.confidence < 0.6
    ? `<span class="card-confidence low">신뢰도 ${(it.confidence * 100).toFixed(0)}%</span>`
    : '';
  return `
    <article class="card" data-url="${escapeHtml(it.url)}">
      <div class="card-top">
        <span class="card-category">${emoji} ${escapeHtml(it.category)}</span>
      </div>
      <div>
        <div class="card-name">${escapeHtml(it.title)}</div>
        <div class="card-domain">${escapeHtml(it.domain)}</div>
      </div>
      <div class="card-desc">${escapeHtml(it.desc_ko) || '설명 없음'}</div>
      <div class="card-meta">
        <span>${formatRelativeKo(it.saved_at)}</span>
        ${conf}
      </div>
    </article>
  `;
}

function renderChips(items) {
  const chipRow = document.getElementById('categoryChips');
  const counts = {};
  state.items.forEach((it) => { counts[it.category] = (counts[it.category] || 0) + 1; });
  const chips = [
    { key: 'all', label: '전체', emoji: '✨', count: state.items.length },
    ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
      key: k, label: k, emoji: CATEGORY_EMOJI[k] || '🗂️', count: v,
    })),
  ];
  chipRow.innerHTML = chips.map((c) => `
    <button class="chip ${state.filter.category === c.key ? 'active' : ''}" data-key="${escapeHtml(c.key)}">
      <span class="chip-emoji">${c.emoji}</span>
      <span>${escapeHtml(c.label)}</span>
      <span class="chip-count">${c.count}</span>
    </button>
  `).join('');
  chipRow.querySelectorAll('.chip').forEach((el) => {
    el.addEventListener('click', () => {
      state.filter.category = el.dataset.key;
      render();
    });
  });
}

function render() {
  const filtered = applyFilter();
  renderChips();

  const main = document.getElementById('mainContent');
  const empty = document.getElementById('emptyState');
  document.getElementById('resultCount').textContent = `${filtered.length}개`;

  if (filtered.length === 0) {
    main.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  main.innerHTML = `<div class="card-grid">${filtered.map(renderCardHtml).join('')}</div>`;

  main.querySelectorAll('.card').forEach((el, i) => {
    el.style.setProperty('--i', Math.min(i, 12));
    el.addEventListener('click', () => window.open(el.dataset.url, '_blank', 'noopener'));
  });
}

function renderHeaderStats() {
  document.getElementById('brandStats').textContent = `저장된 링크 ${state.items.length}개`;
}

function bindEvents() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');
  const sort = document.getElementById('sortSelect');

  input.addEventListener('input', () => {
    state.filter.search = input.value;
    clearBtn.hidden = !input.value;
    render();
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.filter.search = '';
    clearBtn.hidden = true;
    input.focus();
    render();
  });
  sort.addEventListener('change', () => {
    state.sort = sort.value;
    render();
  });
}

(async function init() {
  await loadData();
  bindEvents();
  renderHeaderStats();
  render();
})();
