/* Optional real-browser QA: connect to Chrome's debugging port, use a disposable context. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const origin = process.env.QUICKRECIPE_URL || 'http://127.0.0.1:8766';
const debug = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9336';
const password = process.env.PRO_TEST_PASSWORD;
if (!password) throw new Error('Set PRO_TEST_PASSWORD to the configured Pro password for browser QA.');
const output = path.resolve('tmp/canteen-layout-qa');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect(url) {
  const socket = new WebSocket(url); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0; const pending = new Map(), errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const job = pending.get(message.id); if (!job) return; pending.delete(message.id); clearTimeout(job.timer);
      message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  };
  return { errors, close: () => socket.close(), send(method, params = {}) {
    return new Promise((resolve, reject) => { const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
  } };
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const version = await (await fetch(`${debug}/json/version`)).json();
  const browser = await connect(version.webSocketDebuggerUrl);
  const { browserContextId } = await browser.send('Target.createBrowserContext'); let page;
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const targets = await (await fetch(`${debug}/json`)).json(); page = await connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
    const send = page.send.bind(page);
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    const ready = async () => { for (let i = 0; i < 100; i++) { if (await evaluate('typeof recipes !== "undefined" && recipes.length > 0 && typeof canteen !== "undefined"')) return; await pause(100); } throw new Error('Recipes did not load'); };
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const unlock = async () => {
      await click('#canteenBtn');
      await evaluate(`(()=>{document.getElementById('proPassword').value=${JSON.stringify(password)};document.querySelector('[data-pro-unlock]').requestSubmit();})()`);
      for (let i = 0; i < 50; i++) { if (await evaluate('canteen.active')) return; await pause(50); }
      throw new Error('Could not unlock Pro');
    };
    const change = (selector, value) => evaluate(`(()=>{ const el=document.querySelector(${JSON.stringify(selector)}); el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    const size = async (width, height = 1100) => { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(50); };
    const shot = async name => { const image = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(image.data, 'base64')); };
    const geometry = () => evaluate(`(()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      const grid=document.querySelector('.canteen-days');
      return {width:innerWidth,scrollY,overflow:document.documentElement.scrollWidth>innerWidth,app:rect(document.querySelector('.app')),header:rect(document.querySelector('.top')),view:rect(document.querySelector('#canteenView')),cards:[...document.querySelectorAll('.canteen-day')].map(rect), grid:grid?{...rect(grid),scrollWidth:grid.scrollWidth,clientWidth:grid.clientWidth}:null};
    })()`);
    await send('Runtime.enable'); await send('Page.enable'); await send('Page.navigate', { url: origin }); await pause(150); await ready();
    // Empty views must remain anchored at the top even on a tall monitor.
    await size(1800, 1400);
    await click('#canteenBtn');
    assert(await evaluate('document.getElementById("canteenArea").hidden'));
    await evaluate(`document.getElementById('proPassword').value='incorrect-qa-password';document.querySelector('[data-pro-unlock]').requestSubmit()`); await pause(100);
    assert(await evaluate('document.getElementById("canteenArea").hidden'));
    assert(await evaluate('document.querySelector("[data-pro-error]").textContent.length>0'));
    await shot('password-prompt'); await click('[data-pro-cancel]');
    assert(await evaluate('document.getElementById("canteenArea").hidden'));
    await unlock();
    for (const tab of ['week', 'requirements', 'kitchen']) {
      await click(`[data-tab="${tab}"]`); const g = await geometry();
      assert.equal(g.app.y, 0, `${tab}: empty view must not be vertically centred`);
      assert(g.header.y < 30 && g.view.y < 380, `${tab}: content starts too low`);
      assert(!g.overflow); await shot(`empty-${tab}`);
    }
    // Use real recipes, with long variant labels and several items per slot.
    async function plan(days, populated = true) {
      await evaluate(`(()=>{
        const plan=CanteenPlans.create('2026-09-14');plan.operatingDays=${JSON.stringify(days)};
        const r=recipes.find(r=>r.title==='Beef Stroganoff');
        const side=recipes.find(r=>r.title==='Classic Risotto');
        for(const day of plan.days){day.defaultPortions=355;
          if(day===plan.days[0])day.note='Serve lunch at 12:30. Keep the vegetarian portions separate.';
          if(${populated}){const main=CanteenPlans.add(day,plan.slots[1].id,r.id);main.portions=347;
            const variant=CanteenPlans.add(day,plan.slots[1].id,r.id);variant.portions=8;variant.variant='Separate preparation with reviewed ingredients';
            CanteenPlans.add(day,plan.slots[2].id,side.id);}}
        localStorage.setItem('quickrecipe.canteen.v1',JSON.stringify({version:1,weeks:{[plan.start]:plan},templates:[]}));
      })()`);
      await send('Page.reload', { ignoreCache: true }); await pause(100); await ready(); assert(await evaluate('canteen.active'), 'Pro must survive refresh'); await change('[data-week]', '2026-09-14');
    }
    const cases = [];
    for (const days of [[0,1,2,3,4], [0,1,2,3,4,5,6], [0,2,4]]) {
      await plan(days);
      for (const width of [1800, 1440, 1280, 1024, 768, 600, 390, 320]) {
        await size(width); const g = await geometry(); assert(!g.overflow, `${days.length} days: page overflow at ${width}`);
        assert.equal(g.cards.length, days.length);
        if (width >= 1024) {
          assert(g.cards.every(card => Math.abs(card.y - g.cards[0].y) < 1), `${days.length} days: wrapped week at ${width}`);
          assert(g.cards[0].x >= 0 && g.cards.at(-1).right <= width, 'Whole week must fit horizontally');
          assert(g.grid.scrollWidth <= g.grid.clientWidth + 1, `Content overflow inside week at ${width}`);
        } else if (width > 600) assert(g.grid.scrollWidth > g.grid.clientWidth, 'Tablet week should scroll within its own grid');
        else assert(g.cards.every(card => Math.abs(card.x - g.cards[0].x) < 1), 'Mobile cards should stack');
        const itemOverflow = await evaluate(`[...document.querySelectorAll('.canteen-menu-item')].some(el=>el.scrollWidth>el.clientWidth+1)`);
        assert(!itemOverflow, `Item controls overflow: ${days.length} days at ${width}`);
        cases.push({days:days.length,width});
        if ([1800,768,390].includes(width)) await shot(`week-${days.length}-${width}`);
      }
    }
    await plan([0,1,2,3,4]);
    for (const width of [1800, 1280, 768, 390, 320]) {
      await size(width);
      for (const tab of ['requirements', 'kitchen', 'week']) {
        await evaluate('window.scrollTo(0, document.body.scrollHeight)'); await click(`[data-tab="${tab}"]`);
        const g = await geometry(); assert.equal(g.scrollY, 0, `${tab}: stale scroll at ${width}`); assert.equal(g.app.y, 0); assert(!g.overflow);
        if (width >= 768 && tab !== 'week') {
          const alignment = await evaluate(`(()=>{const row=document.querySelector('.canteen-filter-actions');const select=row.querySelector('select').getBoundingClientRect();const button=row.querySelector('button').getBoundingClientRect();return {top:Math.abs(select.top-button.top),height:Math.abs(select.height-button.height)}})()`);
          assert(alignment.top < 1 && alignment.height < 1, `${tab}: dropdown and button alignment at ${width}`);
        }
        if (width === 1800 || width === 390) await shot(`${tab}-${width}`);
      }
    }
    // Editing a day in the tablet strip must not jump back to Monday.
    await size(768); await click('[data-tab="week"]');
    const stripScroll = await evaluate(`(()=>{const grid=document.querySelector('.canteen-days');grid.scrollLeft=grid.scrollWidth;return grid.scrollLeft})()`);
    await change('.canteen-day:last-child [data-default]', '360');
    assert.equal(await evaluate(`document.querySelector('.canteen-days').scrollLeft`), stripScroll);
    // Recipe navigation, dialogs, batches, printing, language changes and reloads.
    await size(1280); await click('[data-tab="kitchen"]'); await click('.canteen-batch-options summary'); await change('[data-batch-mode]', 'maximum'); await change('[data-batch-value]', '80');
    await click('[data-complete]'); await click('[data-open-batch]'); assert.equal(await evaluate('scale'), 17.35);
    await click('[data-return-kitchen]'); assert(await evaluate('document.querySelector("[data-complete]").checked'));
    await click('[data-print-production]'); assert(await evaluate('!!document.querySelector("#canteenPrint")'));
    await shot('kitchen-sheet-preview');
    await size(390); await shot('kitchen-sheet-preview-mobile');
    assert(await evaluate('(()=>{const d=document.querySelector(".canteen-dialog");return d.scrollWidth<=d.clientWidth})()'));
    await size(1280);
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".app")).display'), 'none'); await shot('print-production');
    await send('Emulation.setEmulatedMedia', { media: 'screen' }); await click('.canteen-dialog [data-close]');
    // Every paper view shares its content and typography with the print target.
    for (const lang of ['is', 'pl', 'en']) {
      await evaluate(`changeLanguage('${lang}')`);
      for (const [tab, trigger, name] of [
        ['week', 'data-print-week', 'menu'], ['week', 'data-allergen-sheet', 'allergens'],
        ['requirements', 'data-print-requirements', 'ingredients'], ['kitchen', 'data-print-production', 'kitchen']
      ]) {
        await size(1280); await click(`[data-tab="${tab}"]`); await click(`[${trigger}]`); await pause(50);
        assert(await evaluate(`document.querySelector('.canteen-print-preview').innerHTML === document.getElementById('canteenPrint').innerHTML`));
        const paperStyles = selector => evaluate(`(()=>{
          const root=document.querySelector(${JSON.stringify(selector)});
          return [...root.querySelectorAll('header,h1,h2,h3,p,li,strong,span')].map(el=>{
            const s=getComputedStyle(el);return [s.fontSize,s.lineHeight,s.color,s.marginTop,s.marginBottom,s.paddingTop,s.paddingBottom];
          });
        })()`);
        const previewStyles = await paperStyles('.canteen-print-preview');
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('.canteen-print-preview')).backgroundColor`), 'rgb(255, 255, 255)');
        await shot(`${lang}-${name}-preview`);
        await size(390); await pause(50);
        assert(await evaluate(`(()=>{const d=document.querySelector('.canteen-dialog');return d.scrollWidth<=d.clientWidth})()`), `${lang}/${name}: preview overflow`);
        await send('Emulation.setEmulatedMedia', { media: 'print' });
        assert.deepEqual(await paperStyles('#canteenPrint'), previewStyles, `${lang}/${name}: print styles differ from preview`);
        await send('Emulation.setEmulatedMedia', { media: 'screen' }); await click('.canteen-dialog [data-close]');
      }
    }
    await size(1280);
    await click('[data-tab="week"]'); await click('[data-settings]');
    await click('.automatic-allergens details summary');
    assert.equal(await evaluate(`document.querySelectorAll('.automatic-allergens input[type="checkbox"]').length`), 0);
    assert(await evaluate(`document.querySelector('.automatic-allergens').textContent.includes('Automatic allergens')`));
    assert(await evaluate(`document.querySelector('.ingredient-allergen-list').children.length > 0`));
    await shot('recipe-settings');
    await size(390); await shot('recipe-settings-mobile');
    assert(await evaluate('(()=>{const d=document.querySelector(".canteen-dialog");return d.scrollWidth<=d.clientWidth})()'), 'Allergen cards overflow on mobile');
    await size(1280); await click('.canteen-dialog [data-close]');
    await click('[data-config]'); assert.equal(await evaluate('document.querySelectorAll("[data-operating]").length'), 7); await click('.canteen-dialog [data-close]');
    await size(390);
    for (const lang of ['pl', 'is', 'en']) { await evaluate(`changeLanguage('${lang}')`); for (const tab of ['week', 'requirements', 'kitchen']) { await click(`[data-tab="${tab}"]`); assert(!(await geometry()).overflow, `${lang}/${tab} mobile overflow`); } }
    await click('[data-exit]'); assert(await evaluate('document.getElementById("canteenArea").innerHTML===""')); assert.equal(await evaluate('document.getElementById("canteenBtn").textContent'), 'Pro');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false, 'Normal recipe screen overflow');
    await send('Page.reload', { ignoreCache: true }); await pause(100); await ready(); assert.equal(await evaluate('canteen.active'), false, 'Leaving Pro must clear the session'); await unlock(); await change('[data-week]', '2026-09-14'); await click('[data-tab="kitchen"]');
    assert(await evaluate('document.querySelector("[data-complete]").checked'), 'Checklist lost after reload');
    assert.equal(await evaluate('document.querySelector("[data-batch-value]").value'), '80');
    assert.deepEqual(page.errors, []);
    console.log(`Browser QA passed: ${cases.length} week layouts; password lock, empty/populated view placement, scrolling, kitchen, dialogs, print, languages and persistence. Screenshots: ${output}`);
  } finally { page?.close(); await browser.send('Target.disposeBrowserContext', { browserContextId }); browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
