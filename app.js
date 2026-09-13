/* ─── State ─── */
let recipes = [];
let seedRecipes = [];
const LS = {
  recipes:   'quickrecipe.recipes.v1',
  favs:      'quickrecipe.favs.v1',
  unit:      'quickrecipe.unit.v1',
  hydration: 'quickrecipe.hydration.v1',
  ui:        'quickrecipe.ui.v1',
};
let favs = new Set();
let unit = 'metric';
let selectedId = null;
let scale = 1;
let view = 'amounts';
let category = 'All';
let onlyFavs = false;
let editingId = null;
let hydrationState = {};
let wakeLock = null;
let wakeLockRecipeId = null;

/* ─── Helpers ─── */
function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function load(k, fallback) {
  try {
    const x = localStorage.getItem(k);
    return x ? JSON.parse(x) : cloneValue(fallback);
  } catch {
    return cloneValue(fallback);
  }
}
function saveAll() {
  localStorage.setItem(LS.recipes,   JSON.stringify(recipes));
  localStorage.setItem(LS.favs,      JSON.stringify([...favs]));
  localStorage.setItem(LS.unit,      unit);
  localStorage.setItem(LS.hydration, JSON.stringify(hydrationState));
  localStorage.setItem(LS.ui,        JSON.stringify({ selectedId, category, onlyFavs }));
}

/* ─── Seed merge ─── */
function mergeSeedRecipes(existing) {
  const byId = new Map(seedRecipes.map(r => [r.id, r]));
  const merged = existing.map(r => {
    const seed = byId.get(r.id);
    return seed ? { ...r, ...seed } : r;
  });
  const ids = new Set(merged.map(r => r.id));
  seedRecipes.forEach(r => { if (!ids.has(r.id)) merged.push(cloneValue(r)); });
  return merged;
}

function restoreUiState() {
  const saved = load(LS.ui, { selectedId: null, category: 'All', onlyFavs: false });
  if (saved.selectedId && recipes.some(r => r.id === saved.selectedId)) {
    selectedId = saved.selectedId;
  }
  category  = saved.category  || 'All';
  onlyFavs  = Boolean(saved.onlyFavs);
  if (!selectedId && recipes[0]) selectedId = recipes[0].id;
}

/* ─── Unit conversion ─── */
const fmt = n => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(r < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
};
const cToF      = c  => Math.round(c * 9 / 5 + 32);
const gToOz     = g  => g * 0.0352739619;
const mlToFloz  = ml => ml * 0.0338140227;

function amountText(v, u) {
  v *= scale;
  if (unit === 'metric') return `${fmt(v)} ${u}`;
  if (u === 'g')  return `${fmt(gToOz(v))} oz`;
  if (u === 'ml') return `${fmt(mlToFloz(v))} fl oz`;
  return `${fmt(v)} ${u}`;
}

/* ─── Baker's math ─── */
function flourTotal(r) {
  return r.ingredients.filter(x => x[3] === 'flour').reduce((n, x) => n + Number(x[1] || 0), 0);
}
function currentHydration(r) {
  return hydrationState[r.id] ?? Number(r.hydration || 0);
}
function adjustedIngredientValue(r, ing) {
  if (!r.adjustableHydration || ing[3] !== 'water') return Number(ing[1]);
  const waters    = r.ingredients.filter(x => x[3] === 'water');
  const baseTotal = waters.reduce((n, x) => n + Number(x[1] || 0), 0);
  if (!baseTotal) return Number(ing[1]);
  const target = flourTotal(r) * currentHydration(r) / 100;
  return target * (Number(ing[1]) / baseTotal);
}
function bakers(r, ing) {
  const flour = flourTotal(r);
  return flour ? `${fmt(adjustedIngredientValue(r, ing) / flour * 100)}%` : '—';
}

/* ─── Ingredient sections ─── */
const sectionPlans = {
  'drommekage':             [[0, 'Cake'], [7, 'Coconut topping']],
  'bounty-cake':            [[0, 'Coconut cake'], [3, 'Chocolate cream'], [7, 'Finish']],
  'carrot-cake':            [[0, 'Cake'], [7, 'Frosting']],
  'cinnabon-rolls':         [[0, 'Dough'], [8, 'Filling'], [11, 'Frosting']],
  'pavlova-lemon-curd':     [[0, 'Pavlova'], [5, 'Lemon curd']],
  'apple-crumb-cake':       [[0, 'Cake'], [11, 'Crumb topping']],
  'choc-orange-cheesecake': [[0, 'Base'], [2, 'Filling'], [10, 'Topping']],
  'date-cake-caramel':      [[0, 'Cake'], [10, 'Caramel sauce']],
  'lemon-meringue-cheesecake': [[0, 'Crust'], [3, 'Filling'], [11, 'Lemon curd'], [16, 'Meringue']],
};

