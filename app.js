/* ─── State ─── */
let recipes = [];
let seedRecipes = [];
const LS = {
  recipes:   'quickrecipe.recipes.v1',
  favs:      'quickrecipe.favs.v1',
  unit:      'quickrecipe.unit.v1',
  hydration: 'quickrecipe.hydration.v1',
  ui:        'quickrecipe.ui.v1',
  theme:     'quickrecipe.theme',
};
let favs           = new Set();
let unit           = 'metric';
let selectedId     = null;
let scale          = 1;
let view           = 'amounts';
let category       = 'All';
let recipeSection = 'All';
let listScrollTop = 0;
const recipeSections = [
  { id: 'baking', label: 'Bread & baking', categories: ['Bread', 'Loaves', 'Rolls', 'Flatbreads', 'Pastries'] },
  { id: 'desserts', label: 'Cakes & desserts', categories: ['Cake', 'Cakes', 'Cheesecake', 'Cheesecakes', 'Skyr Cake', 'Cookies', 'Dessert', 'Desserts'] },
  { id: 'meals', label: 'Meals', categories: ['Breakfast', 'Soups', 'Salads', 'Mains', 'Sides'] },
  { id: 'sauces', label: 'Dressings & sauces', categories: ['Dressings', 'Sauce', 'Sauces', 'Dips'] },
];
function sectionForRecipe(r) {
  if (recipeSections.some(section => section.id === r.section)) return r.section;
  return recipeSections.find(section => section.categories.some(c => c.toLowerCase() === (r.category || '').toLowerCase()))?.id || 'meals';
}
let onlyFavs       = false;
let editingId      = null;
let hydrationState = {};
let wakeLock       = null;
let wakeLockRecipeId = null;

/* Focus mode — which ingredient section header is currently active */
let focusedSection = null;

/* ─── Theme ─── */
function getEffectiveTheme() {
  const stored = localStorage.getItem(LS.theme);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeBtn');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀' : '🌙';
    btn.title       = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}
function toggleTheme() {
  const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(LS.theme, next);
  applyTheme(next);
}
function initTheme() {
  applyTheme(getEffectiveTheme());
  /* Keep in sync if OS preference changes while app is open */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem(LS.theme)) applyTheme(getEffectiveTheme());
  });
}

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
  localStorage.setItem(LS.ui,        JSON.stringify({ selectedId, category, onlyFavs, recipeSection }));
}

/* ─── Seed merge ─── */
function mergeSeedRecipes(existing) {
  const seedIds = new Set(seedRecipes.map(r => r.id));
  const cleanExisting = (existing || []).filter(r => seedIds.has(r.id) || !r.id.startsWith('gotteri-'));
  const byId   = new Map(seedRecipes.map(r => [r.id, r]));
  const merged = cleanExisting.map(r => {
    const seed = byId.get(r.id);
    return seed ? { ...r, ...seed } : r;
  });
  const ids = new Set(merged.map(r => r.id));
  seedRecipes.forEach(r => { if (!ids.has(r.id)) merged.push(cloneValue(r)); });
  return merged.map(r => r.category === 'Sauce' ? { ...r, category: 'Dressings' } : r);
}
function restoreUiState() {
  const saved = load(LS.ui, { selectedId: null, category: 'All', onlyFavs: false });
  if (saved.selectedId && recipes.some(r => r.id === saved.selectedId)) selectedId = saved.selectedId;
  category = saved.category === 'Sauce' ? 'Dressings' : saved.category || 'All';
  recipeSection = recipeSections.some(section => section.id === saved.recipeSection) ? saved.recipeSection :
    category === 'All' ? 'All' : sectionForRecipe({ category });
  if (!recipes.some(r => r.category === category && sectionForRecipe(r) === recipeSection)) category = 'All';
  onlyFavs = Boolean(saved.onlyFavs);
  if (!selectedId && recipes[0]) selectedId = recipes[0].id;
}

/* ─── Unit conversion ─── */
const fmt = n => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(r < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
};
const cToF     = c  => Math.round(c * 9 / 5 + 32);
const gToOz    = g  => g * 0.0352739619;
const mlToFloz = ml => ml * 0.0338140227;

function amountText(v, u) {
  v *= scale;
  if (unit === 'metric') return `${fmt(v)} ${u}`;
  if (u === 'g')  return `${fmt(gToOz(v))} oz`;
  if (u === 'ml') return `${fmt(mlToFloz(v))} fl oz`;
  return `${fmt(v)} ${u}`;
}

