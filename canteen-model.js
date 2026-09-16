/* Dated menu plans reference the shared recipe collection. No food quantities live here. */
const CanteenPlans = (() => {
  const id = () => globalThis.crypto?.randomUUID?.() || `menu-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date');
    const result = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(+result) || result.toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
    return result;
  }
  function shift(value, days) { const result = date(value); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10); }
  function monday(value) { return shift(value, -(date(value).getUTCDay() + 6) % 7); }
  function count(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Enter a whole number of portions');
    return value;
  }
  function create(value) {
    const start = monday(value);
    return { start, operatingDays: [0, 1, 2, 3, 4], slots: ['Soup', 'Main', 'Side', 'Dessert'].map(label => ({ id: id(), label })),
      days: Array.from({ length: 7 }, (_, i) => ({ date: shift(start, i), defaultPortions: 0, items: [] })), production: {} };
  }
  function portions(item, day) { return count(item.portions ?? day.defaultPortions); }
  function totals(items, day) { const total = items.reduce((sum, item) => sum + portions(item, day), 0); return { total, expected: day.defaultPortions, mismatch: total !== day.defaultPortions }; }
  function add(day, slotId, recipeId) { const item = { id: id(), slotId, recipeId, portions: null, variant: '' }; day.items.push(item); return item; }
  function copyDay(source, target) { target.defaultPortions = source.defaultPortions; target.note = source.note || ''; target.items = source.items.map(item => ({ ...item, id: id() })); }
  function copyWeek(source, value) {
    const result = JSON.parse(JSON.stringify(source)); result.start = monday(value); result.production = {};
    result.days.forEach((day, i) => { day.date = shift(result.start, i); day.items.forEach(item => item.id = id()); });
    return result;
  }
  function selected(week, days, slot = '') {
    return week.days.filter((day, i) => week.operatingDays.includes(i) && days.includes(day.date))
      .flatMap(day => day.items.filter(item => !slot || item.slotId === slot).map(item => ({ ...item, portions: portions(item, day), date: day.date })));
  }
  function validate(week) {
    date(week.start);
    if (monday(week.start) !== week.start || !Array.isArray(week.slots) || !week.slots.length || !Array.isArray(week.days) || week.days.length !== 7 ||
        !Array.isArray(week.operatingDays) || !week.operatingDays.length || week.operatingDays.some(i => !Number.isInteger(i) || i < 0 || i > 6)) throw new Error('Invalid saved plan');
    const slots = new Set();
    week.slots.forEach(slot => { if (!slot.id || typeof slot.label !== 'string' || !slot.label.trim() || slots.has(slot.id)) throw new Error('Invalid saved slots'); slots.add(slot.id); });
    const ids = new Set();
    week.days.forEach((day, i) => {
      if (day.date !== shift(week.start, i) || !Array.isArray(day.items) || (day.note !== undefined && (typeof day.note !== 'string' || day.note.length > 1000))) throw new Error('Invalid saved day'); count(day.defaultPortions);
      day.items.forEach(item => {
        if (!item.id || ids.has(item.id) || !slots.has(item.slotId) || typeof item.recipeId !== 'string' || typeof item.variant !== 'string') throw new Error('Invalid saved item');
        ids.add(item.id); portions(item, day);
      });
    });
    if (!week.production || typeof week.production !== 'object' || Array.isArray(week.production)) throw new Error('Invalid production state');
    for (const progress of Object.values(week.production)) {
      if (!progress || typeof progress !== 'object' || (progress.completed !== undefined && typeof progress.completed !== 'boolean') ||
          (progress.signature !== undefined && typeof progress.signature !== 'string')) throw new Error('Invalid production state');
      if (progress.batch && (!['count', 'maximum'].includes(progress.batch.mode) || !Number.isFinite(progress.batch.value) || progress.batch.value <= 0 ||
          (progress.batch.mode === 'count' && !Number.isSafeInteger(progress.batch.value)))) throw new Error('Invalid batch configuration');
    }
    return week;
  }
  return { id, date, shift, monday, count, create, portions, totals, add, copyDay, copyWeek, selected, validate };
})();
if (typeof module !== 'undefined') module.exports = CanteenPlans;
