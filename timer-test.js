const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = ['i18n.js', 'shopping.js', 'app.js'].map(file => fs.readFileSync(file, 'utf8')).join('\n');
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
    const state = JSON.parse(saved);
    assert.equal(state.minutes, 30);
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
    assert.equal(JSON.parse(w.localStorage.getItem(timerKey)).dueAt, state.dueAt, 'do not automatically count overdue folds');
    d.querySelector('[data-fold-next]').click();
    assert.equal(JSON.parse(w.localStorage.getItem(timerKey)).dueAt, w.Date.now() + 1800000, 'next interval starts when cook confirms');
    w.Date.now = realNow;
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
    assert.equal(JSON.parse(w.localStorage.getItem(timerKey)).minutes, 25);
    for (const lang of ['pl', 'is']) {
      d.querySelector(`[data-language="${lang}"]`).click();
      d.dispatchEvent(new w.Event('visibilitychange'));
      assert.ok(!d.querySelector('[data-fold-stop]').textContent.includes('Finish timer'));
      assert.ok(!d.querySelector('[data-fold-recipe]').textContent.includes('Keep the app open'));
    }
    d.querySelector('[data-fold-stop]').click();
    dom.window.close();
    dom = open('{broken'); await wait();
    assert.equal(dom.window.document.querySelector('#foldTimerPanel').hidden, true);
    console.log('Folding timer: start, validation, reload, overdue recovery, repeat, stop and translations passed.');
  } finally { dom.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