function yieldText(value, multiplier = scale) {
  if (multiplier === 1) return value;
  // Keep pan dimensions intact; only batch quantities should change.
  const dimensions = [];
  const panCount = value.match(/^(\d+(?:\.\d+)?\s*×\s*)(?=\d)/)?.[0] || '';
  const protectedValue = panCount + value.slice(panCount.length).replace(/\d+(?:\.\d+)?(?:\s*[×x–-]\s*\d+(?:\.\d+)?)*\s*(?:cm|mm|inches|inch|in)\b/gi, match => {
    dimensions.push(match);
    return '\uFFF0';
  });
  const plurals = { loaf: 'loaves', tray: 'trays', cake: 'cakes', tin: 'tins', bun: 'buns', roll: 'rolls', baguette: 'baguettes', serving: 'servings', slice: 'slices', glass: 'glasses', bowl: 'bowls', dish: 'dishes' };
  let changed = false;
  const scaled = protectedValue.replace(/(\d+(?:\.\d+)?)(?:([–-])(\d+(?:\.\d+)?))?(\s+(?:(?:large|small|chocolate|serving)\s+)?(?:loaves|loaf|trays?|cakes?|tins?|buns?|rolls?|baguettes?|servings?|slices?|glasses|glass|bowls?|dishes|dish)\b)?/g,
    (_, low, dash, high, label = '') => {
      changed = true;
      const quantity = Number(low) * multiplier;
      const singular = !high && quantity === 1;
      label = label.replace(/\w+$/, noun => {
        const base = Object.keys(plurals).find(key => key === noun || plurals[key] === noun);
        return base ? (singular ? base : plurals[base]) : noun;
      });
      return `${fmt(quantity)}${high ? dash + fmt(Number(high) * multiplier) : ''}${label}`;
    });
  let dimensionIndex = 0;
  const result = scaled.replace(/\uFFF0/g, () => dimensions[dimensionIndex++]);
  return changed ? result : `${fmt(multiplier)}× batch · original yield: ${value}`;
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

/* ─── Section plans for ingredients ─── */
const sectionPlans = {
  // ── Original recipes ──
  'drommekage':             [[0, 'Cake'], [7, 'Coconut topping']],
  'bounty-cake':            [[0, 'Coconut cake'], [3, 'Chocolate cream'], [7, 'Finish']],
  'carrot-cake':            [[0, 'Cake'], [7, 'Frosting']],
  'cinnabon-rolls':         [[0, 'Dough'], [8, 'Filling'], [11, 'Frosting']],
  'sourdough-spelt-crumb-brioche': [[0, 'Dough'], [8, 'Crumble Topping']],
  'pavlova-lemon-curd':     [[0, 'Pavlova'], [5, 'Lemon curd']],
  'apple-crumb-cake':       [[0, 'Cake'], [11, 'Crumb topping']],
  'choc-orange-cheesecake': [[0, 'Base'], [2, 'Filling'], [10, 'Topping']],
  'date-cake-caramel':      [[0, 'Cake'], [10, 'Caramel sauce']],
  'lemon-meringue-cheesecake': [[0, 'Crust'], [3, 'Filling'], [11, 'Lemon curd'], [16, 'Meringue']],

  // ── Gotteri Cheesecakes ──
  'gotteri-blaberja-ostakaka':          [[0, 'Base'], [3, 'Filling'], [8, 'Jelly topping']],
  'gotteri-vanillu-ostakaka-berjasosu': [[0, 'Base'], [3, 'Filling'], [8, 'Berry sauce']],
  'gotteri-berjabomba':                 [[0, 'Base'], [4, 'Filling'], [11, 'Topping']],
  'gotteri-oreo-ostakaka-brownies':     [[0, 'Brownie batter'], [8, 'Cheesecake swirl'], [11, 'Topping']],
  'gotteri-gudddomleg-oreo-ostakaka':   [[0, 'Base'], [4, 'Filling'], [8, 'Topping']],
  'gotteri-toblerone-ostakaka':         [[0, 'Base'], [2, 'Cheesecake filling'], [10, 'Raspberry swirl']],
  'gotteri-daim-ostakaka':              [[0, 'Base'], [2, 'White chocolate Daim filling']],
  'gotteri-biscoff-ostakaka':           [[0, 'Base'], [2, 'Biscoff filling'], [7, 'Topping']],
  'gotteri-jardarberja-ostakaka':       [[0, 'Base'], [2, 'Strawberry filling'], [10, 'Topping']],
  'gotteri-lemon-curd-ostakaka':        [[0, 'Base'], [2, 'Cheesecake filling'], [7, 'Topping']],
  'gotteri-espresso-martini-ostakaka':  [[0, 'Base'], [2, 'Espresso cheesecake'], [9, 'Garnish']],
  'gotteri-pekanhnetu-ostakaka':        [[0, 'Caramel pecans'], [3, 'Base'], [5, 'Filling']],
  'gotteri-flamberud-ostakaka':         [[0, 'Base'], [2, 'Filling'], [10, 'Meringue']],
  'gotteri-ostakaka-appelsinu':         [[0, 'Base'], [2, 'Orange & white chocolate filling']],
  'gotteri-hatidleg-ostakaka':          [[0, 'Base'], [2, 'White chocolate Daim filling']],
  'gotteri-ostakokubomba':              [[0, 'Brownie base'], [6, 'Cheesecake'], [14, 'Meringue']],
  'gotteri-rolo-ostakaka':              [[0, 'Base'], [2, 'Caramel filling']],
  'gotteri-hatidarostakaka-glос':        [[0, 'Base'], [2, 'Cheesecake filling'], [6, 'Dumle caramel & garnish']],
  'gotteri-ostakaka-karamella-kanilkex':[[0, 'Base'], [1, 'Cheesecake filling'], [5, 'Caramel topping']],
  'gotteri-hatidleg-hindberja-ostakaka':[[0, 'Base'], [2, 'White chocolate & raspberry filling'], [11, 'Topping']],
  'gotteri-sernik':                     [[0, 'Pastry'], [9, 'Filling']],
  'gotteri-baron-ostakaka':             [[0, 'Base'], [2, 'Cheesecake filling'], [6, 'Chocolate ganache']],
  'gotteri-jardaberja-ostakaka-sukkuladiskal': [[0, 'Chocolate bowls'], [2, 'Base'], [4, 'Strawberry cheesecake filling'], [9, 'Garnish']],

  // ── Gotteri Skyr Cakes ──
  'gotteri-hindberja-skyrkaka-sukkuladiskal': [[0, 'Chocolate bowls'], [2, 'Base'], [4, 'Vanilla skyr mousse'], [7, 'Raspberry topping']],
  'gotteri-jardaberja-skyrkaka-kokteill':     [[0, 'Base'], [2, 'Cream cheese filling'], [6, 'Strawberry glaze'], [10, 'Garnish']],
  'gotteri-mini-blaberja-skyrkokur':          [[0, 'Base'], [2, 'Skyr mousse'], [4, 'Blueberry sauce']],
  'gotteri-vanillu-skyrkaka-musli':           [[0, 'Base'], [1, 'Vanilla skyr mousse'], [3, 'Topping']],
  'gotteri-skyrkaka-heidu':                   [[0, 'Base'], [2, 'Skyr mousse'], [4, 'Topping']],
  'gotteri-sukkuladi-skyrkokur':              [[0, 'Chocolate skyr mousse'], [2, 'Whipped cream topping'], [3, 'Garnish']],
  'gotteri-skyrkaka-hriskokuskal':            [[0, 'Rice Krispie shell'], [4, 'Strawberry skyr mousse'], [6, 'Garnish']],
  'gotteri-thjodhatidardesert':               [[0, 'Base'], [1, 'Skyr mousse'], [3, 'Flag decoration']],
  'gotteri-skyrkaka-mondlu-sitronum':         [[0, 'Base'], [2, 'Lemon skyr filling'], [9, 'Garnish']],
  'gotteri-sumarleg-skyrkaka':                [[0, 'Base'], [2, 'Berry skyr filling'], [8, 'Garnish']],
  'gotteri-berjaskyrkaka':                    [[0, 'Base'], [2, 'Skyr mousse'], [4, 'Topping']],
  'gotteri-skyrkokur-noakroppi':              [[0, 'Base'], [3, 'Skyr mousse'], [5, 'Topping']],
  'gotteri-vanillu-skyrkaka-lakkris':         [[0, 'Base'], [2, 'Vanilla skyr mousse']]
};

/* ─── Section plans for steps (Focus mode) ─── */
const stepSectionPlans = {
  // ── Original recipes ──
  'drommekage':             [[0, 'Cake'],          [3, 'Coconut topping']],
  'bounty-cake':            [[0, 'Coconut cake'],  [2, 'Chocolate cream'], [4, 'Finish']],
  'carrot-cake':            [[0, 'Cake'],          [3, 'Frosting']],
  'cinnabon-rolls':         [[0, 'Dough'],         [2, 'Filling'],         [5, 'Frosting']],
  'sourdough-spelt-crumb-brioche': [[0, 'Dough & Ferment'], [3, 'Crumble & Bake']],
  'pavlova-lemon-curd':     [[0, 'Pavlova'],       [3, 'Lemon curd']],
  'apple-crumb-cake':       [[0, 'Cake'],          [3, 'Crumb topping']],
  'choc-orange-cheesecake': [[0, 'Base'],          [1, 'Filling'],         [4, 'Topping']],
  'date-cake-caramel':      [[0, 'Cake'],          [4, 'Caramel sauce']],
  'lemon-meringue-cheesecake': [[0, 'Crust'], [1, 'Filling'], [3, 'Lemon curd'], [4, 'Meringue']],

  // ── Gotteri Cheesecakes ──
  'gotteri-blaberja-ostakaka':          [[0, 'Base'], [1, 'Filling'], [3, 'Jelly topping']],
  'gotteri-vanillu-ostakaka-berjasosu': [[0, 'Base'], [1, 'Filling'], [3, 'Berry sauce']],
  'gotteri-berjabomba':                 [[0, 'Base'], [1, 'Filling'], [3, 'Topping']],
  'gotteri-oreo-ostakaka-brownies':     [[0, 'Brownie batter'], [1, 'Cheesecake swirl'], [2, 'Brownie batter'], [3, 'Assembly & bake']],
  'gotteri-gudddomleg-oreo-ostakaka':   [[0, 'Base'], [1, 'Filling'], [3, 'Topping']],
  'gotteri-toblerone-ostakaka':         [[0, 'Base'], [1, 'Cheesecake filling'], [3, 'Raspberry swirl']],
  'gotteri-daim-ostakaka':              [[0, 'Base'], [1, 'White chocolate Daim filling']],
  'gotteri-biscoff-ostakaka':           [[0, 'Base'], [1, 'Biscoff filling'], [3, 'Topping']],
  'gotteri-jardarberja-ostakaka':       [[0, 'Base'], [1, 'Strawberry filling'], [3, 'Topping']],
  'gotteri-lemon-curd-ostakaka':        [[0, 'Base'], [1, 'Cheesecake filling'], [2, 'Assembly & topping']],
  'gotteri-espresso-martini-ostakaka':  [[0, 'Base'], [1, 'Espresso cheesecake'], [2, 'Assembly & garnish']],
  'gotteri-pekanhnetu-ostakaka':        [[0, 'Caramel pecans'], [1, 'Base'], [2, 'Filling']],
  'gotteri-flamberud-ostakaka':         [[0, 'Base'], [1, 'Filling'], [2, 'Meringue']],
  'gotteri-ostakaka-appelsinu':         [[0, 'Base'], [1, 'Orange & white chocolate filling']],
  'gotteri-hatidleg-ostakaka':          [[0, 'Base'], [1, 'White chocolate Daim filling']],
  'gotteri-ostakokubomba':              [[0, 'Brownie base'], [1, 'Cheesecake'], [2, 'Meringue']],
  'gotteri-rolo-ostakaka':              [[0, 'Base'], [1, 'Caramel filling']],
  'gotteri-hatidarostakaka-glос':        [[0, 'Base'], [1, 'Cheesecake filling'], [2, 'Dumle caramel & garnish']],
  'gotteri-ostakaka-karamella-kanilkex':[[0, 'Base'], [1, 'Cheesecake filling'], [2, 'Caramel topping']],
  'gotteri-hatidleg-hindberja-ostakaka':[[0, 'Base'], [1, 'White chocolate & raspberry filling'], [2, 'Assembly & topping']],
  'gotteri-sernik':                     [[0, 'Pastry'], [1, 'Filling']],
  'gotteri-baron-ostakaka':             [[0, 'Base'], [1, 'Cheesecake filling'], [2, 'Chocolate ganache']],
  'gotteri-jardaberja-ostakaka-sukkuladiskal': [[0, 'Chocolate bowls'], [1, 'Strawberry cheesecake filling'], [2, 'Base'], [3, 'Garnish']],

  // ── Gotteri Skyr Cakes ──
  'gotteri-hindberja-skyrkaka-sukkuladiskal': [[0, 'Chocolate bowls'], [1, 'Vanilla skyr mousse'], [2, 'Base'], [3, 'Raspberry topping']],
  'gotteri-jardaberja-skyrkaka-kokteill':     [[0, 'Strawberry glaze'], [1, 'Cream cheese filling'], [2, 'Assembly & garnish']],
  'gotteri-mini-blaberja-skyrkokur':          [[0, 'Base'], [1, 'Blueberry sauce'], [2, 'Skyr mousse']],
  'gotteri-vanillu-skyrkaka-musli':           [[0, 'Base'], [1, 'Vanilla skyr mousse'], [2, 'Assembly & topping']],
  'gotteri-skyrkaka-heidu':                   [[0, 'Base'], [1, 'Skyr mousse'], [2, 'Topping']],
  'gotteri-sukkuladi-skyrkokur':              [[0, 'Chocolate skyr mousse'], [1, 'Muesli layer'], [2, 'Whipped cream topping']],
  'gotteri-skyrkaka-hriskokuskal':            [[0, 'Rice Krispie shell'], [1, 'Strawberry skyr mousse'], [2, 'Garnish']],
  'gotteri-thjodhatidardesert':               [[0, 'Base'], [1, 'Skyr mousse'], [2, 'Flag decoration']],
  'gotteri-skyrkaka-mondlu-sitronum':         [[0, 'Base'], [1, 'Lemon skyr filling'], [3, 'Garnish & chill']],
  'gotteri-sumarleg-skyrkaka':                [[0, 'Base'], [1, 'Berry skyr filling'], [3, 'Garnish & chill']],
  'gotteri-berjaskyrkaka':                    [[0, 'Base'], [1, 'Skyr mousse'], [2, 'Topping']],
  'gotteri-skyrkokur-noakroppi':              [[0, 'Base'], [1, 'Skyr mousse'], [2, 'Topping']],
  'gotteri-vanillu-skyrkaka-lakkris':         [[0, 'Base'], [1, 'Vanilla skyr mousse'], [2, 'Topping']]
};

function sectionFor(r, idx, name) {
  const plan = sectionPlans[r.id];
  if (!plan) return '';   /* no plan → no sections, no Focus mode for this recipe */
  let sec = '';
  for (const [start, label] of plan) { if (idx >= start) sec = label; else break; }
  return sec;
}

function stepSectionFor(r, stepIdx) {
  const plan = stepSectionPlans[r.id];
  if (!plan) return null;
  let sec = null;
  for (const [start, label] of plan) { if (stepIdx >= start) sec = label; else break; }
  return sec;
}

function cleanIngredientName(name) {
  return String(name).replace(/\s+—\s+.+$/, '');
}

/* ─── HTML escaping ─── */
function esc(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]
  ));
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
    wakeLock.addEventListener('release', () => { if (wakeLockRecipeId === selectedId) wakeLockRecipeId = null; });
  } catch { wakeLock = null; wakeLockRecipeId = null; }
}
async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch {}
  wakeLock = null; wakeLockRecipeId = null;
}

