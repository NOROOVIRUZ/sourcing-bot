// VUUI 개발보드 · 링크 저장소 대시보드
// data.json + categories.json → 검색/필터/정렬 렌더 + 보드키로 수정/삭제

const WORKER_URL = 'https://sourcing-bot.noroovirus-dev.workers.dev';
const SECRET_KEY = 'vuui_board_secret';

// 최초 1회: 대시보드를 #secret=... 붙여 열면 localStorage에 저장하고 주소에서 지움
(function seedSecret() {
  const m = location.hash.match(/secret=([0-9a-f]+)/);
  if (m) {
    localStorage.setItem(SECRET_KEY, m[1]);
    history.replaceState(null, '', location.pathname + location.search);
  }
})();

const state = {
  items: [],
  reports: [],
  filter: { search: '', category: 'all' },
  sort: 'saved_desc',
  editingId: null,
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
      '<div class="empty-state"><div class="empty-title">데이터를 불러올 수 없어</div></div>';
  }
}

async function loadReports() {
  try {
    const res = await fetch(`./reports.json?v=${Date.now()}`);
    const data = await res.json();
    state.reports = data.reports || [];
  } catch (e) {
    state.reports = [];
  }
}

// ===== 보드키 인증 & API =====
function getSecret() {
  let secret = localStorage.getItem(SECRET_KEY);
  if (!secret) {
    secret = window.prompt('보드 비밀키 입력 (최초 1회 — 텔레그램에서 /보드키)');
    if (!secret) return null;
    secret = secret.trim();
    localStorage.setItem(SECRET_KEY, secret);
  }
  return secret;
}

async function apiPost(path, payload) {
  const secret = getSecret();
  if (!secret) return null;
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-board-secret': secret },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    localStorage.removeItem(SECRET_KEY); // 틀린 키는 지워서 다음에 다시 묻게
    throw new Error('비밀키가 틀렸어. /보드키로 다시 받아줘.');
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '실패했어');
  return json;
}

// ===== 렌더 =====
function categoryList() {
  return [...new Set(state.items.map((it) => it.category).filter((c) => c && c !== '미분류'))].sort();
}

function applyFilter() {
  const q = state.filter.search.trim().toLowerCase();
  const cat = state.filter.category;
  let result = state.items.filter((it) => {
    if (cat !== 'all' && it.category !== cat) return false;
    if (!q) return true;
    return [it.company, it.desc_ko, it.category, it.domain].join(' ').toLowerCase().includes(q);
  });
  if (state.sort === 'name_asc') {
    result.sort((a, b) => (a.company || '').localeCompare(b.company || '', 'ko'));
  } else {
    result.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
  }
  return result;
}

function renderEditCardHtml(it) {
  const cats = categoryList().map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
  return `
    <form class="card edit-card" data-id="${escapeHtml(it.id)}" style="--i:0">
      <label class="edit-field">
        <span class="edit-label">회사·공장명</span>
        <input name="company" value="${escapeHtml(it.company)}" placeholder="예: IvyPet" autocomplete="off" required />
      </label>
      <label class="edit-field">
        <span class="edit-label">카테고리</span>
        <input name="category" value="${escapeHtml(it.category)}" placeholder="예: 애견" list="catOptions" autocomplete="off" />
      </label>
      <label class="edit-field">
        <span class="edit-label">설명</span>
        <textarea name="desc_ko" rows="2" placeholder="한 줄 설명">${escapeHtml(it.desc_ko)}</textarea>
      </label>
      <datalist id="catOptions">${cats}</datalist>
      <div class="edit-actions">
        <button type="button" class="edit-btn cancel" data-act="cancel">취소</button>
        <button type="submit" class="edit-btn save" data-act="save">저장</button>
      </div>
    </form>
  `;
}

function renderCardHtml(it) {
  if (state.editingId === it.id) return renderEditCardHtml(it);
  const unverified = (it.confidence ?? 0) < 1;
  const badge = unverified ? `<span class="card-confidence">확인 필요</span>` : '';
  return `
    <article class="card ${unverified ? 'card-unverified' : ''}" data-id="${escapeHtml(it.id)}" data-url="${escapeHtml(it.url)}">
      <div class="card-top">
        <span class="card-category">${escapeHtml(it.category)}</span>
        <div class="card-actions">
          <button class="card-btn" data-act="edit" aria-label="수정">수정</button>
          <button class="card-btn danger" data-act="del" aria-label="삭제">삭제</button>
        </div>
      </div>
      <div>
        <div class="card-name">${escapeHtml(it.company)}</div>
        <div class="card-domain">${escapeHtml(it.domain)}</div>
      </div>
      <div class="card-desc">${escapeHtml(it.desc_ko) || '설명 없음'}</div>
      <div class="card-meta">
        <span>${formatRelativeKo(it.saved_at)}</span>
        ${badge}
      </div>
    </article>
  `;
}

