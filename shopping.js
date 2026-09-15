/* Shopping quantities are user-entered text, separate from recipe scaling. */
Object.assign(UI_MESSAGES.pl, {
  'Shopping lists':'Listy zakupów','Shopping list':'Lista zakupów','Create shopping list':'Utwórz listę zakupów','Edit ingredients':'Edytuj składniki','Select the ingredients you need to buy.':'Wybierz składniki, które chcesz kupić.','View list':'Zobacz listę','Amount to buy (optional)':'Ilość do kupienia (opcjonalnie)','e.g. 2 bags':'np. 2 opakowania','Copy':'Kopiuj','Share…':'Udostępnij…','Close':'Zamknij','Remove list':'Usuń listę','No shopping lists yet.':'Nie ma jeszcze list zakupów.','Copied':'Skopiowano','Copy this text:':'Skopiuj ten tekst:','Sharing is unavailable. Copy the list instead.':'Udostępnianie jest niedostępne. Skopiuj listę.','Could not save shopping list on this device.':'Nie udało się zapisać listy zakupów na tym urządzeniu.'
});
Object.assign(UI_MESSAGES.is, {
  'Shopping lists':'Innkaupalistar','Shopping list':'Innkaupalisti','Create shopping list':'Búa til innkaupalista','Edit ingredients':'Breyta hráefnum','Select the ingredients you need to buy.':'Veldu hráefnin sem þú þarft að kaupa.','View list':'Skoða lista','Amount to buy (optional)':'Magn til að kaupa (valfrjálst)','e.g. 2 bags':'t.d. 2 pokar','Copy':'Afrita','Share…':'Deila…','Close':'Loka','Remove list':'Eyða lista','No shopping lists yet.':'Engir innkaupalistar enn.','Copied':'Afritað','Copy this text:':'Afritaðu þennan texta:','Sharing is unavailable. Copy the list instead.':'Ekki er hægt að deila. Afritaðu listann í staðinn.','Could not save shopping list on this device.':'Ekki tókst að vista innkaupalistann í þessu tæki.'
});
const shoppingShareMessages = {
  'This browser does not support the device share menu. Copy the list and paste it into your app.': ['Ta przeglądarka nie obsługuje systemowego menu udostępniania. Skopiuj listę i wklej ją do wybranej aplikacji.', 'Þessi vafri styður ekki deilingarvalmynd tækisins. Afritaðu listann og límdu hann í appið þitt.'],
  'Sharing needs HTTPS or localhost. Copy the list for now.': ['Udostępnianie wymaga HTTPS lub localhost. Na razie skopiuj listę.', 'Deiling krefst HTTPS eða localhost. Afritaðu listann í bili.'],
  'The browser blocked sharing. Open QuickRecipe directly in your browser and try again, or copy the list.': ['Przeglądarka zablokowała udostępnianie. Otwórz QuickRecipe bezpośrednio w przeglądarce i spróbuj ponownie lub skopiuj listę.', 'Vafrinn lokaði á deilingu. Opnaðu QuickRecipe beint í vafranum og reyndu aftur eða afritaðu listann.'],
  'Could not open the share menu. Try again or copy the list.': ['Nie udało się otworzyć menu udostępniania. Spróbuj ponownie lub skopiuj listę.', 'Ekki tókst að opna deilingarvalmyndina. Reyndu aftur eða afritaðu listann.']
};
for (const [key, values] of Object.entries(shoppingShareMessages)) {
  UI_MESSAGES.pl[key] = values[0]; UI_MESSAGES.is[key] = values[1];
}
const shopping = (() => {
  const key = 'quickrecipe.shopping.v1';
  let lists = {}, editing = null, draft = new Map(), opener = null;
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [id,list] of Object.entries(stored)) {
        if (typeof list?.title === 'string' && Array.isArray(list.items)) lists[id] = {
          title:list.title, items:list.items.filter(i => typeof i?.name === 'string').map(i => ({name:i.name, amount:typeof i.amount === 'string' ? i.amount : '', bought:i.bought === true}))
        };
      }
    }
  } catch {}
  const dialog = document.createElement('dialog');
  dialog.className = 'shopping-dialog';
  dialog.setAttribute('aria-labelledby','shoppingTitle');
  document.body.append(dialog);
  function save() { try { localStorage.setItem(key,JSON.stringify(lists)); } catch { toast(t('Could not save shopping list on this device.')); } }
  function close() { dialog.close(); if (opener?.isConnected) opener.focus(); }
  function shell(title) {
    dialog.innerHTML = `<div class="shopping-heading"><h2 id="shoppingTitle">${esc(title)}</h2><button class="btn" data-close>${esc(t('Close'))}</button></div><div class="shopping-content"></div>`;
    dialog.querySelector('[data-close]').onclick = close;
    if (!dialog.open) { opener = document.activeElement; dialog.showModal(); }
    return dialog.querySelector('.shopping-content');
  }
  dialog.addEventListener('click', e => { if (e.target === dialog) { const b=dialog.getBoundingClientRect(); if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom) close(); } });
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  function all() {
    const body=shell(t('Shopping lists'));
    const ids=Object.keys(lists).filter(id=>lists[id].items.length);
    if (!ids.length) body.textContent=t('No shopping lists yet.');
    ids.forEach(id=>{ const b=document.createElement('button'); b.className='btn shopping-list-link'; b.textContent=recipeText(lists[id].title); b.onclick=()=>open(id); body.append(b); });
  }
  function exportText(list) {
    return `${t('Shopping list')} — ${recipeText(list.title)}\n\n` + list.items.map(i=>`${i.bought?'☑':'☐'} ${recipeText(i.name)}${i.amount.trim()?' — '+i.amount.trim():''}`).join('\n');
  }
  function open(id) {
    const list=lists[id]; if(!list) return;
    const body=shell(t('Shopping list'));
    body.innerHTML=`<h3>${esc(recipeText(list.title))}</h3><div class="shopping-items"></div><div class="shopping-footer"><button class="btn" data-edit>${esc(t('Edit ingredients'))}</button><button class="btn" data-copy>${esc(t('Copy'))}</button><button class="btn primary" data-share>${esc(t('Share…'))}</button><button class="btn ghost-danger" data-remove>${esc(t('Remove list'))}</button></div><p role="status"></p><textarea class="shopping-export" aria-label="${esc(t('Copy this text:'))}" readonly hidden></textarea>`;
    const status=body.querySelector('[role=status]');
    const fallback = message => { status.textContent=message; const area=body.querySelector('textarea'); area.hidden=false; area.value=exportText(list); area.focus(); area.select(); };
    list.items.forEach(item=>{
      const row=document.createElement('div'); row.className='shopping-row';
      const label=document.createElement('label'); label.className='shopping-item-name';
      const check=document.createElement('input'); check.type='checkbox'; check.checked=item.bought;
      const name=document.createElement('span'); name.textContent=recipeText(item.name); name.classList.toggle('bought',item.bought);
      check.onchange=()=>{item.bought=check.checked; name.classList.toggle('bought',item.bought); save();};
      label.append(check,name);
      const amountLabel=document.createElement('label'); amountLabel.className='shopping-amount';
      const caption=document.createElement('span'); caption.textContent=t('Amount to buy (optional)');
      const amount=document.createElement('input'); amount.type='text'; amount.value=item.amount; amount.placeholder=t('e.g. 2 bags'); amount.setAttribute('aria-label',`${t('Amount to buy (optional)')} — ${recipeText(item.name)}`);
      amount.oninput=()=>{item.amount=amount.value;save();body.querySelector('textarea').hidden=true;status.textContent='';};
      amountLabel.append(caption,amount);row.append(label,amountLabel);body.querySelector('.shopping-items').append(row);
    });
    body.querySelector('[data-copy]').onclick=async()=>{try { await navigator.clipboard.writeText(exportText(list)); status.textContent=t('Copied'); } catch { fallback(t('Copy this text:')); }};
    body.querySelector('[data-share]').onclick=async()=>{
      if(window.isSecureContext === false) { fallback(t('Sharing needs HTTPS or localhost. Copy the list for now.')); return; }
      if(typeof navigator.share !== 'function') { fallback(t('This browser does not support the device share menu. Copy the list and paste it into your app.')); return; }
      const button=body.querySelector('[data-share]');
      button.disabled=true;
      try { await navigator.share({title:recipeText(list.title),text:exportText(list)}); }
      catch(e) {
        if(e.name!=='AbortError') fallback(t(e.name==='NotAllowedError'
          ? 'The browser blocked sharing. Open QuickRecipe directly in your browser and try again, or copy the list.'
          : 'Could not open the share menu. Try again or copy the list.'));
      } finally { button.disabled=false; }
    };
    body.querySelector('[data-remove]').onclick=()=>{delete lists[id];save();all();renderDetail();};
    const edit=body.querySelector('[data-edit]'); edit.disabled=!recipes.some(r=>r.id===id);
    edit.onclick=()=>{close();recipeSection='All';category='All';onlyFavs=false;document.getElementById('search').value='';selectedId=id;render();openDetailPanel();start(recipes.find(r=>r.id===id));};
  }
  function start(r) { editing=r.id;draft=new Map((lists[r.id]?.items||[]).map(i=>[i.name,{...i}])); focusedSection=null;renderDetail(); }
  function decorate(r) {
    if(editing && editing!==r.id) {editing=null;draft.clear();}
    const actions=document.querySelector('.detail-actions');
    const button=document.createElement('button');button.className='btn shopping-start';button.id='shoppingStart';
    button.textContent=t(lists[r.id]?.items.length?'Shopping list':'Create shopping list');
    button.onclick=()=>lists[r.id]?.items.length?open(r.id):start(r);actions.append(button);
    if(editing!==r.id)return;
    button.hidden=true;
    document.querySelectorAll('.ingredient-section').forEach(b=>b.disabled=true);
    const pane=document.querySelector('.detail-body .pane');
    const controls=document.createElement('div');controls.className='shopping-selection';
    controls.innerHTML=`<p>${esc(t('Select the ingredients you need to buy.'))}</p><div><button class="btn" data-cancel>${esc(t('Cancel'))}</button> <button class="btn primary" data-view-list></button></div>`;
    pane.insertBefore(controls,pane.querySelector('.ingredient-section, .ingredient'));
    const viewButton=controls.querySelector('[data-view-list]');
    function update(){viewButton.textContent=`${t('View list')} (${draft.size})`;viewButton.disabled=!draft.size;}
    controls.querySelector('[data-cancel]').onclick=()=>{editing=null;draft.clear();renderDetail();};
    viewButton.onclick=()=>{lists[r.id]={title:r.title,items:[...draft.values()]};save();editing=null;renderDetail();open(r.id);};
    pane.querySelectorAll('.ingredient').forEach((row,index)=>{
      const name=cleanIngredientName(r.ingredients[index][0]);
      const check=document.createElement('input');check.type='checkbox';check.checked=draft.has(name);check.dataset.shoppingName=name;check.setAttribute('aria-label',recipeText(name));
      check.onchange=()=>{ if(check.checked)draft.set(name,{name,amount:'',bought:false});else draft.delete(name);pane.querySelectorAll('[data-shopping-name]').forEach(c=>c.checked=draft.has(c.dataset.shoppingName));update(); };
      const label=document.createElement('label');label.className='shopping-select-name';const text=row.firstElementChild;label.append(check,text);row.prepend(label);
    });update();
  }
  function migrateRecipeIds(renamed, collection) {
    let changed = false;
    for (const [oldId, newId] of renamed) {
      if (!lists[oldId] || lists[newId]) continue;
      lists[newId] = { ...lists[oldId], title: collection.find(r => r.id === newId)?.title || lists[oldId].title };
      delete lists[oldId];
      changed = true;
    }
    if (changed) save();
  }
  return {decorate,all,exportText,migrateRecipeIds};
})();