function sectionFor(r, idx, name) {
  const plan = sectionPlans[r.id];
  if (plan) {
    let sec = '';
    for (const [start, label] of plan) {
      if (idx >= start) sec = label; else break;
    }
    return sec;
  }
  const m = String(name).match(/\s+—\s+(.+)$/);
  return m ? m[1].replace(/\b\w/g, c => c.toUpperCase()) : '';
}
function cleanIngredientName(name) {
  return String(name).replace(/\s+—\s+.+$/, '');
}

/* ─── HTML escaping ─── */
function esc(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[c]));
}

/* ─── Wake Lock ─── */
function canRequestWakeLock() {
  const secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return Boolean(selectedId) && document.visibilityState === 'visible' && secure && 'wakeLock' in navigator;
}
async function requestWakeLock() {
  if (!canRequestWakeLock() || (wakeLock && wakeLockRecipeId === selectedId)) return;
  try {
    if (wakeLock) await releaseWakeLock();
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLockRecipeId = selectedId;
    wakeLock.addEventListener('release', () => {
      if (wakeLockRecipeId === selectedId) wakeLockRecipeId = null;
    });
  } catch (e) {
    wakeLock = null;
    wakeLockRecipeId = null;
  }
}
async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch (e) {}
  wakeLock = null;
  wakeLockRecipeId = null;
}