/* ─── Chips ─── */
function categories() {
  return ['All', ...new Set(recipes.filter(r => sectionForRecipe(r) === recipeSection).map(r => r.category || 'Other'))];
}
function browseSection(id) {
  recipeSection = id;
  category = 'All';
  onlyFavs = false;
  document.getElementById('search').value = '';
  document.querySelector('.app').classList.remove('reading-recipe');
  render();
  document.getElementById('list').scrollTop = 0;
}
function renderChips() {
  const searching = Boolean(document.getElementById('search').value.trim());
  const sections = [{ id: 'All', label: 'All recipes' }, ...recipeSections];
  const nav = document.getElementById('sections');
  if (!nav.children.length) {
    nav.innerHTML = sections.map(section => `<button class="section-link" data-browse="${section.id}">${esc(section.label)} <span class="section-count"></span></button>`).join('');
    nav.querySelectorAll('[data-browse]').forEach(b => b.onclick = () => browseSection(b.dataset.browse));
    document.getElementById('sectionSelect').innerHTML = sections.map(section => `<option value="${section.id}">${esc(section.label)}</option>`).join('');
  }
  nav.querySelectorAll('[data-browse]').forEach(b => {
    const active = !searching && !onlyFavs && b.dataset.browse === recipeSection;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active);
    b.querySelector('.section-count').textContent = recipes.filter(r => b.dataset.browse === 'All' || sectionForRecipe(r) === b.dataset.browse).length;
  });
  document.getElementById('sectionSelect').value = searching ? 'All' : recipeSection;
  const container = document.getElementById('chips');
  container.hidden = searching || recipeSection === 'All';
  const cats = categories();
  const current = [...container.querySelectorAll('[data-cat]')].map(b => b.dataset.cat);
  if (JSON.stringify(current) !== JSON.stringify(cats)) {
    container.innerHTML = cats.map(c => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    container.querySelectorAll('[data-cat]').forEach(b => {
      b.onclick = () => { category = b.dataset.cat; render(); document.getElementById('list').scrollTop = 0; };
    });
  }
  container.querySelectorAll('[data-cat]').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === category);
    b.setAttribute('aria-pressed', b.dataset.cat === category);
  });
}

