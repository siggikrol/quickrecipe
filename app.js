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
  localStorage.setItem(LS.ui,        JSON.stringify({ selectedId, category, onlyFavs }));
}

/* ─── Seed merge ─── */
function mergeSeedRecipes(existing) {
  const byId   = new Map(seedRecipes.map(r => [r.id, r]));
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
  if (saved.selectedId && recipes.some(r => r.id === saved.selectedId)) selectedId = saved.selectedId;
  category = saved.category  || 'All';
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
  'gotteri-vanillu-skyrkaka-lakkris':         [[0, 'Base'], [2, 'Vanilla skyr mousse']],


  // ── Gotteri Scraped Cakes ──
  'gotteri-rosakaka': [[0,"Cake"],[10,"Chocolate frosting"],[15,"Vanilla frosting"]],
  'gotteri-sukkuladiterta': [[0,"Cake"],[11,"Frosting"]],
  'gotteri-paskabomba': [[0,"Cake"],[3,"Frosting"],[7,"Frosting"],[13,"Chocolate ganache"],[16,"Decoration"]],
  'gotteri-haustkaka': [[0,"Cake"],[14,"Frosting"],[19,"Decoration"],[20,"Decoration"]],
  'gotteri-regnbogakaka': [[0,"Cake"],[5,"Frosting"]],
  'gotteri-regnbogakaka-2': [[0,"Cake"],[1,"Chocolate frosting"],[7,"Vanilla frosting"]],
  'gotteri-saltkaramelludraumur': [[0,"Cake"],[11,"Caramel sauce"],[17,"Caramel frosting"],[22,"Frosting"],[27,"Decoration"]],
  'gotteri-aramotakakan': [[0,"Cake"],[1,"Frosting"]],
  'gotteri-sukkuladikaka-med-dumlekremi': [[0,"Caramel frosting"],[6,"Frosting"]],
  'gotteri-thjodhatidarkakan-2': [[0,"Cake"],[2,"Cake"],[12,"Cake"]],
  'gotteri-kryddkaka-i-jolabuningi': [[0,"Cake"],[6,"Frosting"],[13,"Decoration"]],
  'gotteri-piparkokukaka': [[0,"Cake"],[16,"Frosting"],[21,"Decoration"]],
  'gotteri-gamaldags-sukkuladiterta': [[0,"Cake"],[11,"Frosting"],[18,"Filling"],[20,"Decoration"]],
  'gotteri-sukkuladiterta-med-mokkakremi': [[0,"Cake"],[11,"Frosting"],[15,"Cake"],[18,"Decoration"]],
  'gotteri-vanillukaka-med-kokosblae': [[0,"Cake"],[6,"Vanilla frosting"],[11,"Decoration"]],
  'gotteri-vanillukaka-med-saltkaramellu': [[0,"Cake"],[5,"Caramel sauce"],[9,"Vanilla frosting"],[13,"Decoration"]],
  'gotteri-oreoterta-meistarans': [[0,"Cake"],[10,"Frosting"],[16,"Cake"],[18,"Decoration"]],
  'gotteri-sukkuladiterta-med-rjomaostakremi': [[0,"Cake"],[10,"Frosting"]],
  'gotteri-sour-patch-kids-regnbogakaka': [[0,"Cake"],[9,"Frosting"]],
  'gotteri-kisukaka': [[0,"Cake"],[10,"Frosting"],[16,"Frosting"],[20,"Decoration"]],
  'gotteri-kanilkaka-med-piparkokum': [[0,"Cake"],[13,"Frosting"]],
  'gotteri-regnbogasprengja': [[0,"Cake"],[19,"Chocolate frosting"],[29,"Vanilla frosting"]],
  'gotteri-einfold-gulrotarkaka': [[0,"Cake"],[9,"Cream cheese frosting"]],
  'gotteri-gulrotarkaka-i-jolabuningi': [[0,"Cake"],[7,"Cream cheese frosting"],[10,"Decoration"]],
  'gotteri-sukkuladikaka-i-paskafotum': [[0,"Cake"],[12,"Chocolate frosting"],[18,"Decoration"]],
  'gotteri-gulrotarkaka-uppskrift': [[0,"Cake"],[13,"Frosting"]],
  'gotteri-blomamarengs': [[0,"Cake"],[8,"Meringue"]],
  'gotteri-paskatertan-2018': [[0,"Meringue"],[7,"Filling"]],
  'gotteri-saelgaetisterta': [[0,"Cake"],[5,"Meringue"],[7,"Filling"],[11,"Decoration"],[13,"Decoration"],[18,"Meringue"]],
  'gotteri-daim-bomba': [[0,"Cake"],[9,"Meringue"],[11,"Cake"],[13,"Decoration"],[17,"Meringue"]],
  'gotteri-marengsbomba-i-morgum-logum': [[0,"Meringue"],[7,"Cake"],[13,"Decoration"]],
  'gotteri-marengshringur-med-jardaberjarjoma-og-marssosu': [[0,"Meringue"],[5,"Caramel sauce"],[7,"Filling"]],
  'gotteri-pudusykurs-pavloa': [[0,"Meringue"],[4,"Caramel sauce"]],
  'gotteri-mini-pavlour-med-lakkriskeim': [[0,"Cake"],[5,"Decoration"],[9,"Caramel sauce"]],
  'gotteri-marsipan-og-marengs': [[0,"Cake"],[5,"Meringue"],[7,"Caramel sauce"],[9,"Cake"],[11,"Decoration"]],
  'gotteri-piparmyntumarengs-med-karamellu-og-berjum': [[0,"Meringue"],[4,"Caramel sauce"],[6,"Filling"],[11,"Meringue"]],
  'gotteri-einfold-marengsbomba': [[0,"Meringue"],[2,"Filling"],[6,"Meringue"]],
  'gotteri-karamelludraumur': [[0,"Meringue"],[2,"Filling"],[4,"Decoration"],[9,"Meringue"]],
  'gotteri-passion-fruit-pavlova': [[0,"Meringue"],[4,"Filling"]],
  'gotteri-pavlova-med-filakaramellusosu': [[0,"Meringue"],[6,"Caramel sauce"],[8,"Filling"],[12,"Decoration"]],
  'gotteri-kaffimarengs': [[0,"Meringue"],[4,"Frosting"],[9,"Filling"],[17,"Meringue"]],
  'gotteri-marengsterta': [[0,"Meringue"],[2,"Caramel sauce"],[4,"Frosting"],[8,"Decoration"],[13,"Meringue"]],
  'gotteri-mokkamarengs': [[0,"Meringue"],[2,"Caramel sauce"],[4,"Filling"]],
  'gotteri-marengskrans': [[0,"Meringue"],[11,"Caramel sauce"],[14,"Filling"]],
  'gotteri-hnallthora-aramotanna': [[0,"Cake"],[10,"Meringue"],[12,"Caramel sauce"],[14,"Filling"]],
  'gotteri-blaberja-pavlovur-med-filakaramellukremi': [[0,"Cake"],[3,"Caramel sauce"],[5,"Filling"]],
  'gotteri-snickersterta': [[0,"Meringue"],[2,"Filling"],[5,"Chocolate frosting"]],
  'gotteri-hatidarmarengs': [[0,"Meringue"],[3,"Caramel sauce"],[7,"Filling"],[13,"Decoration"],[15,"Meringue"]],
  'gotteri-heslihnetumarengs': [[0,"Meringue"],[6,"Filling"]],
  'gotteri-pavlovur-med-mascarpone-rjomafyllingu': [[0,"Meringue"],[2,"Filling"]],
  'gotteri-noakropps-bomba': [[0,"Cake"],[4,"Meringue"],[7,"Caramel sauce"],[9,"Filling"]],
  'gotteri-rice-krispies-marengsterta-med-noakroppi': [[0,"Meringue"],[4,"Filling"]],
  'gotteri-kransakaka': [[0,"Cake"],[3,"Cake"]],
  'gotteri-kransakokustafur': [[0,"Cake"],[3,"Cake"]],
  'gotteri-kransastjarna': [[0,"Cake"],[3,"Decoration"]],
  'gotteri-kransakokugotteri': [[0,"Cake"],[3,"Cake"],[6,"Decoration"]],
  'gotteri-karamellu-og-sukkuladi-brownie': [[0,"Cake"],[11,"Cake"]],
  'gotteri-center-sukkuladi-og-karamellubrownies-med-sukkuladirjoma': [[0,"Cake"],[10,"Cake"]],
  'gotteri-piparmyntu-brownies': [[0,"Cake"],[7,"Frosting"],[12,"Chocolate frosting"]],
  'gotteri-rolo-brownies': [[0,"Cake"],[7,"Cake"]],
  'gotteri-piparmyntubrunkur': [[0,"Cake"],[9,"Frosting"]],
  'gotteri-brownie-stafur': [[0,"Cake"],[8,"Cream cheese frosting"]],
  'gotteri-paskakokukanina': [[0,"Cake"],[8,"Frosting"],[14,"Decoration"],[18,"Cake"]],
  'gotteri-jolabrownie': [[0,"Cake"],[5,"Frosting"]],
  'gotteri-filakaramellubrownies': [[0,"Cake"],[9,"Caramel frosting"]],
  'gotteri-thristabrunkur': [[0,"Cake"],[6,"Cake"]],
  'gotteri-brownie-med-serrirjoma': [[0,"Cake"],[9,"Cake"]],
  'gotteri-pekanhnetudraumur-2': [[0,"Cake"],[7,"Cake"]],
  'gotteri-brownie-med-mascarpone-sukkuladikremi': [[0,"Cake"],[9,"Chocolate frosting"]],
  'gotteri-brownies-med-lakkriskeim': [[0,"Cake"],[8,"Frosting"]],
  'gotteri-fronsk-sukkuladikaka': [[0,"Cake"],[7,"Frosting"]],
  'gotteri-einfold-sukkuladikaka': [[0,"Cake"],[7,"Frosting"]],
  'gotteri-heit-sukkuladikaka': [[0,"Cake"],[5,"Cake"]],
  'gotteri-mokkabitar': [[0,"Cake"],[8,"Frosting"]],
  'gotteri-lukkukaka': [[0,"Cake"],[7,"Frosting"]],
  'gotteri-skuffukaka-med-sukkuladibrad': [[0,"Cake"],[6,"Cake"]],
  'gotteri-betty-bjargar-paskunum': [[0,"Cake"],[2,"Chocolate frosting"],[8,"Decoration"]],
  'gotteri-luxus-lindor-sukkuladiterta': [[0,"Cake"],[19,"Chocolate frosting"],[26,"Decoration"]],
  'gotteri-sukkuladihringur-med-appelsinukeim': [[0,"Cake"],[9,"Chocolate frosting"]],
  'gotteri-sukkuladikaka-med-englakremi': [[0,"Cake"],[9,"Frosting"]],
  'gotteri-djoflaterta-med-lakkriskeim': [[0,"Cake"],[10,"Frosting"],[16,"Cake"],[19,"Decoration"]],
  'gotteri-sukkuladisaela': [[0,"Cake"],[9,"Chocolate frosting"]],
  'gotteri-utileguskuffa': [[0,"Cake"],[12,"Frosting"]],
  'gotteri-einfold-skuffukaka': [[0,"Cake"],[12,"Frosting"],[23,"Decoration"]],
  'gotteri-batman-oreokaka': [[0,"Cake"],[13,"Frosting"],[20,"Decoration"]],
  'gotteri-slongukaka': [[0,"Cake"],[12,"Frosting"],[19,"Decoration"]],
  'gotteri-sukkuladikaka-med-sukkuladikremi': [[0,"Cake"],[11,"Chocolate frosting"],[18,"Decoration"]],
  'gotteri-afmaeliskaka': [[0,"Cake"],[10,"Chocolate frosting"],[16,"Decoration"]],
  'gotteri-skuffukaka-andreu': [[0,"Cake"],[11,"Chocolate frosting"]],
  'gotteri-sukkuladikaka-med-noakroppshjup': [[0,"Cake"],[12,"Frosting"]],
  'gotteri-fermingarterta': [[0,"Cake"],[10,"Cake"],[16,"Cake"],[21,"Decoration"]],
  'gotteri-margra-laga-sukkuladi-og-jardaberjaterta': [[0,"Cake"],[10,"Cake"],[16,"Cake"],[21,"Cake"],[23,"Cake"]],
  'gotteri-naked-cake-med-sukkuladi-karamellu-og-vanillu-ivafi': [[0,"Cake"],[4,"Caramel frosting"],[8,"Cake"],[12,"Frosting"]],
  'gotteri-gomsaet-sukkuladiterta': [[0,"Cake"],[12,"Chocolate frosting"],[18,"Frosting"],[24,"Decoration"]],
  'gotteri-jardaberjaterta-og-graenmetismarkadur': [[0,"Cake"],[5,"Cake"],[7,"Cake"],[11,"Cake"]],
  'gotteri-aramotatertan-2018': [[0,"Cake"],[9,"Cake"],[14,"Cake"],[20,"Decoration"]],
  'gotteri-skautaterta': [[0,"Cake"],[11,"Cake"],[15,"Frosting"]],
  'gotteri-gulrotarkaka-med-rjomaostakremi': [[0,"Cake"],[13,"Cream cheese frosting"]],
  'gotteri-ponnukokukaka-uppskrift': [[0,"Cake"],[9,"Filling"]],
  'gotteri-bananakaka-med-glassur': [[0,"Cake"],[11,"Cake"]],
  'gotteri-sukkuladi-bananakaka-med-karamellubrad': [[0,"Cake"],[10,"Cake"]],
  'gotteri-eplakaka-med-kryddkeim-og-karamellu': [[0,"Cake"],[11,"Caramel sauce"]],
  'gotteri-kanilkaka-med-eplum-og-mondlum': [[0,"Cake"],[12,"Cake"]],
  'gotteri-epladraumur': [[0,"Cake"],[9,"Caramel sauce"]],
  'gotteri-sukkuladi-bananakaka-med-karamellukremi': [[0,"Cake"],[10,"Caramel frosting"]],
  'gotteri-mondlukaka-med-rabbabaramauki': [[0,"Cake"],[11,"Cake"]],
  'gotteri-eplakrons': [[0,"Filling"],[4,"Cake"]],
  'gotteri-banoffee-baka': [[0,"Cake"],[16,"Cake"]],
  'gotteri-jolahringur-med-karamellubrad': [[0,"Cake"],[5,"Cake"]],
  'gotteri-hefdbundin-kitkat-kaka': [[0,"Cake"],[10,"Frosting"],[17,"Decoration"]],
  'gotteri-maltesers-kaka': [[0,"Cake"],[12,"Frosting"]],
  'gotteri-starbucks-sitronukaka': [[0,"Cake"],[12,"Cake"]],
  'gotteri-paskatertan-2017': [[0,"Cake"],[9,"Cake"],[11,"Filling"],[14,"Cake"]],
  'gotteri-snickers-kaka-simstodvarinnar': [[0,"Cake"],[7,"Caramel sauce"],[11,"Cake"]],
  'gotteri-gulrotarkaka-med-pekanhnetum': [[0,"Cake"],[5,"Meringue"]],
  'gotteri-vatnsdeigsbollukaka-med-hindberjafyllingu-og-lakkris': [[0,"Cake"],[6,"Filling"],[11,"Decoration"]],
  'gotteri-tiramisu-kaka': [[0,"Cake"],[5,"Cake"]],
  'gotteri-jordbaertaerte': [[0,"Cake"],[5,"Filling"],[11,"Decoration"]],
  'gotteri-peruterta': [[0,"Cake"],[4,"Chocolate frosting"]],
  'gotteri-rjomaterta-med-kokteilavoxtum': [[0,"Cake"],[5,"Filling"],[9,"Decoration"]],
  'gotteri-kanilkaka-med-glassur': [[0,"Cake"],[10,"Cake"]],
};

