const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../matching.js');
const member = (id, overrides = {}) => ({ id, name: id, skills: Array(8).fill(1), wishes: [], avoids: [], time: 2, ...overrides });
const task = (id, overrides = {}) => ({ id, name: id, skills: [0], hours: 2, count: 1, ...overrides });

test('希望が担当枠を超える場合だけ競合を検出し、確定済みは再戦させない', () => {
  const members = ['a', 'b', 'c'].map(id => member(id, { wishes: [0] }));
  const tasks = [task('x', { count: 2 }), task('y', { count: 3 }), task('z', { skills: [1] })];
  assert.deepEqual(E.conflicts(members, tasks), [{ taskId: 'x', candidates: ['a', 'b', 'c'] }]);
  assert.deepEqual(E.conflicts(members, tasks, { x: ['a', 'b'] }), []);
});

test('得意と希望が一致するメンバーを優先する', () => {
  const a = member('a', { skills: [2, 1, 1, 1, 1, 1, 1, 1], wishes: [0] });
  const b = member('b', { skills: [0, 2, 1, 1, 1, 1, 1, 1], wishes: [1] });
  const r = E.assign([a, b], [task('x'), task('y', { skills: [1] })]);
  assert.deepEqual(r.assignments, { x: ['a'], y: ['b'] });
  assert.match(r.reasons.x.a, /得意/); assert.match(r.reasons.x.a, /希望|やってみたい/);
});

test('同条件なら避けたい役割を避ける', () => {
  const r = E.assign([member('a', { avoids: [0] }), member('b')], [task('x')]);
  assert.deepEqual(r.assignments.x, ['b']);
});

test('同条件のメンバーへ均等に割り当てる', () => {
  const r = E.assign(['a', 'b', 'c', 'd'].map(id => member(id)), Array.from({ length: 8 }, (_, i) => task(`t${i}`, { hours: 1 })));
  assert.deepEqual(Object.values(r.loads), [2, 2, 2, 2]);
});

test('使える時間が多いメンバーがより多く担当する', () => {
  const r = E.assign([member('short', { time: 0 }), member('long', { time: 3 })], Array.from({ length: 10 }, (_, i) => task(`t${i}`, { hours: 1 })));
  assert.ok(r.loads.long > r.loads.short * 2);
  assert.ok(r.loads.short >= 1);
});

test('共同担当は重複せず、タスクの合計作業量を等分する', () => {
  const r = E.assign(['a', 'b', 'c'].map(id => member(id)), [task('x', { hours: 6, count: 3 })]);
  assert.equal(new Set(r.assignments.x).size, 3);
  assert.deepEqual(Object.values(r.loads), [2, 2, 2]);
});

test('じゃんけんの勝者を維持し、敗者には別の役割を配分する', () => {
  const members = [member('a', { wishes: [0] }), member('b', { wishes: [0] })];
  const r = E.assign(members, [task('x'), task('y', { skills: [1] })], { x: ['b'] });
  assert.deepEqual(r.assignments.x, ['b']); assert.deepEqual(r.assignments.y, ['a']);
  assert.match(r.reasons.x.b, /じゃんけん/);
});

test('タスク不足のときは未担当を許容し、人数の水増しをしない', () => {
  const r = E.assign(['a', 'b', 'c', 'd'].map(id => member(id)), [task('x')]);
  assert.equal(r.assignments.x.length, 1); assert.equal(Object.values(r.loads).filter(v => v === 0).length, 3);
});

test('未選択の手を受理しない', () => {
  assert.throws(() => E.resolveRound({ a: 'rock' }, ['a', 'b'], 1), /全員/);
});

test('同じ手・3種類の手はあいこになる', () => {
  assert.equal(E.resolveRound({ a: 'rock', b: 'rock' }, ['a', 'b'], 1).tie, true);
  assert.equal(E.resolveRound({ a: 'rock', b: 'scissors', c: 'paper' }, ['a', 'b', 'c'], 1).tie, true);
});

