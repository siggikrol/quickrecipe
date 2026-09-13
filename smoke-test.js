const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('./index.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'http://localhost/'
});

const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

(async () => {
  await wait();
  const { document } = dom.window;
  const brand = document.querySelector('.brand')?.textContent?.trim();
  const cards = document.querySelectorAll('.card').length;
  const detail = !!document.getElementById('detail');

  if (!brand || brand !== 'QuickRecipe') {
    throw new Error('Brand text missing or incorrect');
  }

  if (cards < 1) {
    throw new Error('No recipe cards rendered');
  }

  if (!detail) {
    throw new Error('Recipe detail pane missing');
  }

  console.log('Smoke test passed: app rendered with recipe cards and detail pane.');
})();
