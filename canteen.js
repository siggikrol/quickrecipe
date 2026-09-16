/* Canteen views share recipe data, translations and the existing detail renderer. */
// Casual browser-side lock only; this is not server-side access control.
const PRO_PASSWORD_SHA256 = '67c65c2aea62d7d8b52c75982e724c27f3e80fbb9aeee83f723879ddeed3a78f';
const canteen = (() => {
  const key = 'quickrecipe.canteen.v1';
  const sessionKey = 'quickrecipe.pro.active';
  const root = document.getElementById('canteenArea');
  const dialog = document.createElement('dialog'); dialog.className = 'canteen-dialog'; document.body.append(dialog);
  const unlockDialog = document.createElement('dialog'); unlockDialog.className = 'canteen-dialog pro-unlock'; document.body.append(unlockDialog);
  let unlockAttempt = 0, printPreviewObserver = null;
  unlockDialog.addEventListener('close', () => { unlockAttempt++; unlockDialog.innerHTML = ''; document.getElementById('canteenBtn').focus({ preventScroll: true }); });
  let state = { version: 1, weeks: {}, templates: [] }, storageError = false;
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.version !== 1 || !parsed.weeks || typeof parsed.weeks !== 'object' || Array.isArray(parsed.weeks) || !Array.isArray(parsed.templates)) throw new Error();
      Object.entries(parsed.weeks).forEach(([start, week]) => { CanteenPlans.validate(week); if (start !== week.start) throw new Error(); });
      parsed.templates.forEach(template => { if (typeof template.name !== 'string') throw new Error(); CanteenPlans.validate(template.week); });
      state = parsed;
    }
  } catch { storageError = true; }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let start = CanteenPlans.monday(today()), active = false, tab = 'week', selectedDays = null, selectedSlot = '', kitchenDate = '', recipeContext = null, opener = null;
  const label = text => esc(t(text));
  const button = (text, attributes = '') => `<button type="button" class="btn" ${attributes}>${label(text)}</button>`;
  const number = (value, attributes = '') => `<input type="number" min="0" step="1" value="${value ?? ''}" ${attributes}>`;
  const dateLabel = value => new Intl.DateTimeFormat(language, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(CanteenPlans.date(value));
  const week = () => state.weeks[start] ||= CanteenPlans.create(start);
  const operating = () => week().days.filter((day, i) => week().operatingDays.includes(i));
  const recipe = id => recipes.find(r => r.id === id);
  function persist() {
    try { localStorage.setItem(key, JSON.stringify(state)); return true; }
    catch { toast(t('Could not save the plan on this device.')); return false; }
  }
  function commit() { persist(); render(); }
  function modal(title, html, bind) {
    opener = document.activeElement;
    dialog.innerHTML = `<div class="canteen-dialog-head"><h2 id="canteenDialogTitle">${label(title)}</h2>${button('Close', 'data-close')}</div><div class="canteen-dialog-body">${html}</div>`;
    dialog.setAttribute('aria-labelledby', 'canteenDialogTitle');
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    bind?.(dialog); dialog.showModal();
  }
  dialog.addEventListener('close', () => { printPreviewObserver?.disconnect(); printPreviewObserver = null; dialog.classList.remove('canteen-print-dialog'); document.body.classList.remove('canteen-printing'); document.getElementById('canteenPrint')?.remove(); if (opener?.isConnected) opener.focus(); });
  function open() {
    if (active || unlockDialog.open) return;
    unlockDialog.innerHTML = `<form data-pro-unlock><h2 id="proUnlockTitle">${label('Unlock Pro')}</h2><label for="proPassword">${label('Password')}</label><input id="proPassword" type="password" autocomplete="current-password" required autofocus><p data-pro-error role="alert"></p><div class="canteen-actions">${button('Cancel', 'data-pro-cancel')}<button type="submit" class="btn primary">${label('Unlock')}</button></div></form>`;
    unlockDialog.setAttribute('aria-labelledby', 'proUnlockTitle');
    unlockDialog.querySelector('[data-pro-cancel]').onclick = () => unlockDialog.close();
    unlockDialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const input = unlockDialog.querySelector('input'), submit = unlockDialog.querySelector('[type="submit"]'), error = unlockDialog.querySelector('[data-pro-error]');
      if (!input.value || submit.disabled) return;
      const attempt = ++unlockAttempt;
      submit.disabled = true; error.textContent = '';
      try {
        if (!PRO_PASSWORD_SHA256) throw new Error('Pro password has not been configured.');
        if (!globalThis.crypto?.subtle) throw new Error('Password checking requires HTTPS or localhost.');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.value));
        if (attempt !== unlockAttempt || !unlockDialog.open) return;
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        input.value = '';
        if (hash !== PRO_PASSWORD_SHA256) { error.textContent = t('Incorrect password. Try again.'); input.focus(); return; }
        unlockDialog.close(); enter();
      } catch (failure) {
        if (attempt === unlockAttempt && unlockDialog.open) error.textContent = t(failure.message === 'Pro password has not been configured.' || failure.message === 'Password checking requires HTTPS or localhost.' ? failure.message : 'Could not check the password. Try again.');
      } finally { submit.disabled = false; }
    };
    unlockDialog.showModal();
  }
  function restoreSession() {
    try { if (sessionStorage.getItem(sessionKey) === 'true') enter(); } catch {}
  }
  function enter() {
    try { sessionStorage.setItem(sessionKey, 'true'); } catch {}
    document.querySelector('.brand').textContent = 'QuickRecipe Pro';
    active = true; root.hidden = false; document.body.classList.add('canteen-active');
    document.getElementById('canteenBtn').setAttribute('aria-pressed', 'true'); render(); window.scrollTo(0, 0);
  }
  function close() {
    try { sessionStorage.removeItem(sessionKey); } catch {}
    if (recipeContext) returnToKitchen();
    document.querySelector('.brand').textContent = 'QuickRecipe';
    active = false; root.hidden = true; root.innerHTML = ''; if (dialog.open) dialog.close(); if (unlockDialog.open) unlockDialog.close(); document.body.classList.remove('canteen-active');
    document.getElementById('canteenBtn').setAttribute('aria-pressed', 'false'); window.scrollTo(0, 0); renderDetail();
  }
  function navigate(value) { if (recipeContext) returnToKitchen(); start = CanteenPlans.monday(value); selectedDays = null; selectedSlot = ''; kitchenDate = ''; render(); window.scrollTo(0, 0); }
  function render() {
    if (!active) return;
    if (storageError) { root.innerHTML = `<h1>${label('Canteen')}</h1><p role="alert">${label('Saved plans could not be read. Export a backup before resetting.')}</p>${button('Export saved data', 'data-backup')}${button('Reset plans', 'data-reset')}`;
      root.querySelector('[data-backup]').onclick = () => download(localStorage.getItem(key) || '', 'canteen-backup.json');
      root.querySelector('[data-reset]').onclick = () => { if (confirm(t('Reset plans?'))) { storageError = false; commit(); } }; return; }
    const plan = week();
    const weekScroll = root.querySelector('.canteen-days')?.scrollLeft || 0;
    root.innerHTML = `<div class="canteen-toolbar"><div class="canteen-week-picker"><button class="btn" data-prev aria-label="${label('Previous week')}" title="${label('Previous week')}">‹</button><label>${label('Week of')} <input type="date" data-week value="${start}"></label><button class="btn" data-next aria-label="${label('Next week')}" title="${label('Next week')}">›</button></div>
      <nav aria-label="${label('Canteen')}">${['week', 'requirements', 'kitchen'].map(value => button({ week: 'Week', requirements: 'Ingredients needed', kitchen: 'Kitchen' }[value], `data-tab="${value}" aria-pressed="${tab === value}"`)).join('')}</nav></div>
      <div id="canteenView"></div>`;
    root.querySelector('[data-prev]').onclick = () => navigate(CanteenPlans.shift(start, -7));
    root.querySelector('[data-next]').onclick = () => navigate(CanteenPlans.shift(start, 7));
    root.querySelector('[data-week]').onchange = e => { if (e.target.value) navigate(e.target.value); };
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (recipeContext) returnToKitchen(); tab = b.dataset.tab; render(); window.scrollTo(0, 0); root.querySelector(`[data-tab="${tab}"]`).focus({ preventScroll: true }); });
    if (tab === 'week') { renderWeek(plan); root.querySelector('.canteen-days').scrollLeft = weekScroll; } else if (tab === 'requirements') renderRequirements(); else renderKitchen();
  }
  function itemHtml(item, day) {
    const r = recipe(item.recipeId);
    return `<div class="canteen-menu-item" data-item="${esc(item.id)}"><strong>${esc(r ? recipeText(r.title) : t('Recipe unavailable'))}</strong>
      <div class="canteen-item-fields"><label>${label('Portions')}${number(item.portions, `data-portions placeholder="${day.defaultPortions}" aria-label="${label('Portions')} — ${esc(r ? recipeText(r.title) : item.recipeId)}"`)}</label>
      <label>${label('Version')}<input data-variant value="${esc(item.variant)}" placeholder="${label('e.g. Vegetarian')}"></label></div>
      <small>${label('Blank portions inherit the day total.')}</small>${r ? allergensHtml(r) : ''}
      <div class="canteen-item-actions">${r ? button('Recipe settings', 'data-settings') : ''}${button('Remove', 'data-remove')}</div></div>`;
  }
  function renderWeek(plan) {
    const el = root.querySelector('#canteenView');
    el.innerHTML = `<details class="canteen-week-actions"><summary>${label('Week actions')}</summary><div class="canteen-actions">${button('Configure week', 'data-config')}${button('Copy week', 'data-copy-week')}${button('Templates', 'data-templates')}${button('Print weekly menu', 'data-print-week')}${button('Allergen sheet', 'data-allergen-sheet')}</div></details>
      <div class="canteen-days" tabindex="0" role="region" aria-label="${label('Week')}" style="--canteen-day-count: ${operating().length}">${operating().map(day => `<article class="canteen-day" data-date="${day.date}"><header><h2>${esc(dateLabel(day.date))}</h2><label>${label('Portions to prepare')}${number(day.defaultPortions, 'data-default')}</label>${button('Copy day', 'data-copy-day')}<details class="canteen-notes" ${day.note ? 'open' : ''}><summary>${label('Kitchen note')}</summary><label>${label('Note for this day')}<textarea data-day-note rows="2" maxlength="1000" placeholder="${label('e.g. Serve lunch at 12:30')}">${esc(day.note || '')}</textarea></label></details></header>
      ${plan.slots.map(slot => { const items = day.items.filter(item => item.slotId === slot.id), total = CanteenPlans.totals(items, day); return `<section class="canteen-slot" data-slot="${esc(slot.id)}"><h3>${label(slot.label)}</h3>${items.map(item => itemHtml(item, day)).join('')}
        ${items.length ? `<p class="${total.mismatch ? 'canteen-warning' : 'canteen-total'}">${label('Total')}: ${total.total} / ${total.expected}${total.mismatch ? ` · ${label('Portion mismatch')}` : ''}</p>` : ''}${button('Add recipe', 'data-add')}</section>`; }).join('')}</article>`).join('')}</div>`;
    el.querySelector('[data-config]').onclick = configure;
    el.querySelector('[data-copy-week]').onclick = copyWeek;
    el.querySelector('[data-templates]').onclick = templates;
    el.querySelector('[data-print-week]').onclick = () => printSheet('Weekly menu', menuSheet(false));
    el.querySelector('[data-allergen-sheet]').onclick = () => printSheet('Allergens', menuSheet(true));
    el.querySelectorAll('[data-date]').forEach(card => {
      const day = plan.days.find(d => d.date === card.dataset.date);
      card.querySelector('[data-default]').onchange = e => { if (!e.target.value || !e.target.checkValidity()) return render(); day.defaultPortions = CanteenPlans.count(Number(e.target.value)); clearProgress(day); commit(); };
      card.querySelector('[data-day-note]').onchange = e => { day.note = e.target.value.trim().slice(0, 1000); persist(); };
      card.querySelector('[data-copy-day]').onclick = () => copyDay(day);
      card.querySelectorAll('[data-slot]').forEach(slot => slot.querySelector('[data-add]').onclick = () => searchRecipe(day, slot.dataset.slot));
      card.querySelectorAll('[data-item]').forEach(row => {
        const item = day.items.find(i => i.id === row.dataset.item);
        row.querySelector('[data-portions]').onchange = e => { if (!e.target.checkValidity()) return render(); item.portions = e.target.value === '' ? null : CanteenPlans.count(Number(e.target.value)); clearProgress(day); commit(); };
        row.querySelector('[data-variant]').onchange = e => { item.variant = e.target.value.trim(); commit(); };
        row.querySelector('[data-remove]').onclick = () => { day.items = day.items.filter(i => i !== item); delete week().production[item.id]; clearProgress(day); commit(); };
        row.querySelector('[data-settings]')?.addEventListener('click', () => recipeSettings(recipe(item.recipeId)));
      });
    });
  }
  function clearProgress(day) {
    day.items.forEach(item => { if (week().production[item.id]) week().production[item.id].completed = false; });
    Object.keys(week().production).filter(key => key.startsWith(`${day.date}:`)).forEach(key => delete week().production[key]);
  }
  function matchesMealSlot(r, slotId) {
    const slot = week().slots.find(entry => entry.id === slotId);
    const name = (slot?.label || '').trim().toLowerCase();
    const memberships = recipeMemberships(r);
    const categories = memberships.map(entry => entry.category.toLowerCase());
    const soup = ['soup', 'soups', 'polish soups'];
    const side = ['side', 'sides', 'salads', 'bread', 'polish breads'];
    if (soup.includes(name)) return categories.some(category => soup.includes(category));
    if (['side', 'sides'].includes(name)) return categories.some(category => side.includes(category));
    if (['dessert', 'desserts'].includes(name)) return memberships.some(entry => entry.section === 'desserts');
    if (['main', 'mains'].includes(name)) return memberships.some(entry => entry.section === 'meals' &&
      ![...soup, ...side].includes(entry.category.toLowerCase()));
    // Custom slots named after a category use that category; other custom slots stay flexible.
    const knownCategory = recipes.some(recipe => recipeMemberships(recipe).some(entry => entry.category.toLowerCase() === name));
    return !knownCategory || categories.includes(name);
  }
  function searchRecipe(day, slotId) {
    modal('Add recipe', `<label>${label('Search recipes')}<input type="search" data-search autofocus></label><div class="canteen-search-results" data-results></div>`, d => {
      const results = d.querySelector('[data-results]');
      const update = () => {
        const found = recipes.filter(r => matchesMealSlot(r, slotId) && matches(r, d.querySelector('[data-search]').value)).sort((a, b) => compareRecipeLabels(recipeText(a.title), recipeText(b.title)));
        results.innerHTML = found.length ? found.slice(0, 60).map(r => `<button class="btn" data-recipe="${esc(r.id)}">${esc(recipeText(r.title))}</button>`).join('') : `<p>${label('No recipes found.')}</p>`;
        results.querySelectorAll('[data-recipe]').forEach(b => b.onclick = () => { CanteenPlans.add(day, slotId, b.dataset.recipe); clearProgress(day); dialog.close(); commit(); });
      };
      d.querySelector('[data-search]').oninput = update; update();
    });
  }
  function configure() {
    const plan = week();
    modal('Configure week', `<fieldset><legend>${label('Operating days')}</legend>${plan.days.map((day, i) => `<label><input type="checkbox" data-operating="${i}" ${plan.operatingDays.includes(i) ? 'checked' : ''}>${esc(dateLabel(day.date))}</label>`).join('')}</fieldset>
      <p>${label('Courses')}</p><div data-slots>${plan.slots.map(slot => `<label data-slot-editor="${esc(slot.id)}"><input value="${esc(slot.label)}" aria-label="${label('Course')}"></label>`).join('')}</div>
      <p>${label('Clear a slot name to remove it. Assigned recipes must be removed first.')}</p>${button('Add course', 'data-new-slot')}${button('Save', 'data-save')}`, d => {
      d.querySelector('[data-new-slot]').onclick = () => { const row = document.createElement('label'); row.dataset.slotEditor = CanteenPlans.id(); row.innerHTML = `<input aria-label="${label('Course')}">`; d.querySelector('[data-slots]').append(row); row.firstChild.focus(); };
      d.querySelector('[data-save]').onclick = () => {
        const slots = [...d.querySelectorAll('[data-slot-editor]')].map(row => ({ id: row.dataset.slotEditor, label: row.querySelector('input').value.trim() })).filter(s => s.label);
        const days = [...d.querySelectorAll('[data-operating]:checked')].map(el => Number(el.dataset.operating));
        if (!slots.length || !days.length) return toast(t('Choose at least one day and one slot.'));
        if (plan.days.some(day => day.items.some(item => !slots.some(slot => slot.id === item.slotId)))) return toast(t('Remove assigned recipes before removing their slot.'));
        plan.slots = slots; plan.operatingDays = days; selectedDays = null; dialog.close(); commit();
      };
    });
  }
  function copyWeek() {
    modal('Copy week', `<label>${label('Destination week')}<input type="date" data-target value="${CanteenPlans.shift(start, 7)}"></label>${button('Copy', 'data-copy')}`, d => {
      d.querySelector('[data-copy]').onclick = () => {
        if (!d.querySelector('[data-target]').value) return;
        const target = CanteenPlans.monday(d.querySelector('[data-target]').value);
        if (target === start) return toast(t('Choose another week.'));
        if (state.weeks[target] && !confirm(t('Replace the destination plan?'))) return;
        state.weeks[target] = CanteenPlans.copyWeek(week(), target); dialog.close(); persist(); navigate(target);
      };
    });
  }
  function copyDay(source) {
    modal('Copy day', `<label>${label('Destination day')}<select data-target>${week().days.filter(day => day !== source).map(day => `<option value="${day.date}">${esc(dateLabel(day.date))}</option>`).join('')}</select></label>${button('Copy', 'data-copy')}`, d => {
      d.querySelector('[data-copy]').onclick = () => { const target = week().days.find(day => day.date === d.querySelector('[data-target]').value);
        if (target.items.length && !confirm(t('Replace the destination plan?'))) return;
        clearProgress(target); target.items.forEach(item => delete week().production[item.id]); CanteenPlans.copyDay(source, target); dialog.close(); commit(); };
    });
  }
  function templates() {
    modal('Templates', `<label>${label('Template name')}<input data-name></label>${button('Save menu as template', 'data-save-template')}
      <div class="canteen-search-results">${state.templates.map((entry, i) => `<div><strong>${esc(entry.name)}</strong>${button('Apply to this week', `data-template="${i}"`)}${button('Remove', `data-delete-template="${i}"`)}</div>`).join('')}</div>`, d => {
      d.querySelector('[data-save-template]').onclick = () => { const name = d.querySelector('[data-name]').value.trim(); if (!name) return; state.templates.push({ name, week: CanteenPlans.copyWeek(week(), start) }); dialog.close(); commit(); };
      d.querySelectorAll('[data-template]').forEach(b => b.onclick = () => { if (week().days.some(day => day.items.length) && !confirm(t('Replace the destination plan?'))) return;
        state.weeks[start] = CanteenPlans.copyWeek(state.templates[Number(b.dataset.template)].week, start); selectedDays = null; dialog.close(); commit(); });
      d.querySelectorAll('[data-delete-template]').forEach(b => b.onclick = () => { state.templates.splice(Number(b.dataset.deleteTemplate), 1); dialog.close(); commit(); });
    });
  }
  function download(text, name) { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function migrateRecipeIds(renamed) {
    Object.values(state.weeks).concat(state.templates.map(entry => entry.week)).forEach(plan => plan.days.forEach(day => day.items.forEach(item => { item.recipeId = renamed.get(item.recipeId) || item.recipeId; })));
    if (!storageError && (Object.keys(state.weeks).length || state.templates.length)) persist();
  }
  function requirements(items) { return RecipeMath.calculateRequirements(items, recipes, { ingredientValue: adjustedIngredientValue }); }
  function quantity(entry) { return familyShoppingAmount(entry).trim() + (!entry.unit ? ` · ${t('Unit unspecified')}` : ''); }
  function requirementsHtml(result) {
    return `<div class="canteen-requirements"><section class="canteen-panel"><h2>${label('Bases to prepare')}</h2>${result.bases.length ? `<ul>${result.bases.map(base => `<li><span>${esc(recipeText(base.title))}</span><strong>${esc(familyAmount(base.amount, base.unit))}</strong></li>`).join('')}</ul>` : `<p>${label('None required.')}</p>`}</section>
      <section class="canteen-panel"><h2>${label('Raw ingredients')}</h2>${result.ingredients.length ? `<ul>${result.ingredients.sort((a, b) => compareRecipeLabels(recipeText(a.name), recipeText(b.name))).map(entry => `<li><span>${esc(recipeText(entry.name))}</span><strong>${esc(quantity(entry))}</strong></li>`).join('')}</ul>` : `<p>${label('No ingredients required.')}</p>`}</section></div>`;
  }
  function calculationError(error) { const r = recipe(error.recipeId); return `<p role="alert" class="canteen-warning">${esc(r ? recipeText(r.title) : error.recipeId || '')}: ${label(error.message)}. ${label('Requirements are unavailable until this is resolved.')}</p>`; }
  async function copyIngredients(result) {
    const text = [t('Ingredients needed'), selectedDays.map(dateLabel).join(' · '),
      selectedSlot ? t(week().slots.find(slot => slot.id === selectedSlot).label) : t('All meals'), '',
      t('Bases to prepare'), ...result.bases.map(base => `${recipeText(base.title)} — ${familyAmount(base.amount, base.unit)}`), '',
      t('Raw ingredients'), ...result.ingredients.map(entry => `${recipeText(entry.name)} — ${quantity(entry)}`)].join('\n');
    try { await navigator.clipboard.writeText(text); toast(t('Copied')); }
    catch { modal('Copy ingredients', `<label>${label('Copy this text:')}<textarea data-copy-text rows="12" readonly>${esc(text)}</textarea></label>`, d => {
      const field = d.querySelector('[data-copy-text]'); field.focus(); field.select();
    }); }
  }
  function renderRequirements() {
    const days = operating(); if (selectedDays === null) selectedDays = days.map(day => day.date);
    const el = root.querySelector('#canteenView');
    el.innerHTML = `<h2>${label('Ingredients needed')}</h2><fieldset class="canteen-day-selection"><legend>${label('Select days')}</legend>${button('Entire week', 'data-all-days aria-pressed="false"')}${days.map(day => `<button type="button" class="btn" data-select-day="${day.date}" aria-pressed="${selectedDays.includes(day.date)}">${esc(dateLabel(day.date))}</button>`).join('')}</fieldset>
      <div class="canteen-actions canteen-filter-actions"><label class="canteen-inline-select"><span>${label('Course')}</span><select data-select-slot><option value="">${label('All meals')}</option>${week().slots.map(slot => `<option value="${esc(slot.id)}" ${selectedSlot === slot.id ? 'selected' : ''}>${label(slot.label)}</option>`).join('')}</select></label>${button('Print ingredients', 'data-print-requirements')}${button('Copy ingredients', 'data-copy-ingredients')}</div><div data-requirements-output></div>`;
    const update = () => {
      selectedDays = [...el.querySelectorAll('[data-select-day][aria-pressed="true"]')].map(e => e.dataset.selectDay); selectedSlot = el.querySelector('[data-select-slot]').value;
      el.querySelector('[data-all-days]').setAttribute('aria-pressed', String(selectedDays.length === days.length));
      const out = el.querySelector('[data-requirements-output]');
      try { const items = CanteenPlans.selected(week(), selectedDays, selectedSlot), result = requirements(items);
        out.innerHTML = requirementsHtml(result); const print = el.querySelector('[data-print-requirements]'); print.disabled = !items.length;
        const copy = el.querySelector('[data-copy-ingredients]'); copy.disabled = !items.length;
        copy.onclick = () => copyIngredients(result);
        print.onclick = () => printSheet('Ingredients needed', `<p>${selectedDays.map(day => esc(dateLabel(day))).join(' · ')} · ${selectedSlot ? label(week().slots.find(slot => slot.id === selectedSlot).label) : label('All meals')}</p>${requirementsHtml(result)}`);
      } catch (error) { out.innerHTML = calculationError(error); el.querySelector('[data-print-requirements]').disabled = true; el.querySelector('[data-copy-ingredients]').disabled = true; }
    };
    el.querySelector('[data-select-slot]').onchange = update;
    el.querySelectorAll('[data-select-day]').forEach(day => day.onclick = () => { day.setAttribute('aria-pressed', String(day.getAttribute('aria-pressed') !== 'true')); update(); });
    el.querySelector('[data-all-days]').onclick = () => {
      const selectAll = el.querySelector('[data-all-days]').getAttribute('aria-pressed') !== 'true';
      el.querySelectorAll('[data-select-day]').forEach(day => day.setAttribute('aria-pressed', String(selectAll))); update();
    }; update();
  }
  function renderKitchen() {
    const days = operating(); if (!days.some(day => day.date === kitchenDate)) kitchenDate = days[0].date;
    const day = days.find(day => day.date === kitchenDate), items = CanteenPlans.selected(week(), [day.date]);
    const el = root.querySelector('#canteenView');
    el.innerHTML = `<div class="canteen-actions canteen-filter-actions"><label class="canteen-inline-select"><span>${label('Day')}</span><select data-kitchen-day>${days.map(day => `<option value="${day.date}" ${day.date === kitchenDate ? 'selected' : ''}>${esc(dateLabel(day.date))}</option>`).join('')}</select></label>${button('Print kitchen sheet', 'data-print-production')}</div>
      <div class="canteen-kitchen"><h2>${esc(dateLabel(day.date))}</h2><p class="canteen-meals">${day.defaultPortions} ${label('Portions to prepare')}</p>${dayNoteHtml(day)}<div data-prepared></div><div data-production></div></div>`;
    el.querySelector('[data-kitchen-day]').onchange = e => { kitchenDate = e.target.value; render(); };
    let result;
    try { result = requirements(items); }
    catch (error) { el.querySelector('[data-prepared]').innerHTML = calculationError(error); }
    if (result?.bases.length) {
      el.querySelector('[data-prepared]').innerHTML = `<section class="canteen-panel"><h2>${label('Bases to prepare')}</h2>${result.bases.map(base => {
        const stateKey = `${day.date}:${base.id}`, signature = componentSignature(base);
        const checked = week().production[stateKey]?.completed && week().production[stateKey]?.signature === signature;
        return `<div class="canteen-production-row"><label><input type="checkbox" data-base-check="${esc(base.id)}" ${checked ? 'checked' : ''}>${esc(recipeText(base.title))} — ${esc(familyAmount(base.amount, base.unit))}</label>${button('Open recipe', `data-base-open="${esc(base.id)}"`)}</div>`;
      }).join('')}</section>`;
      el.querySelectorAll('[data-base-check]').forEach(check => check.onchange = () => { const base = result.bases.find(b => b.id === check.dataset.baseCheck);
        week().production[`${day.date}:${base.id}`] = { completed: check.checked, signature: componentSignature(base) }; persist(); });
      el.querySelectorAll('[data-base-open]').forEach(b => b.onclick = () => { const base = result.bases.find(entry => entry.id === b.dataset.baseOpen), r = recipe(base.id);
        openProduction(r, RecipeMath.foundationMultiplier({ recipeId: base.id, amount: base.amount, unit: base.unit }, recipes), familyAmount(base.amount, base.unit)); });
    }
    el.querySelector('[data-production]').innerHTML = week().slots.map(slot => {
      const group = items.filter(item => item.slotId === slot.id); if (!group.length) return '';
      return `<section class="canteen-panel"><h2>${label(slot.label)}</h2>${group.map(item => {
        const r = recipe(item.recipeId), progress = week().production[item.id] || {}, config = progress.batch || { mode: 'count', value: 1 };
        let batches, error;
        try { batches = RecipeMath.batches(item.portions, config); if (!r) throw new Error('Recipe unavailable'); RecipeMath.scaleRecipe(r, item.portions); } catch (e) { error = e; }
        const checked = progress.completed && progress.signature === productionSignature(item);
        return `<article class="canteen-production-item" data-production-item="${esc(item.id)}"><label class="canteen-production-check"><input type="checkbox" data-complete ${checked ? 'checked' : ''} ${error ? 'disabled' : ''}><span><strong>${esc(r ? recipeText(r.title) : t('Recipe unavailable'))}</strong>${item.variant ? ` · ${esc(item.variant)}` : ''}<br>${item.portions} ${label('Portions')}</span></label>
          ${r ? allergensHtml(r) : ''}${error ? `<p class="canteen-warning">${label(error.message)}</p>${r ? button('Recipe settings', 'data-settings') : ''}` : `<div class="canteen-actions">${button('Open full recipe', 'data-open-full')}</div><details class="canteen-batch-options" ${progress.batch ? 'open' : ''}><summary>${label('Split into batches')}</summary><div class="canteen-batches"><label>${label('Split by')}<select data-batch-mode><option value="count" ${config.mode === 'count' ? 'selected' : ''}>${label('Number of batches')}</option><option value="maximum" ${config.mode === 'maximum' ? 'selected' : ''}>${label('Maximum portions per batch')}</option></select></label><label>${label(config.mode === 'maximum' ? 'Maximum portions per batch' : 'Number of batches')}${number(config.value, 'data-batch-value')}</label></div><p>${batches.count} × ${fmt(batches.perBatch)} ${label('Portions per batch')}</p><div class="canteen-actions">${button('Open one batch', `data-open-batch ${!batches.count ? 'disabled' : ''}`)}</div></details>`}</article>`;
      }).join('')}</section>`;
    }).join('') || `<p>${label('No meals planned for this day.')}</p>`;
    el.querySelectorAll('[data-production-item]').forEach(row => {
      const item = items.find(i => i.id === row.dataset.productionItem), r = recipe(item.recipeId);
      row.querySelector('[data-complete]').onchange = e => { const progress = week().production[item.id] ||= {}; progress.completed = e.target.checked; progress.signature = productionSignature(item); persist(); };
      row.querySelector('[data-settings]')?.addEventListener('click', () => recipeSettings(r));
      const saveBatch = () => {
        const value = Number(row.querySelector('[data-batch-value]').value), mode = row.querySelector('[data-batch-mode]').value;
        if (value <= 0) { toast(t('Invalid batch size')); return render(); }
        try { RecipeMath.batches(item.portions, { mode, value }); } catch (error) { toast(t(error.message)); return render(); }
        (week().production[item.id] ||= {}).batch = { mode, value }; commit();
      };
      row.querySelector('[data-batch-mode]')?.addEventListener('change', saveBatch);
      row.querySelector('[data-batch-value]')?.addEventListener('change', saveBatch);
      row.querySelector('[data-open-full]')?.addEventListener('click', () => openProduction(r, RecipeMath.scaleRecipe(r, item.portions).factor, `${item.portions} ${t('Portions')}`));
      row.querySelector('[data-open-batch]')?.addEventListener('click', () => { const batch = RecipeMath.batches(item.portions, week().production[item.id]?.batch);
        openProduction(r, RecipeMath.scaleRecipe(r, batch.perBatch).factor, `${item.portions} ${t('Portions')} · ${batch.count} × ${fmt(batch.perBatch)}`); });
    });
    el.querySelector('[data-print-production]').onclick = () => printSheet('Kitchen sheet', `<p class="kitchen-sheet-date">${esc(dateLabel(day.date))} · ${day.defaultPortions} ${label('Portions to prepare')}</p>${dayNoteHtml(day)}${productionSheet(items, result)}`, 'kitchen-sheet');
  }
  function componentSignature(base) {
    const r = recipe(base.id);
    return JSON.stringify([base.amount, base.unit, RecipeMath.expandFoundationRequirements(r, RecipeMath.foundationMultiplier({ recipeId: base.id, amount: base.amount, unit: base.unit }, recipes), recipes, { ingredientValue: adjustedIngredientValue }), r.steps]);
  }
  function productionSignature(item) {
    try { return JSON.stringify([item.portions, requirements([item]), recipe(item.recipeId)?.steps]); } catch { return ''; }
  }
  function openProduction(r, multiplier, total) {
    if (!recipeContext) recipeContext = { selectedId, scale, view, unit, focusedSection, recipeSection, category, onlyFavs,
      search: document.getElementById('search').value, listScroll: document.getElementById('list').scrollTop, listScrollTop, recipeHistory: [...recipeHistory], familyHistory: [...familyHistory],
      kitchenScroll: window.scrollY, reading: document.querySelector('.app').classList.contains('reading-recipe'), detailScroll: document.getElementById('detail').scrollTop };
    recipeContext.recipeId = r.id; recipeContext.total = total;
    document.body.classList.add('canteen-recipe');
    unit = 'metric'; openFamilyRecipe(r.id, multiplier); decorateRecipe();
    document.getElementById('detail').scrollIntoView?.({ block: 'start' });
  }
  function decorateRecipe() {
    if (!recipeContext) return;
    const detail = document.getElementById('detail'); detail.querySelector('.canteen-recipe-context')?.remove();
    const banner = document.createElement('div'); banner.className = 'canteen-recipe-context';
    const r = recipe(selectedId);
    banner.innerHTML = `${button('Back to kitchen', 'data-return-kitchen')}${button('Recipe settings', 'data-recipe-settings')}<p>${label('Production requirement')}: <strong>${esc(recipeContext.total)}</strong></p><p>${label('Original yield')}: ${esc(r?.yield ? recipeText(r.yield) : r?.batchYield ? familyAmount(r.batchYield.amount, r.batchYield.unit) : t('Not declared'))}${RecipeMath.servingYield(r || {}) ? ` · ${RecipeMath.servingYield(r)} ${label('Portions')}` : ''} · ${label('Scale')}: <strong>${fmt(scale)}×</strong></p>`;
    banner.querySelector('[data-recipe-settings]').onclick = () => recipeSettings(r);
    banner.querySelector('[data-return-kitchen]').onclick = returnToKitchen; detail.prepend(banner);
  }
  function returnToKitchen() {
    if (!recipeContext) return;
    const old = recipeContext; recipeContext = null;
    ({ selectedId, scale, view, unit, focusedSection, recipeSection, category, onlyFavs, listScrollTop, recipeHistory, familyHistory } = old);
    document.getElementById('search').value = old.search;
    document.querySelector('.app').classList.toggle('reading-recipe', old.reading);
    document.body.classList.remove('canteen-recipe');
    tab = 'kitchen'; window.render(); document.getElementById('detail').scrollTop = old.detailScroll; document.getElementById('list').scrollTop = old.listScroll; window.scrollTo(0, old.kitchenScroll);
  }
  function productionSheet(items, result) {
    const row = (checked, title, amount, detail = '') => `<li class="kitchen-sheet-row"><span class="kitchen-sheet-check" role="img" aria-label="${label(checked ? 'Checked' : 'Not checked')}">${checked ? '✓' : ''}</span><div class="kitchen-sheet-item"><div class="kitchen-sheet-line"><strong>${esc(title)}</strong><strong class="kitchen-sheet-amount">${esc(amount)}</strong></div>${detail}</div></li>`;
    return `${result?.bases.length ? `<h2>${label('Bases to prepare')}</h2><ul>${result.bases.map(base => row(
      week().production[`${kitchenDate}:${base.id}`]?.completed && week().production[`${kitchenDate}:${base.id}`]?.signature === componentSignature(base),
      recipeText(base.title), familyAmount(base.amount, base.unit))).join('')}</ul>` : ''}
      ${week().slots.map(slot => { const group = items.filter(item => item.slotId === slot.id); return !group.length ? '' : `<h2>${label(slot.label)}</h2><ul>${group.map(item => {
        const r = recipe(item.recipeId), progress = week().production[item.id], batch = RecipeMath.batches(item.portions, progress?.batch);
        return row(progress?.completed && progress.signature === productionSignature(item),
          (r ? recipeText(r.title) : t('Recipe unavailable')) + (item.variant ? ` (${item.variant})` : ''),
          `${item.portions} ${t('Portions')}`, `${batch.count > 1 ? `<p class="kitchen-sheet-batch">${batch.count} × ${fmt(batch.perBatch)} ${label('Portions per batch')}</p>` : ''}${r ? allergensHtml(r) : ''}`);
      }).join('')}</ul>`; }).join('')}${!result ? `<p>${label('Ingredient requirements could not be calculated. Check recipe settings.')}</p>` : ''}`;
  }

  function recipeSettings(r) {
    const allergenFields = (values, attribute) => Object.entries(RecipeMath.allergens).map(([id, name]) => `<label><input type="checkbox" ${attribute}="${id}" ${values?.includes(id) ? 'checked' : ''}>${label(name)}</label>`).join('');
    modal('Recipe settings', `<h3>${esc(recipeText(r.title))}</h3><p>${label('Original yield')}: ${esc(r.yield ? recipeText(r.yield) : t('Not declared'))}${r.batchYield ? ` · ${esc(familyAmount(r.batchYield.amount, r.batchYield.unit))}` : ''}</p>
      <label>${label('Recipe portions')}${number(RecipeMath.servingYield(r), 'data-servings')}</label><p>${label('How many portions does this recipe make?')}</p>
      <div><h3>${label('Ingredient allergens')}</h3><p>${label('Select the allergens in each ingredient, or choose No allergens identified. Green means checked.')}</p><p class="canteen-review-progress" data-review-progress role="status"></p></div>
      ${r.ingredients.map((ingredient, index) => { const declared = RecipeMath.ingredientAllergens(r, ingredient[0]); return `<details class="canteen-allergen-editor" data-ingredient="${index}"><summary><span class="canteen-ingredient-name">${esc(recipeText(cleanIngredientName(ingredient[0])))}</span><span class="canteen-review-status" data-review-status></span><span class="canteen-review-allergens" data-review-allergens></span></summary><fieldset ${RecipeMath.isPlainWater(ingredient[0]) ? 'disabled' : ''}><legend>${label('Allergens')}</legend>
        <label><input type="checkbox" data-reviewed ${Array.isArray(declared) ? 'checked' : ''}>${label('Ingredient checked')}</label><div class="canteen-allergen-options">${allergenFields(declared, 'data-allergen')}</div>${button('No allergens identified', 'data-no-allergens')}</fieldset></details>`; }).join('')}
      <details><summary>${label('Recipe adjustments')}</summary><p>${label('These changes override the allergens from ingredients and base recipes.')}</p><fieldset><legend>${label('Add allergens')}</legend>${allergenFields(r.allergenAdjustments?.add, 'data-allergen-add')}</fieldset><fieldset><legend>${label('Remove allergens')}</legend>${allergenFields(r.allergenAdjustments?.remove, 'data-allergen-remove')}</fieldset></details>
      <div class="canteen-settings-save"><small>${label('Save to keep your changes.')}</small>${button('Save', 'data-save-settings')}</div>${(r.foundations || []).map(f => `<button class="btn" data-review-foundation="${esc(f.recipeId)}">${label('Save and check base recipe')}: ${esc(recipeText(recipe(f.recipeId)?.title || f.recipeId))}</button>`).join('')}`, d => {
      const updateReview = () => {
        const rows = [...d.querySelectorAll('[data-ingredient]')];
        let checkedCount = 0;
        rows.forEach(row => {
          const checked = row.querySelector('[data-reviewed]').checked;
          if (checked) checkedCount++;
          row.classList.toggle('is-reviewed', checked);
          row.querySelector('[data-review-status]').textContent = `${checked ? '✓' : '○'} ${t(checked ? 'Checked' : 'Not checked')}`;
          const names = [...row.querySelectorAll('[data-allergen]:checked')].map(input => t(RecipeMath.allergens[input.dataset.allergen]));
          row.querySelector('[data-review-allergens]').textContent = checked ? (names.join(' · ') || t('No allergens identified')) : t('Choose allergens or confirm none.');
        });
        d.querySelector('[data-review-progress]').textContent = `${checkedCount} / ${rows.length} ${t('ingredients checked')}`;
      };
      d.querySelectorAll('[data-ingredient]').forEach(row => {
        row.querySelector('[data-reviewed]').onchange = updateReview;
        row.querySelectorAll('[data-allergen]').forEach(check => check.onchange = () => {
          row.querySelector('[data-reviewed]').checked = true; updateReview();
        });
        row.querySelector('[data-no-allergens]').onclick = () => {
          row.querySelectorAll('[data-allergen]').forEach(check => { check.checked = false; });
          row.querySelector('[data-reviewed]').checked = true; updateReview(); row.open = false;
        };
      });
      updateReview();
      const saveSettings = () => {
        const input = d.querySelector('[data-servings]');
        if (input.value && (!input.checkValidity() || Number(input.value) <= 0)) return toast(t('Declare the base serving count'));
        if (input.value) r.servings = Number(input.value); else delete r.servings;
        r.ingredientAllergens = Object.create(null);
        d.querySelectorAll('[data-ingredient]').forEach(row => { if (row.querySelector('[data-reviewed]').checked) r.ingredientAllergens[r.ingredients[Number(row.dataset.ingredient)][0]] = [...row.querySelectorAll('[data-allergen]:checked')].map(check => check.dataset.allergen); });
        r.allergenAdjustments = { add: [...d.querySelectorAll('[data-allergen-add]:checked')].map(check => check.dataset.allergenAdd), remove: [...d.querySelectorAll('[data-allergen-remove]:checked')].map(check => check.dataset.allergenRemove) };
        try { saveAll(); } catch { return toast(t('Could not save the plan on this device.')); } dialog.close(); commit(); renderDetail(); return true;
      };
      d.querySelector('[data-save-settings]').onclick = saveSettings;
      d.querySelectorAll('[data-review-foundation]').forEach(b => b.onclick = () => { const next = recipe(b.dataset.reviewFoundation); if (next && saveSettings()) recipeSettings(next); });
    });
  }
  function dayNoteHtml(day) {
    return day.note ? `<p class="canteen-day-note"><strong>${label('Kitchen note')}:</strong> ${esc(day.note)}</p>` : '';
  }
  function allergensHtml(r) { return declaredAllergensHtml(r); }
  function menuSheet(allergensOnly) {
    return operating().map(day => `<section class="canteen-print-day"><div class="print-day-heading"><h2>${esc(dateLabel(day.date))}</h2><p>${day.defaultPortions} ${label('Portions to prepare')}</p></div>${dayNoteHtml(day)}${week().slots.map(slot => {
      const items = day.items.filter(item => item.slotId === slot.id); if (!items.length) return '';
      const total = CanteenPlans.totals(items, day);
      return `<h3>${label(slot.label)}${allergensOnly ? '' : ` · ${label('Total')}: ${total.total}${total.mismatch ? ` / ${total.expected} · ${label('Portion mismatch')}` : ''}`}</h3><ul>${items.map(item => { const r = recipe(item.recipeId); return `<li><div class="print-menu-line"><strong>${esc(r ? recipeText(r.title) : t('Recipe unavailable'))}${item.variant ? ` (${esc(item.variant)})` : ''}</strong><span>${CanteenPlans.portions(item, day)} ${label('Portions')}</span></div>${r ? allergensHtml(r) : ''}</li>`; }).join('')}</ul>`;
    }).join('')}</section>`).join('');
  }
  function printSheet(title, html, layout = '') {
    document.getElementById('canteenPrint')?.remove();
    const sheet = document.createElement('section'); sheet.id = 'canteenPrint'; sheet.className = `canteen-print print-document ${layout}`;
    sheet.innerHTML = `<header><p>QuickRecipe Pro · ${label('Week of')} ${start}</p><h1>${label(title)}</h1></header>${html}`;
    document.body.append(sheet); document.body.classList.add('canteen-printing');
    modal(title, `<p>${label('Use Print to print or save as PDF.')}</p><button type="button" class="btn canteen-print-button" data-print><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6zM18 12h.01"/></svg><span>${label('Print')}</span></button><div class="print-preview-stage"><div class="canteen-print-preview print-document ${layout}">${sheet.innerHTML}</div></div>`, d => {
      d.classList.add('canteen-print-dialog');
      const stage = d.querySelector('.print-preview-stage'), preview = stage.firstElementChild;
      const fitPreview = () => { preview.style.zoom = Math.min(1, (stage.clientWidth - parseFloat(getComputedStyle(stage).paddingLeft) - parseFloat(getComputedStyle(stage).paddingRight)) / preview.offsetWidth); };
      if (typeof ResizeObserver !== 'undefined') {
        printPreviewObserver = new ResizeObserver(fitPreview);
        printPreviewObserver.observe(stage);
      }
      d.querySelector('[data-print]').onclick = () => window.print();
    });
  }
  document.getElementById('canteenExitBtn').onclick = close;
  document.getElementById('canteenBtn').onclick = () => active ? close() : open();
  return { open, close, restoreSession, render, decorateRecipe, migrateRecipeIds, get active() { return active; }, get productionRecipe() { return !!recipeContext; } };
})();
