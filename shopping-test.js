const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const files = JSON.parse(fs.readFileSync('recipes/index.json')).files;
const data = Object.fromEntries(files.map(f=>['/recipes/'+f,JSON.parse(fs.readFileSync('recipes/'+f))]));
data['/recipes/index.json']={files};
for(const lang of ['pl','is'])data['/translations/'+lang+'.json']=JSON.parse(fs.readFileSync('translations/'+lang+'.json'));
function setup(saved) {
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost',runScripts:'dangerously',beforeParse(w){
  w.matchMedia=()=>({matches:false,addEventListener(){}});
  w.fetch=async url=>({ok:true,json:async()=>data[new URL(url,'http://localhost').pathname]});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  if(saved)w.localStorage.setItem('quickrecipe.shopping.v1',saved);
 }});
 const script=dom.window.document.createElement('script');script.textContent=['i18n.js','shopping.js','app.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n');dom.window.document.body.append(script);return dom;
}
(async()=>{
 const dom=setup();await new Promise(r=>setTimeout(r,80));const w=dom.window,d=w.document;
 d.querySelector('#shoppingStart').click();
 const checks=[...d.querySelectorAll('[data-shopping-name]')];assert(checks.length);
 checks[0].click();checks[1].click();d.querySelector('[data-view-list]').click();assert(d.querySelector('dialog').open);
 const amount=d.querySelector('.shopping-amount input');amount.value='2 bags';amount.dispatchEvent(new w.Event('input'));
 let copied;Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
 d.querySelector('[data-copy]').click();await Promise.resolve();assert(copied.includes(' — 2 bags'));assert(!copied.includes('500 g'));
 let shared;w.navigator.share=async value=>{shared=value;};d.querySelector('[data-share]').click();await Promise.resolve();assert.equal(shared.text,copied);
 d.querySelector('.shopping-item-name input').click();d.querySelector('[data-copy]').click();await Promise.resolve();assert(copied.includes('☑'));
 d.querySelector('[data-edit]').click();d.querySelector('[data-view-list]').click();assert.equal(d.querySelector('.shopping-amount input').value,'2 bags');
 const stored=w.localStorage.getItem('quickrecipe.shopping.v1');dom.window.close();
 const restored=setup(stored);await new Promise(r=>setTimeout(r,80));const rd=restored.window.document;rd.querySelector('#shoppingListsBtn').click();rd.querySelector('.shopping-list-link').click();assert.equal(rd.querySelector('.shopping-amount input').value,'2 bags');assert(rd.querySelector('.shopping-item-name input').checked);
 rd.querySelector('[data-share]').click();await Promise.resolve();assert(!rd.querySelector('.shopping-export').hidden);
 assert(rd.querySelector('.shopping-content [role=status]').textContent.includes('does not support'));
 restored.window.navigator.share=async()=>{throw new restored.window.DOMException('blocked','NotAllowedError');};
 rd.querySelector('[data-share]').click();await new Promise(r=>setTimeout(r,0));assert(rd.querySelector('.shopping-content [role=status]').textContent.includes('blocked'));
 rd.querySelector('.shopping-export').hidden=true;
 restored.window.navigator.share=async()=>{throw new restored.window.DOMException('cancelled','AbortError');};
 rd.querySelector('[data-share]').click();await new Promise(r=>setTimeout(r,0));assert(rd.querySelector('.shopping-export').hidden);assert(!rd.querySelector('[data-share]').disabled);
 
 rd.querySelector('[data-remove]').click();assert.equal(rd.querySelectorAll('.shopping-list-link').length,0);restored.window.close();
 const truffleDom=setup();await new Promise(r=>setTimeout(r,80));const td=truffleDom.window.document;
 td.querySelector('[data-browse="desserts"]').click();td.querySelector('[data-cat="Truffles"]').click();
 td.querySelector('[data-id="strawberry-white-chocolate-truffles"]').click();td.querySelector('#shoppingStart').click();
 const truffleChecks=[...td.querySelectorAll('[data-shopping-name]')];
 const ingredientNames=truffleChecks.map(el=>el.dataset.shoppingName);
 assert(ingredientNames.includes('White chocolate, finely chopped'));
 assert(ingredientNames.includes('White chocolate for coating'));
 assert(ingredientNames.includes('Crushed freeze-dried strawberries, for topping'));
 truffleChecks.forEach(el=>el.click());td.querySelector('[data-view-list]').click();
 assert.deepEqual([...td.querySelectorAll('.shopping-item-name span')].map(el=>el.textContent),ingredientNames);
 const truffleSaved=truffleDom.window.localStorage.getItem('quickrecipe.shopping.v1');truffleDom.window.close();
 const truffleRestored=setup(truffleSaved);await new Promise(r=>setTimeout(r,80));const trd=truffleRestored.window.document;
 trd.querySelector('#shoppingListsBtn').click();trd.querySelector('.shopping-list-link').click();
 assert.deepEqual([...trd.querySelectorAll('.shopping-item-name span')].map(el=>el.textContent),ingredientNames);
 truffleRestored.window.close();
 console.log('Shopping list selection, amounts, copy/share, persistence, editing, fallback and truffle coatings passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