/* ─── List ─── */
function matches(r, q) {
  q = q.toLowerCase();
  return !q || r.title.toLowerCase().includes(q) || (r.desc || '').toLowerCase().includes(q)
    || r.ingredients.some(i => i[0].toLowerCase().includes(q));
}
function renderList() {
  const q     = document.getElementById('search').value.trim();
  const shown = recipes.filter(r =>
    (q || ((recipeSection === 'All' || sectionForRecipe(r) === recipeSection) && (category === 'All' || (r.category || 'Other') === category))) &&
    (!onlyFavs || favs.has(r.id)) && matches(r, q)
  );
  if (!shown.some(r => r.id === selectedId)) {
    selectedId = shown[0]?.id || null;
    scale = 1; view = 'amounts'; focusedSection = null;
  }

  const scope = q ? `Search ${onlyFavs ? 'favourites' : 'all recipes'}: “${q}”` : onlyFavs ? 'Favourites' :
    [recipeSections.find(section => section.id === recipeSection)?.label || 'All recipes', category === 'All' ? '' : category].filter(Boolean).join(' / ');
  document.getElementById('resultSummary').textContent = `${scope} · ${shown.length} ${shown.length === 1 ? 'recipe' : 'recipes'}`;
  const list = document.getElementById('list');
  const previousScroll = list.scrollTop;
  list.innerHTML = shown.map(r => `
    <button class="card ${r.id === selectedId ? 'active' : ''}" data-id="${r.id}" aria-current="${r.id === selectedId ? 'true' : 'false'}">
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
  `).join('') || `<div class="empty"><div class="empty-icon">🔍</div>${q || onlyFavs || category !== 'All' ? 'No recipes found. Try another search or filter.' : 'No recipes here yet. Add a recipe to get started.'}</div>`;
  list.scrollTop = previousScroll;

  document.querySelectorAll('.card[data-id]').forEach(b => {
    b.onclick = e => {
      if (e.target.closest('[data-fav]')) return;
      selectedId = b.dataset.id;
      focusedSection = null; /* clear focus when switching recipe */
      saveAll(); scale = 1; view = 'amounts';
      render();
      openDetailPanel();
    };
  });
  document.querySelectorAll('[data-fav]').forEach(h => {
    h.onclick = e => { e.stopPropagation(); toggleFav(h.dataset.fav); };
  });
}