function renderChips() {
  const chipRow = document.getElementById('categoryChips');
  const counts = {};
  state.items.forEach((it) => { counts[it.category] = (counts[it.category] || 0) + 1; });
  const chips = [
    { key: 'all', label: '전체', count: state.items.length },
    ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, count: v })),
  ];
  chipRow.innerHTML = chips.map((c) => `
    <button class="chip ${state.filter.category === c.key ? 'active' : ''}" data-key="${escapeHtml(c.key)}">
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
  main.querySelectorAll('.card').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12)));
}

function renderHeaderStats() {
  document.getElementById('brandStats').textContent = `저장된 링크 ${state.items.length}개`;
}

// ===== 보고서 탭 =====
function renderReportCard(r) {
  const tags = (r.tags || []).map((t) => `<span class="report-tag">${escapeHtml(t)}</span>`).join('');
  return `
    <article class="report-card" data-file="${escapeHtml(r.file)}">
      <div class="report-dates">
        <span>요청 <b>${escapeHtml(r.requested_at || '—')}</b></span>
        <span class="report-dot">·</span>
        <span>생성 <b>${escapeHtml(r.created_at || '—')}</b></span>
      </div>
      <h3 class="report-title">${escapeHtml(r.title)}</h3>
      <div class="report-summary">${escapeHtml(r.summary) || ''}</div>
      <div class="report-foot">
        <div class="report-tags">${tags}</div>
        ${r.author ? `<span class="report-author">${escapeHtml(r.author)}</span>` : ''}
      </div>
    </article>
  `;
}

function renderReports() {
  const list = document.getElementById('reportList');
  const empty = document.getElementById('reportEmpty');
  document.getElementById('reportCount').textContent = `${state.reports.length}개`;
  if (!state.reports.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const sorted = [...state.reports].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  list.innerHTML = `<div class="report-grid">${sorted.map(renderReportCard).join('')}</div>`;
  list.querySelectorAll('.report-card').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12)));
}

function bindTabs() {
  const tabbar = document.getElementById('tabbar');
  tabbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const tab = btn.dataset.tab;
    tabbar.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
    document.getElementById('tab-sourcing').hidden = tab !== 'sourcing';
    document.getElementById('tab-reports').hidden = tab !== 'reports';
    if (tab === 'reports') renderReports();
  });
  document.getElementById('reportList').addEventListener('click', (e) => {
    const card = e.target.closest('.report-card');
    if (card) window.open(card.dataset.file, '_blank', 'noopener');
  });
}

// ===== 액션 =====
async function submitEdit(form) {
  const id = form.dataset.id;
  const fields = {
    company: form.company.value,
    category: form.category.value,
    desc_ko: form.desc_ko.value,
  };
  const saveBtn = form.querySelector('.save');
  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중…';
  try {
    const json = await apiPost('/api/update', { id, ...fields });
    if (!json) { saveBtn.disabled = false; saveBtn.textContent = '저장'; return; }
    const idx = state.items.findIndex((it) => it.id === id);
    if (idx >= 0) state.items[idx] = json.entry;
    state.editingId = null;
    render();
  } catch (err) {
    alert(err.message);
    saveBtn.disabled = false;
    saveBtn.textContent = '저장';
  }
}

async function deleteItem(id) {
  const it = state.items.find((x) => x.id === id);
  if (!confirm(`"${it ? it.company : id}" 삭제할까?`)) return;
  try {
    const json = await apiPost('/api/delete', { id });
    if (!json) return;
    state.items = state.items.filter((x) => x.id !== id);
    if (state.editingId === id) state.editingId = null;
    renderHeaderStats();
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function addFromBoard(url) {
  return apiPost('/api/add', { url });
}

// ===== 이벤트 =====
function bindMainDelegation() {
  const main = document.getElementById('mainContent');
  main.addEventListener('click', (e) => {
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      e.stopPropagation();
      const holder = actBtn.closest('[data-id]');
      const id = holder && holder.dataset.id;
      const act = actBtn.dataset.act;
      if (act === 'edit') { state.editingId = id; render(); }
      else if (act === 'del') { deleteItem(id); }
      else if (act === 'cancel') { state.editingId = null; render(); }
      return;
    }
    const card = e.target.closest('.card');
    if (card && !card.classList.contains('edit-card')) {
      window.open(card.dataset.url, '_blank', 'noopener');
    }
  });
  main.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.classList.contains('edit-card')) submitEdit(e.target);
  });
}

function bindAddForm() {
  const form = document.getElementById('addForm');
  const input = document.getElementById('addInput');
  const btn = document.getElementById('addBtn');
  const status = document.getElementById('addStatus');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;
    btn.disabled = true;
    status.hidden = false;
    status.classList.remove('error');
    status.textContent = '저장 중… (페이지 읽는 중)';
    try {
      const json = await addFromBoard(url);
      if (!json) { status.hidden = true; return; }
      state.items.unshift(json.entry);
      input.value = '';
      status.textContent = `저장했어 — ${json.entry.company} [${json.entry.category}]` + (json.note ? ` · ${json.note}` : '');
      renderHeaderStats();
      render();
    } catch (err) {
      status.classList.add('error');
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

function bindEvents() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');
  const sort = document.getElementById('sortSelect');

  bindAddForm();
  bindMainDelegation();
  bindTabs();

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
  await Promise.all([loadData(), loadReports()]);
  bindEvents();
  renderHeaderStats();
  render();
})();