/* ─── Render chips ─── */
function categories() {
  return ['All', ...new Set(recipes.map(r => r.category || 'Other'))];
}
function renderChips() {
  document.getElementById('chips').innerHTML = categories()
    .map(c => `<button class="chip ${category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join('');
  document.querySelectorAll('[data-cat]').forEach(b => {
    b.onclick = () => { category = b.dataset.cat; render(); };
  });
}

/* ─── Search matching ─── */
function matches(r, q) {
  q = q.toLowerCase();
  return !q
    || r.title.toLowerCase().includes(q)
    || (r.desc || '').toLowerCase().includes(q)
    || r.ingredients.some(i => i[0].toLowerCase().includes(q));
}

/* ─── Render list ─── */
function renderList() {
  const q = document.getElementById('search').value.trim();
  const shown = recipes.filter(r =>
    (category === 'All' || r.category === category)
    && (!onlyFavs || favs.has(r.id))
    && matches(r, q)
  );
  if (!shown.some(r => r.id === selectedId) && shown[0]) selectedId = shown[0].id;

  document.getElementById('list').innerHTML = shown.map(r => `
    <button class="card ${r.id === selectedId ? 'active' : ''}" data-id="${r.id}">
      <div class="card-top">
        <div>
          <div class="tag">${esc(r.category || 'Recipe')}</div>
          <h3>${esc(r.title)}</h3>
        </div>
        <span class="heart ${favs.has(r.id) ? 'on' : ''}" data-fav="${r.id}">${favs.has(r.id) ? '♥' : '♡'}</span>
      </div>
      <div class="desc">${esc(r.desc || '')}</div>
      <div class="stats">
        ${r.hydration ? `<span class="stat">${fmt(r.hydration)}% hydration</span>` : ''}
        ${r.bake      ? `<span class="stat">${esc(r.bake)}</span>` : ''}
      </div>
    </button>
  `).join('') || `<div class="empty"><div class="empty-icon">🔍</div>No recipes found.</div>`;

  document.querySelectorAll('.card[data-id]').forEach(b => {
    b.onclick = e => {
      if (e.target.closest('[data-fav]')) return;
      selectedId = b.dataset.id;
      saveAll();
      scale = 1;
      view = 'amounts';
      render();
    };
  });
  document.querySelectorAll('[data-fav]').forEach(h => {
    h.onclick = e => { e.stopPropagation(); toggleFav(h.dataset.fav); };
  });
}

/* ─── Render ingredients ─── */
function renderIngredients(r) {
  let last = '';
  return r.ingredients.map((i, idx) => {
    const sec  = sectionFor(r, idx, i[0]);
    const head = sec && sec !== last
      ? `<div class="ingredient-section">${esc(sec)}</div>` : '';
    last = sec || last;
    return `${head}
      <div class="ingredient">
        <span>${esc(cleanIngredientName(i[0]))}</span>
        <span class="amount">${view === 'bakers' ? bakers(r, i) : amountText(adjustedIngredientValue(r, i), i[2])}</span>
      </div>`;
  }).join('');
}

/* ─── Render detail panel ─── */
function renderDetail() {
  const r  = recipes.find(x => x.id === selectedId);
  const el = document.getElementById('detail');

  if (!r) {
    releaseWakeLock();
    el.innerHTML = '<div class="empty" style="margin:28px"><div class="empty-icon">🍽️</div>Choose or add a recipe.</div>';
    saveAll();
    return;
  }

  if (wakeLockRecipeId && wakeLockRecipeId !== selectedId) releaseWakeLock();
  requestWakeLock();

  const temp   = unit === 'metric' ? `${r.tempC || 0}°C` : `${cToF(r.tempC || 0)}°F`;
  const hyd    = currentHydration(r);
  const hasFlour = r.ingredients.some(i => i[3] === 'flour');

  const hydrationControl = r.adjustableHydration ? `
    <div class="hydration-box">
      <div class="hydration-row">
        <strong>Hydration</strong>
        <button class="mini-btn" id="hydMinus">−</button>
        <input id="hydRange" type="range" min="${r.hydrationMin || 50}" max="${r.hydrationMax || 90}" step="1" value="${hyd}">
        <button class="mini-btn" id="hydPlus">＋</button>
        <span class="hydration-value" id="hydValue">${fmt(hyd)}%</span>
        <button class="mini-btn" id="hydReset">Reset</button>
      </div>
      <div class="hydration-help">Adjusts the liquid automatically. Recipe range: ${fmt(r.hydrationMin)}–${fmt(r.hydrationMax)}%.</div>
    </div>` : '';

  el.innerHTML = `
    <div class="detail-head">
      <div class="detail-title-row">
        <div>
          <div class="tag">${esc(r.category || 'Recipe')}${r.hydration ? ` · ${fmt(hyd)}% hydration` : ''}</div>
          <h1>${esc(r.title)}</h1>
          <div class="desc">${esc(r.desc || '')}</div>
        </div>
        <div style="display:flex;gap:7px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn" id="detailFav">${favs.has(r.id) ? '♥ Saved' : '♡ Save'}</button>
          <button class="btn" id="editBtn">Edit</button>
        </div>
      </div>
      <div class="detail-actions" style="justify-content:flex-start">
        <div class="seg">
          ${[0.5, 1, 2, 3].map(s => `<button data-scale="${s}" class="${scale === s ? 'active' : ''}">${s === 0.5 ? '½' : s}×</button>`).join('')}
        </div>
        ${hasFlour ? `
        <div class="seg">
          <button data-view="amounts" class="${view === 'amounts' ? 'active' : ''}">Amounts</button>
          <button data-view="bakers"  class="${view === 'bakers'  ? 'active' : ''}">Baker's %</button>
        </div>` : ''}
      </div>
      ${hydrationControl}
    </div>
    <div class="detail-body">
      <section class="pane">
        <h2>Ingredients</h2>
        ${renderIngredients(r)}
      </section>
      <section class="pane">
        <h2>Method</h2>
        <ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      </section>
    </div>
    <div class="meta">
      ${r.prep   ? `<span class="stat">Prep ${esc(r.prep)}</span>`   : ''}
      ${r.ferment? `<span class="stat">Rest ${esc(r.ferment)}</span>`: ''}
      ${r.bake   ? `<span class="stat">Bake ${esc(r.bake)}</span>`   : ''}
      ${r.tempC  ? `<span class="stat">${temp}</span>`               : ''}
      ${r.yield  ? `<span class="stat">${esc(r.yield)}</span>`       : ''}
    </div>`;

  /* Scale buttons */
  document.querySelectorAll('[data-scale]').forEach(b => {
    b.onclick = () => { scale = Number(b.dataset.scale); renderDetail(); };
  });
  /* View buttons */
  document.querySelectorAll('[data-view]').forEach(b => {
    b.onclick = () => { view = b.dataset.view; renderDetail(); };
  });
  /* Hydration */
  if (r.adjustableHydration) {
    const setHyd = v => {
      hydrationState[r.id] = Math.max(Number(r.hydrationMin), Math.min(Number(r.hydrationMax), Number(v)));
      renderDetail();
    };
    document.getElementById('hydRange').oninput = e => setHyd(e.target.value);
    document.getElementById('hydMinus').onclick  = () => setHyd(hyd - 1);
    document.getElementById('hydPlus').onclick   = () => setHyd(hyd + 1);
    document.getElementById('hydReset').onclick  = () => { delete hydrationState[r.id]; renderDetail(); };
  }
  document.getElementById('detailFav').onclick = () => toggleFav(r.id);
  document.getElementById('editBtn').onclick   = () => openModal(r);
}

/* ─── Favourites ─── */
function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  saveAll();
  render();
  toast(favs.has(id) ? 'Saved to favourites' : 'Removed from favourites');
}

/* ─── Main render ─── */
function render() {
  document.getElementById('metricBtn').classList.toggle('active', unit === 'metric');
  document.getElementById('imperialBtn').classList.toggle('active', unit === 'imperial');
  document.getElementById('favFilter').classList.toggle('primary', onlyFavs);
  renderChips();
  renderList();
  renderDetail();
  saveAll();
}

/* ─── Modal ─── */
function openModal(r = null) {
  editingId = r?.id || null;
  document.getElementById('modalTitle').textContent = r ? 'Edit recipe' : 'Add recipe';
  document.getElementById('deleteBtn').style.visibility = r ? 'visible' : 'hidden';
  const set = (id, v = '') => document.getElementById(id).value = v;
  set('fTitle',       r?.title);
  set('fCategory',    r?.category || 'Bread');
  set('fDesc',        r?.desc);
  set('fYield',       r?.yield);
  set('fTemp',        r?.tempC);
  set('fPrep',        r?.prep);
  set('fFerment',     r?.ferment);
  set('fBake',        r?.bake);
  set('fHydration',   r?.hydration);
  set('fIngredients', r?.ingredients?.map(i => i.join(' | ')).join('\n'));
  set('fSteps',       r?.steps?.join('\n'));
  document.getElementById('modalBackdrop').classList.add('show');
  setTimeout(() => document.getElementById('fTitle').focus(), 50);
}
function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('show');
}
function parseIngredients(txt) {
  return txt.split('\n').map(x => x.trim()).filter(Boolean).map(line => {
    let [name, amount, unitName, role = ''] = line.split('|').map(x => x.trim());
    return [name, Number(amount), unitName || '', role];
  });
}
function saveRecipe() {
  const title       = document.getElementById('fTitle').value.trim();
  const ingredients = parseIngredients(document.getElementById('fIngredients').value);
  const steps       = document.getElementById('fSteps').value.split('\n').map(x => x.trim()).filter(Boolean);

  if (!title || !ingredients.length || ingredients.some(i => !i[0] || !Number.isFinite(i[1])) || !steps.length) {
    toast('Add a name, valid ingredients and method steps');
    return;
  }
  const data = {
    id:        editingId || `r_${Date.now()}`,
    title,
    category:  document.getElementById('fCategory').value.trim()  || 'Other',
    desc:      document.getElementById('fDesc').value.trim(),
    yield:     document.getElementById('fYield').value.trim(),
    tempC:     Number(document.getElementById('fTemp').value) || 0,
    prep:      document.getElementById('fPrep').value.trim(),
    ferment:   document.getElementById('fFerment').value.trim(),
    bake:      document.getElementById('fBake').value.trim(),
    hydration: Number(document.getElementById('fHydration').value) || 0,
    ingredients,
    steps,
  };
  if (editingId) {
    recipes = recipes.map(r => r.id === editingId ? data : r);
  } else {
    recipes.unshift(data);
  }
  selectedId = data.id;
  category   = 'All';
  saveAll();
  closeModal();
  render();
  toast(editingId ? 'Recipe updated' : 'Recipe added');
}
function deleteRecipe() {
  if (!editingId) return;
  recipes    = recipes.filter(r => r.id !== editingId);
  favs.delete(editingId);
  selectedId = recipes[0]?.id || null;
  saveAll();
  closeModal();
  render();
  toast('Recipe deleted');
}

/* ─── Toast ─── */
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => t.classList.remove('show'), 1900);
}

/* ─── Bootstrap ─── */
async function init() {
  /* Show loading spinner */
  document.getElementById('list').innerHTML   = '<div class="loading"><div class="spinner"></div>Loading recipes…</div>';
  document.getElementById('detail').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  /* Load seed recipes from JSON */
  try {
    const res = await fetch('./recipes.json');
    seedRecipes = await res.json();
  } catch (e) {
    console.warn('Could not load recipes.json, using empty seed list.', e);
    seedRecipes = [];
  }

  /* Merge with user's stored recipes */
  favs           = new Set(load(LS.favs, []));
  unit           = localStorage.getItem(LS.unit) || 'metric';
  hydrationState = load(LS.hydration, {});
  recipes        = mergeSeedRecipes(load(LS.recipes, seedRecipes));
  selectedId     = recipes.find(r => r.id === 'ciabatta')?.id || recipes[0]?.id || null;
  restoreUiState();

  /* Wire up static event listeners */
  document.getElementById('search').oninput         = render;
  document.getElementById('metricBtn').onclick      = () => { unit = 'metric';   saveAll(); render(); };
  document.getElementById('imperialBtn').onclick    = () => { unit = 'imperial'; saveAll(); render(); };
  document.getElementById('favFilter').onclick      = () => { onlyFavs = !onlyFavs; saveAll(); render(); };
  document.getElementById('addBtn').onclick         = () => openModal();
  document.getElementById('cancelBtn').onclick      = closeModal;
  document.getElementById('saveBtn').onclick        = saveRecipe;
  document.getElementById('deleteBtn').onclick      = deleteRecipe;
  document.getElementById('modalBackdrop').onclick  = e => { if (e.target.id === 'modalBackdrop') closeModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock(); else releaseWakeLock();
  });
  window.addEventListener('pagehide', releaseWakeLock);

  /* Register service worker */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
}

init();