/* ─── Compact list/detail navigation ─── */
const compactLayout = window.matchMedia('(max-width: 860px)');
function syncNavigation() {
  const open = document.querySelector('.app').classList.contains('reading-recipe');
  document.getElementById('list').inert = compactLayout.matches && open;
  document.getElementById('detail').inert = compactLayout.matches && !open;
}
function openDetailPanel() {
  listScrollTop = document.getElementById('list').scrollTop;
  document.querySelector('.app').classList.add('reading-recipe');
  syncNavigation();
  document.getElementById('detail').scrollTop = 0;
  if (compactLayout.matches) document.getElementById('backBtn').focus();
}
function closeDetailPanel() {
  document.querySelector('.app').classList.remove('reading-recipe');
  syncNavigation();
  document.getElementById('list').scrollTop = listScrollTop;
  document.querySelector('.card.active')?.focus({ preventScroll: true });
}
compactLayout.addEventListener('change', syncNavigation);

/* ─── Render ingredients with Focus support ─── */
function renderIngredients(r) {
  const hasSections = Boolean(sectionPlans[r.id]);
  let last = '';
  return r.ingredients.map((i, idx) => {
    const sec  = sectionFor(r, idx, i[0]);
    /* Determine focus dimming */
    const ingDimmed = focusedSection && sec !== focusedSection;
    let html = '';
    if (sec && sec !== last) {
      const secFocused = focusedSection === sec;
      const secDimmed  = focusedSection && !secFocused;
      html += `<button
        class="ingredient-section${secFocused ? ' focused' : ''}${secDimmed ? ' dimmed' : ''}"
        data-section="${esc(sec)}"
        aria-pressed="${secFocused}"
        title="${secFocused ? 'Click to clear focus' : 'Click to focus this section'}"
      >${esc(sec)}</button>`;
    }
    last = sec || last;
    html += `<div class="ingredient${ingDimmed ? ' dimmed' : ''}" data-section="${esc(sec)}">
      <span>${esc(cleanIngredientName(i[0]))}</span>
      <span class="amount">${view === 'bakers' ? bakers(r, i) : amountText(adjustedIngredientValue(r, i), i[2])}</span>
    </div>`;
    return html;
  }).join('');
}

