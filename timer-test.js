const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = ['i18n.js', 'ingredient-allergens.js', 'recipe-calculations.js', 'shopping.js', 'app.js'].map(file => fs.readFileSync(file, 'utf8')).join('\n');
const timerKey = 'quickrecipe.foldTimer.v1';
const wait = () => new Promise(resolve => setTimeout(resolve, 50));
function open(saved) {
  const dom = new JSDOM(html, {
    url: 'http://localhost', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {} });
      w.scrollTo = () => {};
      w.fetch = async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync('.' + new URL(url, 'http://localhost').pathname)) });
      if (saved) w.localStorage.setItem(timerKey, saved);
    },
  });
  dom.window.eval(scripts);
  return dom;
}
(async () => {
  let dom = open();
  try {
    await wait();
    let w = dom.window, d = w.document;
    let form = d.querySelector('[data-fold-recipe="ciabatta"]');
    assert.equal(form.elements.minutes.value, '30');
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    const saved = w.localStorage.getItem(timerKey);
    const state = JSON.parse(saved)[0];
    assert.equal(state.minutes, 30);
    assert.equal(state.starts, 1);
    assert.equal(d.querySelector('.fold-start-count').textContent, 'Started 1×');
    assert.ok(d.querySelector('[data-fold-recipe] button').disabled);
    assert.equal(d.querySelector('.fold-countdown').textContent, '30:00');
    d.querySelector('[data-scale="2"]').click();
    assert.equal(w.localStorage.getItem(timerKey), saved, 're-render must preserve deadline');
    assert.equal(d.querySelector('#foldTimerPanel').hidden, false);
    dom.window.close();

    dom = open(saved); await wait(); w = dom.window; d = w.document;
    assert.equal(d.querySelector('#foldTimerPanel').hidden, false, 'restore timer after reload');
    const realNow = w.Date.now;
    w.Date.now = () => state.dueAt + 120000;
    d.dispatchEvent(new w.Event('visibilitychange'));
    assert.equal(d.querySelector('.fold-countdown').textContent, '0:00');
    assert.match(d.querySelector('#foldTimerPanel').textContent, /Time to fold the dough!/);
    assert.equal(JSON.parse(w.localStorage.getItem(timerKey))[0].dueAt, state.dueAt, 'do not automatically count overdue folds');
    assert.equal(d.querySelector('.fold-start-count').textContent, 'Started 1×', 'expiry must not increment starts');
    const next = d.querySelector('[data-fold-next]');
    next.click();
    next.click();
    assert.equal(d.querySelector('.fold-start-count').textContent, 'Started 2×', 'count each new interval only once');
    assert.equal(JSON.parse(w.localStorage.getItem(timerKey))[0].starts, 2);
    assert.equal(JSON.parse(w.localStorage.getItem(timerKey))[0].dueAt, w.Date.now() + 1800000, 'next interval starts when cook confirms');
    const repeated = w.localStorage.getItem(timerKey);
    w.Date.now = realNow;
    dom.window.close();
    dom = open(repeated); await wait(); w = dom.window; d = w.document;
    assert.equal(d.querySelector('.fold-start-count').textContent, 'Started 2×', 'preserve repeat count after reload');
    d.querySelector('[data-fold-stop]').click();
    assert.equal(w.localStorage.getItem(timerKey), null);
    assert.equal(d.querySelector('#foldTimerPanel').hidden, true);
    assert.equal(d.querySelector('[data-fold-recipe] button').disabled, false);

    d.querySelector('[data-browse="baking"]').click();
    d.querySelector('[data-cat="Bread"]').click();
    d.querySelector('[data-id="focaccia"]').click();
    form = d.querySelector('[data-fold-recipe="focaccia"]');
    assert.equal(form.elements.minutes.value, '', 'do not invent an interval');
    for (const invalid of ['0', '241', '1.5', '']) {
      form.elements.minutes.value = invalid;
      form.dispatchEvent(new w.Event('submit', { cancelable: true }));
      assert.equal(w.localStorage.getItem(timerKey), null);
    }
    form.elements.minutes.value = '25';
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    assert.equal(JSON.parse(w.localStorage.getItem(timerKey))[0].minutes, 25);
    assert.equal(d.querySelector('.fold-start-count').textContent, 'Started 1×', 'new session resets starts');
    for (const lang of ['pl', 'is']) {
      d.querySelector(`[data-language="${lang}"]`).click();
      d.dispatchEvent(new w.Event('visibilitychange'));
      assert.equal(d.querySelector('.fold-start-count').textContent, lang === 'pl' ? 'Uruchomiono 1×' : 'Ræst 1×');
      assert.ok(!d.querySelector('[data-fold-stop]').getAttribute('aria-label').includes('Finish timer'));
      assert.ok(!d.querySelector('[data-fold-recipe]').textContent.includes('Keep the app open'));
    }
    d.querySelector('[data-fold-stop]').click();
    dom.window.close();
    dom = open('{broken'); await wait();
    assert.equal(dom.window.document.querySelector('#foldTimerPanel').hidden, true);
    dom.window.close();
    const legacy = { recipeId: 'ciabatta', minutes: 30, dueAt: Date.now() + 60000 };
    dom = open(JSON.stringify(legacy)); await wait();
    assert.equal(dom.window.document.querySelector('.fold-start-count').textContent, 'Started 1×');
    assert.equal(dom.window.document.querySelector('#foldTimerPanel').hidden, false, 'keep existing timers running');
    // Multiple doughs retain independent deadlines and counters, including migration.
    dom.window.close();
    const ongoing = { ...legacy, starts: 3 };
    dom = open(JSON.stringify(ongoing)); await wait(); w = dom.window; d = w.document;
    const row = id => d.querySelector(`[data-fold-timer="${id}"]`);
    const savedTimer = id => JSON.parse(w.localStorage.getItem(timerKey)).find(timer => timer.recipeId === id);
    const selectBread = id => {
      d.querySelector(`[data-id="${id}"]`).click();
      return d.querySelector('[data-fold-recipe]');
    };
    for (const id of ['focaccia', 'simple-sourdough']) {
      const form = selectBread(id);
      assert.equal(form.querySelector('button').disabled, false, 'other breads can start timers');
      form.elements.minutes.value = '2';
      form.dispatchEvent(new w.Event('submit', { cancelable: true }));
      assert.equal(form.querySelector('button').disabled, true, 'one timer per bread');
      form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    }
    assert.equal(d.querySelectorAll('[data-fold-timer]').length, 3);
    assert.equal(savedTimer('ciabatta').dueAt, ongoing.dueAt, 'migration keeps original deadline');
    assert.equal(savedTimer('ciabatta').starts, 3, 'migration keeps original count');
    const focaccia = savedTimer('focaccia');
    w.Date.now = () => ongoing.dueAt + 1000;
    d.dispatchEvent(new w.Event('visibilitychange'));
    assert.equal(row('ciabatta').classList.contains('is-due'), true);
    assert.equal(row('focaccia').classList.contains('is-due'), false);
    row('ciabatta').querySelector('[data-fold-next]').click();
    assert.equal(savedTimer('ciabatta').starts, 4);
    assert.deepEqual(savedTimer('focaccia'), focaccia, 'repeating one bread leaves another untouched');
    const allTimers = w.localStorage.getItem(timerKey);
    dom.window.close();
    dom = open(allTimers); await wait(); w = dom.window; d = w.document;
    assert.equal(d.querySelectorAll('[data-fold-timer]').length, 3, 'restore all timers');
    assert.equal(row('ciabatta').querySelector('.fold-start-count').textContent, 'Started 4×');
    row('ciabatta').querySelector('[data-fold-stop]').click();
    assert.equal(row('ciabatta'), null);
    assert.deepEqual(savedTimer('focaccia'), focaccia, 'finishing one bread leaves another untouched');
    assert.equal(selectBread('ciabatta').querySelector('button').disabled, false);
    const remaining = JSON.parse(w.localStorage.getItem(timerKey));
    w.Date.now = () => Math.max(...remaining.map(timer => timer.dueAt)) + 1000;
    d.dispatchEvent(new w.Event('visibilitychange'));
    assert.equal(d.querySelectorAll('.fold-timer-row.is-due').length, 2, 'show simultaneous reminders');
    row('focaccia').querySelector('[data-fold-next]').click();
    assert.equal(row('simple-sourdough').classList.contains('is-due'), true);
    assert.equal(savedTimer('simple-sourdough').starts, 1);
    row('focaccia').querySelector('[data-fold-stop]').click();
    row('simple-sourdough').querySelector('[data-fold-stop]').click();
    assert.equal(w.localStorage.getItem(timerKey), null);
    assert.equal(d.querySelector('#foldTimerPanel').hidden, true);
    console.log('Folding timer: start, validation, reload, overdue recovery, repeat, stop, translations and independent concurrent timers passed.');
  } finally { dom.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