test('勝者が定員を超えた場合は勝者だけで再戦する', () => {
  const r = E.resolveRound({ a: 'rock', b: 'rock', c: 'scissors' }, ['a', 'b', 'c'], 1);
  assert.deepEqual(r.selected, []); assert.deepEqual(r.next, ['a', 'b']);
});

test('勝者が定員より少なければ勝者を確定し、残りの枠を敗者で競う', () => {
  const first = E.resolveRound({ a: 'rock', b: 'scissors', c: 'scissors', d: 'scissors' }, ['a', 'b', 'c', 'd'], 2);
  assert.deepEqual(first.selected, ['a']); assert.deepEqual(first.next, ['b', 'c', 'd']);
  const second = E.resolveRound({ b: 'paper', c: 'rock', d: 'rock' }, first.next, 1);
  assert.deepEqual(second.selected, ['b']); assert.deepEqual(second.next, []);
});

test('2～6人の全ての手と担当枠で、人数保存と正しい勝者を確認する', () => {
  const types = ['rock', 'scissors', 'paper'], beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  for (let n = 2; n <= 6; n++) {
    const ids = Array.from({ length: n }, (_, i) => String(i));
    for (let code = 0; code < 3 ** n; code++) {
      let v = code; const hands = {};
      ids.forEach(id => { hands[id] = types[v % 3]; v = Math.floor(v / 3); });
      for (let slots = 1; slots < n; slots++) {
        const r = E.resolveRound(hands, ids, slots), kinds = [...new Set(Object.values(hands))];
        assert.equal(r.tie, kinds.length !== 2);
        assert.ok(r.selected.length <= slots);
        assert.equal(new Set([...r.selected, ...r.next]).size, r.selected.length + r.next.length);
        if (!r.next.length) assert.equal(r.selected.length, slots);
        else assert.ok(r.next.length > slots - r.selected.length);
        if (!r.tie) for (const id of r.winners) assert.ok(ids.some(other => hands[other] === beats[hands[id]]));
      }
    }
  }
});

test('2～6人・乱数で生成したタスクでも、枠数・時間合計・確定担当を維持する', () => {
  let seed = 94721;
  const random = max => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % max; };
  for (let round = 0; round < 100; round++) {
    const n = 2 + random(5), members = Array.from({ length: n }, (_, i) => member(`m${i}`, { skills: Array.from({ length: 8 }, () => random(3)), time: random(4), wishes: [random(8)], avoids: [random(8)] }));
    const tasks = Array.from({ length: 1 + random(14) }, (_, i) => task(`t${i}`, { skills: [random(8)], count: 1 + random(n), hours: (1 + random(12)) / 2 }));
    const locked = round % 2 ? { t0: members.slice(0, tasks[0].count).map(m => m.id) } : {};
    const r = E.assign(members, tasks, locked);
    let total = 0;
    for (const t of tasks) {
      assert.equal(r.assignments[t.id].length, t.count); assert.equal(new Set(r.assignments[t.id]).size, t.count);
      total += t.hours;
      for (const id of locked[t.id] || []) assert.ok(r.assignments[t.id].includes(id));
      for (const id of r.assignments[t.id]) assert.ok(r.reasons[t.id][id].length > 0);
    }
    assert.ok(Math.abs(total - Object.values(r.loads).reduce((a, b) => a + b, 0)) < 1e-7);
    for (const m of members) {
      const expected = tasks.reduce((sum, t) => sum + (r.assignments[t.id].includes(m.id) ? t.hours / t.count : 0), 0);
      assert.ok(Math.abs(expected - r.loads[m.id]) < 1e-7);
    }
  }
});

test('API差し替え用インターフェースが非同期で同じ提案を返す', async () => {
  const r = await E.MatchingService.propose({ members: [member('a'), member('b')], tasks: [task('x')] });
  assert.equal(r.assignments.x.length, 1);
});