/* ─── Detail panel ─── */
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

  const temp      = unit === 'metric' ? `${r.tempC || 0}°C` : `${cToF(r.tempC || 0)}°F`;
  const hyd       = currentHydration(r);
  const hasFlour  = r.ingredients.some(i => i[3] === 'flour');
  const hasSecs   = Boolean(sectionPlans[r.id]);

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

  /* Render steps: dim those outside the focused section */
  const stepsHtml = r.steps.map((s, idx) => {
    const stepSec = stepSectionFor(r, idx);
    const dimmed  = focusedSection && stepSec && stepSec !== focusedSection;
    return `<li class="${dimmed ? 'dimmed' : ''}" data-section="${esc(stepSec || '')}">${esc(s)}</li>`;
  }).join('');

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
        ${hasSecs ? `<div class="focus-hint">Tap a section to focus it</div>` : ''}
        ${renderIngredients(r)}
      </section>
      <section class="pane">
        <h2>Method${focusedSection ? ` · <span style="color:var(--accent)">${esc(focusedSection)}</span>` : ''}</h2>
        <ol class="steps">${stepsHtml}</ol>
      </section>
    </div>

    <div class="meta">
      ${r.prep   ? `<span class="stat">Prep ${esc(r.prep)}</span>`   : ''}
      ${r.ferment? `<span class="stat">Rest ${esc(r.ferment)}</span>`: ''}
      ${r.bake   ? `<span class="stat">Bake ${esc(r.bake)}</span>`   : ''}
      ${r.tempC  ? `<span class="stat">${temp}</span>`               : ''}
      ${r.yield  ? `<span class="stat" id="recipeYield">${esc(yieldText(r.yield))}</span>` : ''}
    </div>`;

  /* Scale */
  document.querySelectorAll('[data-scale]').forEach(b => {
    b.onclick = () => { scale = Number(b.dataset.scale); renderDetail(); };
  });
  /* View */
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
  /* Fav / edit */
  document.getElementById('detailFav').onclick = () => toggleFav(r.id);

  /* ── Focus mode: ingredient section click handlers — class-only, no re-render ── */
  document.querySelectorAll('.ingredient-section[data-section]').forEach(btn => {
    btn.onclick = () => {
      const sec = btn.dataset.section;
      focusedSection = focusedSection === sec ? null : sec;
      applyFocusClasses();
    };
  });
}

/* ─── Focus: toggle classes without re-rendering ─── */
function applyFocusClasses() {
  /* Section header buttons */
  document.querySelectorAll('.ingredient-section[data-section]').forEach(btn => {
    const isFocused = btn.dataset.section === focusedSection;
    const isDimmed  = Boolean(focusedSection) && !isFocused;
    btn.classList.toggle('focused', isFocused);
    btn.classList.toggle('dimmed',  isDimmed);
    btn.setAttribute('aria-pressed', String(isFocused));
    btn.title = isFocused ? 'Click to clear focus' : 'Click to focus this section';
  });

  /* Ingredient rows */
  document.querySelectorAll('.ingredient[data-section]').forEach(el => {
    const s = el.dataset.section;
    el.classList.toggle('dimmed', Boolean(focusedSection) && s !== focusedSection);
  });

  /* Method steps */
  document.querySelectorAll('.steps li[data-section]').forEach(el => {
    const s = el.dataset.section;
    const hasSec = Boolean(s);
    el.classList.toggle('dimmed', Boolean(focusedSection) && hasSec && s !== focusedSection);
  });

  /* Method heading label */
  const methodH2 = document.querySelector('.pane:last-child > h2');
  if (methodH2) {
    methodH2.innerHTML = focusedSection
      ? `Method · <span style="color:var(--accent)">${esc(focusedSection)}</span>`
      : 'Method';
  }
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
  document.getElementById('favFilter').classList.toggle('active', onlyFavs);
  document.getElementById('favFilter').setAttribute('aria-pressed', onlyFavs);
  ['metric', 'imperial'].forEach(value => document.getElementById(value + 'Btn').setAttribute('aria-pressed', unit === value));
  renderChips();
  renderList();
  renderDetail();
  syncNavigation();
  saveAll();
}

/* ─── Modal ─── */
function openModal(r = null) {
  editingId = r?.id || null;
  document.getElementById('modalTitle').textContent = r ? 'Edit recipe' : 'Add recipe';
  document.getElementById('deleteBtn').style.visibility = r ? 'visible' : 'hidden';
  const set = (id, v = '') => document.getElementById(id).value = v;
  set('fTitle',       r?.title);
  set('fCategory',    r?.category || (recipeSections.find(section => section.id === recipeSection)?.categories[0] || 'Bread'));
  document.getElementById('fSection').innerHTML = recipeSections.map(section => `<option value="${section.id}">${esc(section.label)}</option>`).join('');
  set('fSection', r ? sectionForRecipe(r) : recipeSection === 'All' ? 'baking' : recipeSection);
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
    category:  document.getElementById('fCategory').value.trim() || 'Other',
    section:   document.getElementById('fSection').value,
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
  if (editingId) { recipes = recipes.map(r => r.id === editingId ? data : r); }
  else recipes.unshift(data);
  selectedId = data.id;
  recipeSection = sectionForRecipe(data);
  category   = 'All';
  onlyFavs = false;
  document.getElementById('search').value = '';
  saveAll();
  closeModal();
  render();
  openDetailPanel();
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
  /* Apply theme immediately before anything renders */
  initTheme();

  /* Loading state */
  document.getElementById('list').innerHTML   = '<div class="loading"><div class="spinner"></div>Loading recipes…</div>';
  document.getElementById('detail').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  /* Fetch seed recipes */
  try {
    const res = await fetch('./recipes.json?v=19');
    seedRecipes = await res.json();
  } catch (e) {
    console.warn('Could not load recipes.json', e);
    seedRecipes = [];
  }

  /* Restore state */
  favs           = new Set(load(LS.favs, []));
  unit           = localStorage.getItem(LS.unit) || 'metric';
  hydrationState = load(LS.hydration, {});
  recipes        = mergeSeedRecipes(load(LS.recipes, seedRecipes));
  selectedId     = recipes.find(r => r.id === 'ciabatta')?.id || recipes[0]?.id || null;
  restoreUiState();

  /* Static event listeners */
  document.getElementById('themeBtn').onclick       = toggleTheme;
  document.getElementById('search').oninput = () => { render(); document.getElementById('list').scrollTop = 0; };
  document.getElementById('sectionSelect').onchange = e => browseSection(e.target.value);
  document.getElementById('metricBtn').onclick      = () => { unit = 'metric';   saveAll(); render(); };
  document.getElementById('imperialBtn').onclick    = () => { unit = 'imperial'; saveAll(); render(); };
  document.getElementById('favFilter').onclick      = () => { onlyFavs = !onlyFavs; recipeSection = 'All'; category = 'All'; document.getElementById('search').value = ''; document.querySelector('.app').classList.remove('reading-recipe'); render(); document.getElementById('list').scrollTop = 0; };
  document.getElementById('addBtn').onclick         = () => openModal();
  document.getElementById('cancelBtn').onclick      = closeModal;
  document.getElementById('saveBtn').onclick        = saveRecipe;
  document.getElementById('deleteBtn').onclick      = deleteRecipe;
  document.getElementById('backBtn')?.addEventListener('click', closeDetailPanel);
  document.getElementById('modalBackdrop').onclick  = e => { if (e.target.id === 'modalBackdrop') closeModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock(); else releaseWakeLock();
  });
  window.addEventListener('pagehide', releaseWakeLock);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  render();
}

init();
