/* ─── State ─── */
let recipes = [];
let seedRecipes = [];
const RECIPE_VERSION = '42';
const LS = {
  recipes:   'quickrecipe.recipes.v1',
  favs:      'quickrecipe.favs.v1',
  unit:      'quickrecipe.unit.v1',
  hydration: 'quickrecipe.hydration.v1',
  ui:        'quickrecipe.ui.v1',
  theme:     'quickrecipe.theme',
  ingredientOrder: 'quickrecipe.ingredientOrder',
};
let favs           = new Set();
let unit           = 'metric';
let selectedId     = null;
let scale          = 1;
let view           = 'amounts';
let quantitiesFirst = false;
let category       = 'All';
let recipeSection = 'All';
let listScrollTop = 0;
const recipeSections = [
  { id: 'baking', label: 'Bread & baking', categories: ['Bread', 'Polish Breads', 'Loaves', 'Rolls', 'Flatbreads', 'Pastries'] },
  { id: 'desserts', label: 'Cakes & desserts', categories: ['Cake', 'Cakes', 'Cheesecake', 'Cheesecakes', 'Skyr Cake', 'Meringue', 'Brownies', 'Cookies', 'Dessert', 'Desserts'] },
  { id: 'meals', label: 'Meals', categories: ['Breakfast', 'Polish Soups', 'Soups', 'Salads', 'Mains', 'Sides'] },
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
async function loadSeedRecipes() {
  const read = async path => {
    const response = await fetch(`${path}?v=${RECIPE_VERSION}`);
    if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
    return response.json();
  };
  const index = await read('./recipes/index.json');
  if (!Array.isArray(index.files) || !index.files.length ||
      index.files.some(file => typeof file !== 'string' || !/^[a-z0-9-]+\.json$/.test(file))) {
    throw new Error('Invalid recipe index');
  }
  const groups = await Promise.all(index.files.map(file => read(`./recipes/${file}`)));
  if (groups.some(group => !Array.isArray(group))) throw new Error('Invalid recipe file');
  const loaded = groups.flat();
  if (loaded.some(r => !r || typeof r.id !== 'string' || !r.id || !r.title || !Array.isArray(r.ingredients) || !Array.isArray(r.steps)) ||
      new Set(loaded.map(r => r.id)).size !== loaded.length) throw new Error('Invalid or duplicate recipe');
  return loaded;
}

function mergeSeedRecipes(existing) {
  const byId   = new Map(seedRecipes.map(r => [r.id, r]));
  const identity = r => JSON.stringify([r.title, r.category, r.ingredients]);
  const renamed = new Map();
  const merged = (existing || []).map(r => {
    let seed = byId.get(r.id);
    if (!seed && r.title === 'Icelandic Rye Bread' && r.category === 'Bread' &&
        r.ingredients.some(i => /flour/i.test(i[0]) && ['dl', 'ml', 'L', 'cup', 'cups'].includes(i[2]))) {
      seed = byId.get('icelandic-rye-bread');
      if (seed) renamed.set(r.id, seed.id);
    }
    if (!seed) {
      const matches = seedRecipes.filter(candidate => identity(candidate) === identity(r));
      if (matches.length === 1) {
        seed = matches[0];
        renamed.set(r.id, seed.id);
      }
    }
    return seed ? cloneValue(seed) : r;
  });
  if (renamed.size) {
    favs = new Set([...favs].map(id => renamed.get(id) || id));
    for (const [oldId, newId] of renamed) {
      if (Object.hasOwn(hydrationState, oldId)) {
        hydrationState[newId] ??= hydrationState[oldId];
        delete hydrationState[oldId];
      }
    }
    const saved = load(LS.ui, {});
    if (renamed.has(saved.selectedId)) {
      saved.selectedId = renamed.get(saved.selectedId);
      localStorage.setItem(LS.ui, JSON.stringify(saved));
    }
  }
  const ids = new Set(merged.map(r => r.id));
  seedRecipes.forEach(r => { if (!ids.has(r.id)) merged.push(cloneValue(r)); });
  return [...new Map(merged.map(r => [r.id, r])).values()]
    .map(r => r.category === 'Sauce' ? { ...r, category: 'Dressings' } : r);
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

function amountText(v, u, compactMetricUnits = false) {
  v *= scale;
  if (unit === 'metric' && compactMetricUnits && v >= 1000 && (u === 'g' || u === 'ml')) {
    return `${fmt(v / 1000)} ${u === 'g' ? 'kg' : 'L'}`;
  }
  if (unit === 'metric') return `${fmt(v)} ${unitLabel(u, v)}`;
  if (u === 'g')  return `${fmt(gToOz(v))} oz`;
  if (u === 'ml') return `${fmt(mlToFloz(v))} fl oz`;
  return `${fmt(v)} ${unitLabel(u, v)}`;
}

function ingredientAmountText(r, ing) {
  if (ing[1] === null) return view === 'bakers' ? '—' : t('As needed');
  if (view === 'bakers') return bakers(r, ing);
  const amount = amountText(adjustedIngredientValue(r, ing), ing[2], r.compactMetricUnits);
  return Number.isFinite(ing[4]) ? `${amount} – ${amountText(ing[4], ing[2], r.compactMetricUnits)}` : amount;
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
  const plurals = { loaf: 'loaves', tray: 'trays', cake: 'cakes', tin: 'tins', bun: 'buns', roll: 'rolls', baguette: 'baguettes', serving: 'servings', slice: 'slices', glass: 'glasses', bowl: 'bowls', dish: 'dishes', nest: 'nests', batch: 'batches', wreath: 'wreaths', sandwich: 'sandwiches' };
  let changed = false;
  const scaled = protectedValue.replace(/(\d+(?:\.\d+)?)(?:([–-])(\d+(?:\.\d+)?))?(\s+(?:(?:large|small|chocolate|serving)\s+)?(?:loaves|loaf|trays?|cakes?|tins?|buns?|rolls?|baguettes?|servings?|slices?|glasses|glass|bowls?|dishes|dish|nests?|batches|batch|wreaths?|sandwiches|sandwich)\b)?/g,
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

  // ── Cheesecakes ──
  'wild-blueberry-glazed-cheesecake':          [[0, 'Base'], [3, 'Filling'], [8, 'Jelly topping']],
  'vanilla-dream-with-warm-berry-sauce': [[0, 'Base'], [3, 'Filling'], [8, 'Berry sauce']],
  'berry-explosion-cheesecake':                 [[0, 'Base'], [4, 'Filling'], [11, 'Topping']],
  'oreo-cream-cheese-swirl-brownies':     [[0, 'Brownie batter'], [8, 'Cheesecake swirl'], [11, 'Topping']],
  'triple-layer-oreo-cloud-cups':   [[0, 'Base'], [4, 'Filling'], [8, 'Topping']],
  'toblerone-raspberry-swirl-cheesecake':         [[0, 'Base'], [2, 'Cheesecake filling'], [10, 'Raspberry swirl']],
  'white-chocolate-daim-crunch-cheesecake':              [[0, 'Base'], [2, 'White chocolate Daim filling']],
  'lotus-biscoff-velvet-cheesecake':           [[0, 'Base'], [2, 'Biscoff filling'], [7, 'Topping']],
  'strawberry-dark-chocolate-cheesecake':       [[0, 'Base'], [2, 'Strawberry filling'], [10, 'Topping']],
  'lemon-curd-cheesecake-cups':        [[0, 'Base'], [2, 'Cheesecake filling'], [7, 'Topping']],
  'espresso-martini-cheesecake-glasses':  [[0, 'Base'], [2, 'Espresso cheesecake'], [9, 'Garnish']],
  'caramel-pecan-coffee-cheesecake':        [[0, 'Caramel pecans'], [3, 'Base'], [5, 'Filling']],
  'torched-meringue-dark-chocolate-cheesecake':         [[0, 'Base'], [2, 'Filling'], [10, 'Meringue']],
  'white-chocolate-orange-cheesecake':         [[0, 'Base'], [2, 'Orange & white chocolate filling']],
  'celebration-white-chocolate-daim-cheesecake':          [[0, 'Base'], [2, 'White chocolate Daim filling']],
  'brownie-black-cherry-meringue-bomb':              [[0, 'Brownie base'], [6, 'Cheesecake'], [14, 'Meringue']],
  'caramel-rolo-cheesecake':              [[0, 'Base'], [2, 'Caramel filling']],
  'dumle-caramel-cheesecake-glasses':        [[0, 'Base'], [2, 'Cheesecake filling'], [6, 'Dumle caramel & garnish']],
  'cinnamon-brown-sugar-caramel-cheesecake-cups':[[0, 'Base'], [1, 'Cheesecake filling'], [5, 'Caramel topping']],
  'white-chocolate-fresh-raspberry-cheesecake':[[0, 'Base'], [2, 'White chocolate & raspberry filling'], [11, 'Topping']],
  'polish-baked-curd-cheesecake':                     [[0, 'Pastry'], [9, 'Filling']],
  'dark-caramel-ganache-cheesecake-cups':             [[0, 'Base'], [2, 'Cheesecake filling'], [6, 'Chocolate ganache']],
  'strawberry-cheesecake-in-chocolate-bowls': [[0, 'Chocolate bowls'], [2, 'Base'], [4, 'Strawberry cheesecake filling'], [9, 'Garnish']],

  // ── Skyr Cakes ──
  'raspberry-skyr-mousse-in-chocolate-bowls': [[0, 'Chocolate bowls'], [2, 'Base'], [4, 'Vanilla skyr mousse'], [7, 'Raspberry topping']],
  'strawberry-skyr-cocktail-cups':     [[0, 'Base'], [2, 'Cream cheese filling'], [6, 'Strawberry glaze'], [10, 'Garnish']],
  'mini-blueberry-skyr-cups':          [[0, 'Base'], [2, 'Skyr mousse'], [4, 'Blueberry sauce']],
  'vanilla-skyr-with-chocolate-granola-raspberries':           [[0, 'Base'], [1, 'Vanilla skyr mousse'], [3, 'Topping']],
  'berry-skyr-sheet-cake':                   [[0, 'Base'], [2, 'Skyr mousse'], [4, 'Topping']],
  'chocolate-skyr-mousse-cups':              [[0, 'Chocolate skyr mousse'], [2, 'Whipped cream topping'], [3, 'Garnish']],
  'strawberry-skyr-in-a-chocolate-rice-krispie-shell':            [[0, 'Rice Krispie shell'], [4, 'Strawberry skyr mousse'], [6, 'Garnish']],
  'icelandic-flag-skyr-dessert':               [[0, 'Base'], [1, 'Skyr mousse'], [3, 'Flag decoration']],
  'lemon-almond-skyr-cake':         [[0, 'Base'], [2, 'Lemon skyr filling'], [9, 'Garnish']],
  'summer-berry-skyr-cake':                [[0, 'Base'], [2, 'Berry skyr filling'], [8, 'Garnish']],
  'berry-bliss-skyr-cake':                    [[0, 'Base'], [2, 'Skyr mousse'], [4, 'Topping']],
  'berry-skyr-cups-with-chocolate-pebbles':              [[0, 'Base'], [3, 'Skyr mousse'], [5, 'Topping']],
  'vanilla-skyr-with-salted-liquorice-caramel':         [[0, 'Base'], [2, 'Vanilla skyr mousse']]
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

  // ── Cheesecakes ──
  'wild-blueberry-glazed-cheesecake':          [[0, 'Base'], [1, 'Filling'], [3, 'Jelly topping']],
  'vanilla-dream-with-warm-berry-sauce': [[0, 'Base'], [1, 'Filling'], [3, 'Berry sauce']],
  'berry-explosion-cheesecake':                 [[0, 'Base'], [1, 'Filling'], [3, 'Topping']],
  'oreo-cream-cheese-swirl-brownies':     [[0, 'Brownie batter'], [1, 'Cheesecake swirl'], [2, 'Brownie batter'], [3, 'Assembly & bake']],
  'triple-layer-oreo-cloud-cups':   [[0, 'Base'], [1, 'Filling'], [3, 'Topping']],
  'toblerone-raspberry-swirl-cheesecake':         [[0, 'Base'], [1, 'Cheesecake filling'], [3, 'Raspberry swirl']],
  'white-chocolate-daim-crunch-cheesecake':              [[0, 'Base'], [1, 'White chocolate Daim filling']],
  'lotus-biscoff-velvet-cheesecake':           [[0, 'Base'], [1, 'Biscoff filling'], [3, 'Topping']],
  'strawberry-dark-chocolate-cheesecake':       [[0, 'Base'], [1, 'Strawberry filling'], [3, 'Topping']],
  'lemon-curd-cheesecake-cups':        [[0, 'Base'], [1, 'Cheesecake filling'], [2, 'Assembly & topping']],
  'espresso-martini-cheesecake-glasses':  [[0, 'Base'], [1, 'Espresso cheesecake'], [2, 'Assembly & garnish']],
  'caramel-pecan-coffee-cheesecake':        [[0, 'Caramel pecans'], [1, 'Base'], [2, 'Filling']],
  'torched-meringue-dark-chocolate-cheesecake':         [[0, 'Base'], [1, 'Filling'], [2, 'Meringue']],
  'white-chocolate-orange-cheesecake':         [[0, 'Base'], [1, 'Orange & white chocolate filling']],
  'celebration-white-chocolate-daim-cheesecake':          [[0, 'Base'], [1, 'White chocolate Daim filling']],
  'brownie-black-cherry-meringue-bomb':              [[0, 'Brownie base'], [1, 'Cheesecake'], [2, 'Meringue']],
  'caramel-rolo-cheesecake':              [[0, 'Base'], [1, 'Caramel filling']],
  'dumle-caramel-cheesecake-glasses':        [[0, 'Base'], [1, 'Cheesecake filling'], [2, 'Dumle caramel & garnish']],
  'cinnamon-brown-sugar-caramel-cheesecake-cups':[[0, 'Base'], [1, 'Cheesecake filling'], [2, 'Caramel topping']],
  'white-chocolate-fresh-raspberry-cheesecake':[[0, 'Base'], [1, 'White chocolate & raspberry filling'], [2, 'Assembly & topping']],
  'polish-baked-curd-cheesecake':                     [[0, 'Pastry'], [1, 'Filling']],
  'dark-caramel-ganache-cheesecake-cups':             [[0, 'Base'], [1, 'Cheesecake filling'], [2, 'Chocolate ganache']],
  'strawberry-cheesecake-in-chocolate-bowls': [[0, 'Chocolate bowls'], [1, 'Strawberry cheesecake filling'], [2, 'Base'], [3, 'Garnish']],

  // ── Skyr Cakes ──
  'raspberry-skyr-mousse-in-chocolate-bowls': [[0, 'Chocolate bowls'], [1, 'Vanilla skyr mousse'], [2, 'Base'], [3, 'Raspberry topping']],
  'strawberry-skyr-cocktail-cups':     [[0, 'Strawberry glaze'], [1, 'Cream cheese filling'], [2, 'Assembly & garnish']],
  'mini-blueberry-skyr-cups':          [[0, 'Base'], [1, 'Blueberry sauce'], [2, 'Skyr mousse']],
  'vanilla-skyr-with-chocolate-granola-raspberries':           [[0, 'Base'], [1, 'Vanilla skyr mousse'], [2, 'Assembly & topping']],
  'berry-skyr-sheet-cake':                   [[0, 'Base'], [1, 'Skyr mousse'], [2, 'Topping']],
  'chocolate-skyr-mousse-cups':              [[0, 'Chocolate skyr mousse'], [1, 'Muesli layer'], [2, 'Whipped cream topping']],
  'strawberry-skyr-in-a-chocolate-rice-krispie-shell':            [[0, 'Rice Krispie shell'], [1, 'Strawberry skyr mousse'], [2, 'Garnish']],
  'icelandic-flag-skyr-dessert':               [[0, 'Base'], [1, 'Skyr mousse'], [2, 'Flag decoration']],
  'lemon-almond-skyr-cake':         [[0, 'Base'], [1, 'Lemon skyr filling'], [3, 'Garnish & chill']],
  'summer-berry-skyr-cake':                [[0, 'Base'], [1, 'Berry skyr filling'], [3, 'Garnish & chill']],
  'berry-bliss-skyr-cake':                    [[0, 'Base'], [1, 'Skyr mousse'], [2, 'Topping']],
  'berry-skyr-cups-with-chocolate-pebbles':              [[0, 'Base'], [1, 'Skyr mousse'], [2, 'Topping']],
  'vanilla-skyr-with-salted-liquorice-caramel':         [[0, 'Base'], [1, 'Vanilla skyr mousse'], [2, 'Topping']]
};

function sectionFor(r, idx, name) {
  const plan = r.ingredientSections || sectionPlans[r.id];
  if (!plan) return '';   /* no plan → no sections, no Focus mode for this recipe */
  let sec = '';
  for (const [start, label] of plan) { if (idx >= start) sec = label; else break; }
  return sec;
}

function stepSectionFor(r, stepIdx) {
  const plan = r.stepSections || stepSectionPlans[r.id];
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
    nav.innerHTML = sections.map(section => `<button class="section-link" data-browse="${section.id}">${esc(t(section.label))} <span class="section-count"></span></button>`).join('');
    nav.querySelectorAll('[data-browse]').forEach(b => b.onclick = () => browseSection(b.dataset.browse));
    document.getElementById('sectionSelect').innerHTML = sections.map(section => `<option value="${section.id}">${esc(t(section.label))}</option>`).join('');
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
function recipeTimingHtml(r) {
  const timings = [['Prep', r.prep], ['Cook', r.cook], ['Bake', r.bake], ['Rest', r.ferment]]
    .filter(([, value]) => value && String(value).trim());
  return timings.length
    ? timings.map(([label, value]) => `<span class="stat timing-stat">${label} ${esc(recipeText(value))}</span>`).join('')
    : '<span class="stat timing-stat">Time not specified</span>';
}

function matches(r, q) {
  const normal = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  q = normal(q);
  const text = [r.title, r.desc, r.category, t(r.category || ''), ...r.ingredients.map(i => i[0])];
  return !q || text.some(value => [value, recipeTranslations.pl[value], recipeTranslations.is[value]].some(candidate => normal(candidate).includes(q)));
}
function filteredRecipes() {
  const q = document.getElementById('search').value.trim();
  return recipes.filter(r =>
    (q || ((recipeSection === 'All' || sectionForRecipe(r) === recipeSection) && (category === 'All' || (r.category || 'Other') === category))) &&
    (!onlyFavs || favs.has(r.id)) && matches(r, q)
  );
}
function renderList() {
  const q = document.getElementById('search').value.trim();
  const shown = filteredRecipes();
  hasRecipeTranslationFallback = shown.some(missingRecipeTranslation);
  if (!shown.some(r => r.id === selectedId)) {
    selectedId = shown[0]?.id || null;
    scale = 1; view = 'amounts'; focusedSection = null;
  }

  const scope = q ? `${({en:'Search',pl:'Szukaj',is:'Leit'})[language]} ${t(onlyFavs ? 'Favourites' : 'All recipes')}: “${q}”` : onlyFavs ? t('Favourites') :
    [recipeSections.find(section => section.id === recipeSection)?.label || 'All recipes', category === 'All' ? '' : category].filter(Boolean).map(t).join(' / ');
  document.getElementById('resultSummary').textContent = `${scope} · ${recipeCount(shown.length)}`;
  const list = document.getElementById('list');
  const previousScroll = list.scrollTop;
  list.innerHTML = shown.map(r => `
    <button class="card ${r.id === selectedId ? 'active' : ''}" data-id="${r.id}" aria-current="${r.id === selectedId ? 'true' : 'false'}">
      <div class="card-top">
        <div>
          <div class="tag">${esc(r.category || 'Recipe')}</div>
          <h3>${esc(recipeText(r.title))}</h3>
        </div>
        <span class="heart ${favs.has(r.id) ? 'on' : ''}" data-fav="${r.id}">${favs.has(r.id) ? '♥' : '♡'}</span>
      </div>
      <div class="desc">${esc(recipeText(r.desc || ''))}</div>
      <div class="stats">
        ${r.hydration ? `<span class="stat">${fmt(r.hydration)}% hydration</span>` : ''}
        ${recipeTimingHtml(r)}
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
let recipeHistory = [];
function syncNavigation() {
  const open = document.querySelector('.app').classList.contains('reading-recipe');
  document.getElementById('list').inert = compactLayout.matches && open;
  document.getElementById('detail').inert = compactLayout.matches && !open;
}
function openDetailPanel() {
  recipeHistory = [];
  listScrollTop = document.getElementById('list').scrollTop;
  document.querySelector('.app').classList.add('reading-recipe');
  syncNavigation();
  document.getElementById('detail').scrollTop = 0;
  if (compactLayout.matches) document.getElementById('backBtn').focus();
}
function closeDetailPanel() {
  recipeHistory = [];
  document.querySelector('.app').classList.remove('reading-recipe');
  syncNavigation();
  document.getElementById('list').scrollTop = listScrollTop;
  document.querySelector('.card.active')?.focus({ preventScroll: true });
}
compactLayout.addEventListener('change', syncNavigation);

function openNextRecipe() {
  const shown = filteredRecipes();
  const index = shown.findIndex(r => r.id === selectedId);
  if (index < 0 || index === shown.length - 1) {
    toast('You’re at the last recipe');
    return;
  }
  recipeHistory.push({ selectedId, scale, view, focusedSection, scrollTop: document.getElementById('detail').scrollTop });
  selectedId = shown[index + 1].id;
  scale = 1;
  view = 'amounts';
  focusedSection = null;
  render();
  // Keep the original list position for Back; only reset the recipe scroll.
  document.getElementById('detail').scrollTop = 0;
}

function openPreviousRecipe() {
  const available = new Set(filteredRecipes().map(r => r.id));
  let previous;
  while (recipeHistory.length) {
    const entry = recipeHistory.pop();
    if (available.has(entry.selectedId)) { previous = entry; break; }
  }
  if (!previous) { closeDetailPanel(); return; }
  ({ selectedId, scale, view, focusedSection } = previous);
  render();
  document.getElementById('detail').scrollTop = previous.scrollTop;
}

function initRecipeGestures() {
  const detail = document.getElementById('detail');
  let swipe = null;
  const isReading = () => compactLayout.matches && document.querySelector('.app').classList.contains('reading-recipe');
  detail.addEventListener('touchstart', e => {
    swipe = null;
    if (!isReading() || e.touches.length !== 1 ||
        e.target.closest('button, input, label, select, textarea, a, [contenteditable]') ||
        window.getSelection()?.toString()) return;
    const touch = e.touches[0];
    swipe = { id: touch.identifier, x: touch.clientX, y: touch.clientY, started: performance.now(), horizontal: false };
  }, { passive: true });
  detail.addEventListener('touchmove', e => {
    if (!swipe) return;
    if (!isReading() || e.touches.length !== 1) { swipe = null; return; }
    const touch = e.touches[0];
    const dx = touch.clientX - swipe.x;
    const dy = Math.abs(touch.clientY - swipe.y);
    if (!swipe.horizontal) {
      if (Math.max(Math.abs(dx), dy) < 12) return;
      // Once a gesture starts scrolling, never turn it into navigation.
      if (Math.abs(dx) < dy * 2) { swipe = null; return; }
      swipe.horizontal = true;
    }
    if (e.cancelable) e.preventDefault();
    else swipe = null;
  }, { passive: false });
  detail.addEventListener('touchend', e => {
    const gesture = swipe;
    swipe = null;
    if (!gesture?.horizontal || !isReading() || e.touches.length ||
        performance.now() - gesture.started > 1000) return;
    const touch = [...e.changedTouches].find(t => t.identifier === gesture.id);
    if (!touch) return;
    const dx = touch.clientX - gesture.x;
    const dy = Math.abs(touch.clientY - gesture.y);
    if (dx >= 80 && dx > dy * 2) openPreviousRecipe();
    else if (dx <= -80 && -dx > dy * 2) openNextRecipe();
  }, { passive: true });
  detail.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });
}

/* ─── Render ingredients with Focus support ─── */
function renderIngredients(r) {
  const hasSections = Boolean(r.ingredientSections || sectionPlans[r.id]);
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
      >${esc(recipeText(sec))}</button>`;
    }
    last = sec || last;
    const name = `<span class="ingredient-name">${esc(recipeText(cleanIngredientName(i[0])))}</span>`;
    const amount = `<span class="amount">${esc(ingredientAmountText(r, i))}</span>`;
    html += `<div class="ingredient${quantitiesFirst ? ' quantities-first' : ''}${ingDimmed ? ' dimmed' : ''}" data-section="${esc(sec)}">
      ${quantitiesFirst ? amount + name : name + amount}
    </div>`;
    return html;
  }).join('');
}

/* ─── Detail panel ─── */
function renderDetail() {
  const r  = recipes.find(x => x.id === selectedId);
  const el = document.getElementById('detail');
  if (document.querySelector('.app').classList.contains('reading-recipe')) hasRecipeTranslationFallback = missingRecipeTranslation(r);

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
  const hasSecs   = Boolean(r.ingredientSections || sectionPlans[r.id]);

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
    return `<li class="${dimmed ? 'dimmed' : ''}" data-section="${esc(stepSec || '')}">${esc(recipeText(s))}</li>`;
  }).join('');

  el.innerHTML = `
    <div class="detail-head">
      <div class="detail-title-row">
        <div>
          <div class="tag">${esc(r.category || 'Recipe')}${r.hydration ? ` · ${fmt(hyd)}% hydration` : ''}</div>
          <h1>${esc(recipeText(r.title))}</h1>
          <div class="desc">${esc(recipeText(r.desc || ''))}</div>
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
      <section class="pane${quantitiesFirst ? ' quantities-first' : ''}">
        <div class="ingredients-heading">
          <h2>Ingredients</h2>
          <button type="button" id="ingredientOrderBtn" class="ingredient-order" aria-label="Show quantities first" title="${quantitiesFirst ? 'Show ingredients first' : 'Show quantities first'}" aria-pressed="${quantitiesFirst}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10a8 8 0 0 1 13-5l3 3M20 3v5h-5M20 14a8 8 0 0 1-13 5l-3-3M4 21v-5h5"/></svg>
          </button>
        </div>
        ${hasSecs ? `<div class="focus-hint">Tap a section to focus it</div>` : ''}
        ${renderIngredients(r)}
      </section>
      <section class="pane">
        <h2>Method${focusedSection ? ` · <span style="color:var(--accent)">${esc(recipeText(focusedSection))}</span>` : ''}</h2>
        <ol class="steps">${stepsHtml}</ol>
      </section>
    </div>

    <div class="meta">
      ${recipeTimingHtml(r)}
      ${r.tempC  ? `<span class="stat">${temp}</span>`               : ''}
      ${r.yield  ? `<span class="stat" id="recipeYield">${esc(translatedYield(r.yield))}</span>` : ''}
    </div>`;

  shopping.decorate(r);
  document.getElementById('ingredientOrderBtn').onclick = () => {
    quantitiesFirst = !quantitiesFirst;
    localStorage.setItem(LS.ingredientOrder, quantitiesFirst ? 'quantity' : 'ingredient');
    renderDetail();
    document.getElementById('ingredientOrderBtn').focus();
  };

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
      ? `Method · <span style="color:var(--accent)">${esc(recipeText(focusedSection))}</span>`
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
  document.getElementById('fSection').innerHTML = recipeSections.map(section => `<option value="${section.id}">${esc(t(section.label))}</option>`).join('');
  set('fSection', r ? sectionForRecipe(r) : recipeSection === 'All' ? 'baking' : recipeSection);
  set('fDesc',        r?.desc);
  set('fYield',       r?.yield);
  set('fTemp',        r?.tempC);
  set('fPrep',        r?.prep);
  set('fFerment',     r?.ferment);
  set('fBake',        r?.bake);
  set('fCook',        r?.cook);
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
    cook:      document.getElementById('fCook').value.trim(),
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
  let seedLoadFailed = false;
  try {
    seedRecipes = await loadSeedRecipes();
  } catch (e) {
    console.warn('Could not load the recipe collection', e);
    seedRecipes = [];
    seedLoadFailed = true;
  }

  await loadRecipeTranslations(RECIPE_VERSION);

  /* Restore state */
  favs           = new Set(load(LS.favs, []));
  unit           = localStorage.getItem(LS.unit) || 'metric';
  quantitiesFirst = localStorage.getItem(LS.ingredientOrder) === 'quantity';
  hydrationState = load(LS.hydration, {});
  const storedRecipes = load(LS.recipes, seedRecipes);
  // A missing category file must never remove recipes from the saved collection.
  recipes        = seedLoadFailed ? storedRecipes : mergeSeedRecipes(storedRecipes);
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
  initRecipeGestures();
  document.getElementById('shoppingListsBtn').onclick = shopping.all;
  document.getElementById('modalBackdrop').onclick  = e => { if (e.target.id === 'modalBackdrop') closeModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock(); else releaseWakeLock();
  });
  window.addEventListener('pagehide', releaseWakeLock);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  render();
  if (seedLoadFailed) {
    if (recipes.length) toast('Could not refresh recipes. Showing your saved collection.');
    else document.getElementById('list').innerHTML = '<div class="empty">Recipes could not be loaded. Check your connection and reload.</div>';
  }
}

init();