/* ─── Section plans for steps (Focus mode) ─── */
const stepSectionPlans = {
  // ── Original recipes ──
  'drommekage':             [[0, 'Cake'],          [3, 'Coconut topping']],
  'bounty-cake':            [[0, 'Coconut cake'],  [2, 'Chocolate cream'], [4, 'Finish']],
  'carrot-cake':            [[0, 'Cake'],          [3, 'Frosting']],
  'cinnabon-rolls':         [[0, 'Dough'],         [2, 'Filling'],         [5, 'Frosting']],
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
  'gotteri-vanillu-skyrkaka-lakkris':         [[0, 'Base'], [1, 'Vanilla skyr mousse'], [2, 'Topping']],


  // ── Gotteri Scraped Cake Steps ──
  'gotteri-rosakaka': [[0,"Cake"],[7,"Chocolate frosting"],[9,"Vanilla frosting"]],
  'gotteri-sukkuladiterta': [[0,"Cake"],[7,"Frosting"]],
  'gotteri-paskabomba': [[0,"Cake"],[1,"Frosting"],[2,"Frosting"],[6,"Chocolate ganache"],[7,"Decoration"]],
  'gotteri-haustkaka': [[0,"Cake"],[7,"Frosting"],[10,"Decoration"]],
  'gotteri-regnbogakaka-2': [[0,"Chocolate frosting"],[2,"Vanilla frosting"]],
  'gotteri-saltkaramelludraumur': [[0,"Cake"],[8,"Caramel sauce"],[15,"Caramel frosting"],[20,"Decoration"]],
  'gotteri-aramotakakan': [[0,"Cake"],[2,"Frosting"]],
  'gotteri-sukkuladikaka-med-dumlekremi': [[0,"Caramel frosting"],[3,"Frosting"]],
  'gotteri-thjodhatidarkakan-2': [[0,"Cake"],[7,"Cake"]],
  'gotteri-kryddkaka-i-jolabuningi': [[0,"Cake"],[7,"Frosting"],[12,"Decoration"]],
  'gotteri-piparkokukaka': [[0,"Cake"],[9,"Frosting"],[13,"Decoration"]],
  'gotteri-gamaldags-sukkuladiterta': [[0,"Cake"],[7,"Frosting"],[9,"Decoration"]],
  'gotteri-sukkuladiterta-med-mokkakremi': [[0,"Cake"],[7,"Frosting"],[8,"Cake"],[11,"Decoration"]],
  'gotteri-vanillukaka-med-kokosblae': [[0,"Cake"],[5,"Vanilla frosting"],[8,"Decoration"]],
  'gotteri-vanillukaka-med-saltkaramellu': [[0,"Cake"],[4,"Caramel sauce"],[8,"Vanilla frosting"],[11,"Decoration"]],
  'gotteri-oreoterta-meistarans': [[0,"Cake"],[7,"Frosting"],[15,"Cake"],[17,"Decoration"]],
  'gotteri-sukkuladiterta-med-rjomaostakremi': [[0,"Cake"],[7,"Frosting"]],
  'gotteri-sour-patch-kids-regnbogakaka': [[0,"Cake"],[9,"Frosting"]],
  'gotteri-kisukaka': [[0,"Cake"],[7,"Frosting"],[10,"Frosting"],[15,"Decoration"]],
  'gotteri-kanilkaka-med-piparkokum': [[0,"Cake"],[5,"Frosting"]],
  'gotteri-einfold-gulrotarkaka': [[0,"Cake"],[6,"Cream cheese frosting"]],
  'gotteri-gulrotarkaka-i-jolabuningi': [[0,"Cake"],[6,"Cream cheese frosting"],[9,"Decoration"]],
  'gotteri-sukkuladikaka-i-paskafotum': [[0,"Cake"],[7,"Chocolate frosting"],[12,"Decoration"]],
  'gotteri-gulrotarkaka-uppskrift': [[0,"Cake"],[6,"Frosting"]],
  'gotteri-saelgaetisterta': [[0,"Cake"],[3,"Meringue"],[6,"Filling"],[9,"Decoration"],[10,"Decoration"]],
  'gotteri-daim-bomba': [[0,"Cake"],[8,"Meringue"],[14,"Cake"],[15,"Decoration"]],
  'gotteri-marengsbomba-i-morgum-logum': [[0,"Meringue"],[6,"Cake"],[12,"Decoration"]],
  'gotteri-marengshringur-med-jardaberjarjoma-og-marssosu': [[0,"Meringue"],[9,"Caramel sauce"],[11,"Filling"]],
  'gotteri-pudusykurs-pavloa': [[0,"Meringue"],[4,"Caramel sauce"]],
  'gotteri-mini-pavlour-med-lakkriskeim': [[0,"Cake"],[6,"Decoration"],[9,"Caramel sauce"]],
  'gotteri-marsipan-og-marengs': [[0,"Cake"],[6,"Meringue"],[11,"Caramel sauce"],[13,"Cake"],[14,"Decoration"]],
  'gotteri-piparmyntumarengs-med-karamellu-og-berjum': [[0,"Meringue"],[6,"Caramel sauce"],[7,"Filling"],[9,"Meringue"]],
  'gotteri-einfold-marengsbomba': [[0,"Meringue"],[4,"Meringue"]],
  'gotteri-karamelludraumur': [[0,"Meringue"],[6,"Filling"],[8,"Decoration"]],
  'gotteri-passion-fruit-pavlova': [[0,"Meringue"],[8,"Filling"]],
  'gotteri-pavlova-med-filakaramellusosu': [[0,"Meringue"],[7,"Caramel sauce"],[9,"Filling"],[14,"Decoration"]],
  'gotteri-kaffimarengs': [[0,"Meringue"],[7,"Frosting"],[10,"Filling"]],
  'gotteri-marengsterta': [[0,"Meringue"],[5,"Caramel sauce"],[8,"Frosting"],[10,"Decoration"]],
  'gotteri-mokkamarengs': [[0,"Meringue"],[6,"Caramel sauce"],[7,"Filling"]],
  'gotteri-hnallthora-aramotanna': [[0,"Cake"],[8,"Meringue"],[13,"Caramel sauce"],[15,"Filling"]],
  'gotteri-blaberja-pavlovur-med-filakaramellukremi': [[0,"Cake"],[8,"Caramel sauce"],[10,"Filling"]],
  'gotteri-snickersterta': [[0,"Meringue"],[4,"Filling"],[5,"Chocolate frosting"]],
  'gotteri-hatidarmarengs': [[0,"Meringue"],[6,"Filling"],[8,"Decoration"]],
  'gotteri-heslihnetumarengs': [[0,"Meringue"],[8,"Filling"]],
  'gotteri-pavlovur-med-mascarpone-rjomafyllingu': [[0,"Meringue"],[3,"Filling"]],
  'gotteri-noakropps-bomba': [[0,"Cake"],[4,"Meringue"],[10,"Caramel sauce"],[12,"Filling"]],
  'gotteri-rice-krispies-marengsterta-med-noakroppi': [[0,"Meringue"],[4,"Filling"]],
  'gotteri-kransakaka': [[0,"Cake"],[7,"Cake"]],
  'gotteri-kransakokustafur': [[0,"Cake"],[7,"Cake"]],
  'gotteri-kransastjarna': [[0,"Cake"],[9,"Decoration"]],
  'gotteri-kransakokugotteri': [[0,"Cake"],[9,"Cake"],[11,"Decoration"]],
  'gotteri-karamellu-og-sukkuladi-brownie': [[0,"Cake"],[8,"Cake"]],
  'gotteri-center-sukkuladi-og-karamellubrownies-med-sukkuladirjoma': [[0,"Cake"],[10,"Cake"]],
  'gotteri-piparmyntu-brownies': [[0,"Cake"],[1,"Frosting"],[2,"Chocolate frosting"]],
  'gotteri-rolo-brownies': [[0,"Cake"],[9,"Cake"]],
  'gotteri-tuc-brownies': [[0,"Cake"],[1,"Cake"]],
  'gotteri-piparmyntubrunkur': [[0,"Cake"],[7,"Frosting"]],
  'gotteri-brownie-stafur': [[0,"Cake"],[8,"Cream cheese frosting"]],
  'gotteri-paskakokukanina': [[0,"Cake"],[8,"Frosting"],[12,"Cake"]],
  'gotteri-jolabrownie': [[0,"Cake"],[5,"Frosting"]],
  'gotteri-filakaramellubrownies': [[0,"Cake"],[9,"Caramel frosting"]],
  'gotteri-thristabrunkur': [[0,"Cake"],[6,"Cake"]],
  'gotteri-brownie-med-serrirjoma': [[0,"Cake"],[6,"Cake"]],
  'gotteri-pekanhnetudraumur-2': [[0,"Cake"],[7,"Cake"]],
  'gotteri-brownie-med-mascarpone-sukkuladikremi': [[0,"Cake"],[7,"Chocolate frosting"]],
  'gotteri-brownies-med-lakkriskeim': [[0,"Cake"],[6,"Frosting"]],
  'gotteri-fronsk-sukkuladikaka': [[0,"Cake"],[7,"Frosting"]],
  'gotteri-einfold-sukkuladikaka': [[0,"Cake"],[2,"Frosting"]],
  'gotteri-lukkukaka': [[0,"Cake"],[4,"Frosting"]],
  'gotteri-betty-bjargar-paskunum': [[0,"Cake"],[4,"Frosting"],[6,"Chocolate frosting"],[9,"Decoration"]],
  'gotteri-luxus-lindor-sukkuladiterta': [[0,"Chocolate frosting"],[9,"Decoration"]],
  'gotteri-sukkuladihringur-med-appelsinukeim': [[0,"Cake"],[7,"Chocolate frosting"]],
  'gotteri-sukkuladikaka-med-englakremi': [[0,"Cake"],[7,"Frosting"]],
  'gotteri-djoflaterta-med-lakkriskeim': [[0,"Cake"],[8,"Frosting"],[12,"Cake"],[15,"Decoration"]],
  'gotteri-sukkuladisaela': [[0,"Cake"],[6,"Chocolate frosting"]],
  'gotteri-lava-kokur-a-null-einni': [[0,"Cake"],[1,"Cake"],[7,"Cake"],[11,"Cake"],[14,"Cake"]],
  'gotteri-utileguskuffa': [[0,"Cake"],[5,"Frosting"]],
  'gotteri-einfold-skuffukaka': [[0,"Cake"],[7,"Decoration"]],
  'gotteri-batman-oreokaka': [[0,"Cake"],[7,"Frosting"],[13,"Decoration"]],
  'gotteri-slongukaka': [[0,"Cake"],[11,"Frosting"],[14,"Decoration"]],
  'gotteri-sukkuladikaka-med-sukkuladikremi': [[0,"Cake"],[6,"Chocolate frosting"],[11,"Decoration"]],
  'gotteri-afmaeliskaka': [[0,"Cake"],[7,"Chocolate frosting"],[10,"Decoration"]],
  'gotteri-skuffukaka-andreu': [[0,"Cake"],[3,"Chocolate frosting"]],
  'gotteri-sukkuladikaka-med-noakroppshjup': [[0,"Cake"],[6,"Frosting"]],
  'gotteri-fermingarterta': [[0,"Cake"],[8,"Cake"],[14,"Cake"],[19,"Decoration"]],
  'gotteri-margra-laga-sukkuladi-og-jardaberjaterta': [[0,"Cake"],[8,"Cake"],[14,"Cake"],[19,"Cake"],[28,"Cake"],[31,"Cake"]],
  'gotteri-naked-cake-med-sukkuladi-karamellu-og-vanillu-ivafi': [[0,"Cake"],[1,"Caramel frosting"],[5,"Cake"],[12,"Decoration"],[15,"Frosting"]],
  'gotteri-gomsaet-sukkuladiterta': [[0,"Cake"],[6,"Chocolate frosting"],[11,"Frosting"],[14,"Decoration"]],
  'gotteri-jardaberjaterta-og-graenmetismarkadur': [[0,"Cake"],[4,"Cake"],[7,"Cake"],[10,"Decoration"]],
  'gotteri-aramotatertan-2018': [[0,"Cake"],[6,"Cake"],[9,"Cake"],[11,"Decoration"]],
  'gotteri-skautaterta': [[0,"Cake"],[8,"Cake"],[12,"Frosting"]],
  'gotteri-gulrotarkaka-med-rjomaostakremi': [[0,"Cake"],[8,"Cream cheese frosting"]],
  'gotteri-ponnukokukaka-uppskrift': [[0,"Cake"],[5,"Filling"]],
  'gotteri-bananakaka-med-glassur': [[0,"Cake"],[7,"Cake"]],
  'gotteri-eplakaka-med-kryddkeim-og-karamellu': [[0,"Cake"],[5,"Caramel sauce"]],
  'gotteri-epladraumur': [[0,"Cake"],[7,"Caramel sauce"]],
  'gotteri-sukkuladi-bananakaka-med-karamellukremi': [[0,"Cake"],[7,"Caramel frosting"]],
  'gotteri-mondlukaka-med-rabbabaramauki': [[0,"Cake"],[8,"Cake"]],
  'gotteri-eplakrons': [[0,"Filling"],[3,"Cake"]],
  'gotteri-jolahringur-med-karamellubrad': [[0,"Cake"],[7,"Cake"]],
  'gotteri-hefdbundin-kitkat-kaka': [[0,"Cake"],[3,"Decoration"]],
  'gotteri-maltesers-kaka': [[0,"Frosting"],[7,"Decoration"]],
  'gotteri-starbucks-sitronukaka': [[0,"Cake"],[5,"Cake"]],
  'gotteri-paskatertan-2017': [[0,"Cake"],[5,"Cake"],[11,"Filling"],[12,"Cake"]],
  'gotteri-snickers-kaka-simstodvarinnar': [[0,"Cake"],[5,"Caramel sauce"],[7,"Cake"]],
  'gotteri-vatnsdeigsbollukaka-med-hindberjafyllingu-og-lakkris': [[0,"Cake"],[10,"Filling"],[13,"Decoration"]],
  'gotteri-tiramisu-kaka': [[0,"Cake"],[7,"Cake"]],
  'gotteri-jordbaertaerte': [[0,"Cake"],[5,"Filling"],[10,"Decoration"]],
  'gotteri-peruterta': [[0,"Cake"],[5,"Chocolate frosting"]],
  'gotteri-rjomaterta-med-kokteilavoxtum': [[0,"Cake"],[6,"Filling"],[10,"Decoration"]],
  'gotteri-kanilkaka-med-glassur': [[0,"Cake"],[6,"Cake"]],
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
  return ['All', ...new Set(recipes.map(r => r.category || 'Other'))];
}
function renderChips() {
  const container = document.getElementById('chips');
  const cats = categories();
  const currentButtons = container.querySelectorAll('[data-cat]');
  const currentCats = Array.from(currentButtons).map(b => b.dataset.cat);

  if (currentCats.length === cats.length && currentCats.every((c, i) => c === cats[i])) {
    currentButtons.forEach(b => {
      b.classList.toggle('active', b.dataset.cat === category);
    });
    return;
  }

  container.innerHTML = cats
    .map(c => `<button class="chip ${category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join('');
  container.querySelectorAll('[data-cat]').forEach(b => {
    b.onclick = () => { category = b.dataset.cat; render(); };
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
    (category === 'All' || r.category === category) && (!onlyFavs || favs.has(r.id)) && matches(r, q)
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
      focusedSection = null; /* clear focus when switching recipe */
      saveAll(); scale = 1; view = 'amounts';
      render();
    };
  });
  document.querySelectorAll('[data-fav]').forEach(h => {
    h.onclick = e => { e.stopPropagation(); toggleFav(h.dataset.fav); };
  });
}

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
      ${r.yield  ? `<span class="stat">${esc(r.yield)}</span>`       : ''}
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
    category:  document.getElementById('fCategory').value.trim() || 'Other',
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
  /* Apply theme immediately before anything renders */
  initTheme();

  /* Loading state */
  document.getElementById('list').innerHTML   = '<div class="loading"><div class="spinner"></div>Loading recipes…</div>';
  document.getElementById('detail').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  /* Fetch seed recipes */
  try {
    const res = await fetch('./recipes.json');
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

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  render();
}

init();
