// DOMの見た目とは独立した、イベント処理・画面生成・保存復元の結合テスト。
// 実ブラウザでのレイアウト検証を代替するものではありません。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const E = require('../matching.js');
const Q = require('../quest-engine.js');
const questSource = fs.readFileSync(require.resolve('../quest-ui.js'), 'utf8');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const KEY = 'teamquest-session-v1', SAVE = 'teamquest-results-v1';
function harness(storage = new Map(), failStorage = false) {
  const nodes = new Map(), handlers = {}, timers = [];
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '', textContent: '', inert: false, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      focus() {}, scrollIntoView() {}, setAttribute() {}, addEventListener() {},
      showModal() { this.open = true; }, close() { this.open = false; }, remove() {}
    });
    return nodes.get(selector);
  }
  const context = vm.createContext({
    window: { TeamEngine: E, QuestEngine: Q, scrollTo() {} },
    URL,
    FormData: class { constructor(form) { this.form = form; } entries() { return Object.entries(this.form.testValues || {}); } },
    document: { querySelector: node, addEventListener: (name, handler) => { handlers[name] = handler; }, createElement: () => node('overlay'), body: { append() {} } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => { if (failStorage) throw new Error('QuotaExceededError'); storage.set(key, value); } },
    setTimeout: (fn, ms) => { if (ms === 1000) timers.push(fn); return timers.length; }, clearTimeout() {}, console
  });
  vm.runInContext(questSource, context);
  vm.runInContext(source, context);
  const click = (action, extra = {}) => {
    const button = { dataset: { action, ...extra }, classList: { toggle() {} }, setAttribute() {} };
    handlers.click({ target: { closest: () => button } });
  };
  return {
    storage, node, click, html: () => node('#app').innerHTML,
    state: () => JSON.parse(storage.get(KEY)),
    input: target => handlers.input({ target }), change: target => handlers.change({ target }),
    submit: () => handlers.submit({ target: { id: 'diagnosis-form' }, preventDefault() {} }),
    confirm: () => node('#dialog-ok').onclick(),
    questSubmit: (kind, id, values) => handlers.submit({ target: { dataset: { questForm: kind, id }, testValues: values }, preventDefault() {} }),
    quest: () => { const s = JSON.parse(storage.get('teamquest-activities-v1')); return s.projects.find(p => p.id === s.activeId); },
    async flush() { for (const fn of timers.splice(0)) fn(); for (let i = 0; i < 8; i++) await Promise.resolve(); }
  };
}

test('最初の画面に8スキルと2～6人の選択が表示される', () => {
  const app = harness();
  assert.match(app.html(), /あなたの得意・不得意を/);
  assert.equal((app.html().match(/class="skill-card"/g) || []).length, 8);
  for (let n = 2; n <= 6; n++) assert.ok(app.html().includes(`data-count="${n}"`));
});

test('名前・全スキル・時間の未入力をそれぞれ検出する', () => {
  const app = harness(); app.click('count', { count: '2' });
  app.submit(); assert.match(app.node('#form-error').textContent, /お名前/);
  app.input({ id: 'member-name', value: '検証メンバー', dataset: {} }); app.submit();
  assert.match(app.node('#form-error').textContent, /情報収集/);
  for (let i = 0; i < 8; i++) app.change({ dataset: { skill: String(i) }, value: '1' });
  app.submit(); assert.match(app.node('#form-error').textContent, /使える時間/);
  app.change({ name: 'available-time', value: '2', dataset: {} }); app.submit();
  assert.equal(app.state().current, 1); assert.equal(app.state().members[0].done, true);
});

test('入力途中の名前・スキル・希望・時間を更新後も復元する', () => {
  const app = harness();
  app.input({ id: 'member-name', value: 'テスト', dataset: {} });
  app.change({ dataset: { skill: '2' }, value: '2' }); app.click('preference', { key: 'wishes', index: '2' });
  app.change({ name: 'available-time', value: '1', dataset: {} });
  const restored = harness(app.storage);
  assert.match(restored.html(), /value="テスト"/);
  assert.match(restored.html(), /data-skill="2" checked/);
  assert.match(restored.html(), /data-key="wishes" data-index="2" aria-pressed="true"/);
  assert.match(restored.html(), /name="available-time" value="1" checked/);
});

test('希望は最大2つまで。同じ役割の希望と回避を両方選べない', () => {
  const app = harness();
  for (const i of [0, 1, 2]) app.click('preference', { key: 'wishes', index: String(i) });
  assert.deepEqual(app.state().members[0].wishes, [0, 1]);
  assert.match(app.node('#toast').textContent, /最大2つ/);
  app.click('preference', { key: 'avoids', index: '0' });
  assert.deepEqual(app.state().members[0].avoids, []);
  app.click('preference', { key: 'wishes', index: '0' });
  app.click('preference', { key: 'avoids', index: '0' });
  assert.deepEqual(app.state().members[0].avoids, [0]);
});

test('人数を減らす場合、削除対象に回答があれば確認を表示する', () => {
  const app = harness(); app.click('sample'); app.click('back-diagnosis');
  app.click('count', { count: '2' });
  assert.equal(app.node('#confirm-dialog').open, true); assert.equal(app.state().count, 4);
  app.confirm(); assert.equal(app.state().count, 2); assert.equal(app.state().members.length, 2);
});

test('タスクの追加・編集・削除を保存する。不正な人数や作業量は拒否する', () => {
  const app = harness(); app.click('sample'); app.click('to-tasks');
  app.click('add-task'); let state = app.state(); const id = state.tasks.at(-1).id;
  app.click('match'); assert.match(app.node('#form-error').textContent, /名前/);
  app.input({ dataset: { task: id, field: 'name' }, value: 'レビュー' });
  app.input({ dataset: { task: id, field: 'count' }, value: '5' });
  app.click('match'); assert.match(app.node('#form-error').textContent, /担当人数/);
  app.input({ dataset: { task: id, field: 'count' }, value: '2' });
  app.input({ dataset: { task: id, field: 'hours' }, value: '-1' });
  app.click('match'); assert.match(app.node('#form-error').textContent, /作業量/);
  app.input({ dataset: { task: id, field: 'hours' }, value: '1.5' });
  app.change({ dataset: { task: id, field: 'skills' }, value: '0', checked: false });
  app.click('match'); assert.match(app.node('#form-error').textContent, /スキル/);
  app.click('delete-task', { id }); assert.equal(app.state().tasks.length, 7);
});

test('サンプル→タスク→じゃんけん→結果→保存まで連続して進む', async () => {
  const app = harness(); app.click('sample'); assert.equal(app.state().screen, 'overview');
  app.click('to-tasks'); app.click('match'); await app.flush(); assert.equal(app.state().screen, 'game');
  app.click('ready'); app.click('hand', { hand: 'rock' });
  assert.equal(app.state().game.turn, 1);
  assert.doesNotMatch(app.html(), /revealed-hand/); assert.match(app.html(), /選択済み/);
  // 他人の手が選択中の画面に残らない。
  assert.doesNotMatch(app.html(), /✊|✌️|✋/);
  app.click('ready'); app.click('hand', { hand: 'scissors' }); await app.flush();
  assert.match(app.html(), /勝利！🎉/); assert.match(app.html(), /revealed-hand/);
  app.click('next-round'); await app.flush();
  assert.equal(app.state().screen, 'results');
  assert.deepEqual(app.state().result.assignments['task-2'], ['member-0']);
  assert.ok(Object.values(app.state().result.loads).every(v => v > 0));
  assert.match(app.html(), /チームの負担バランス/);
  app.click('save-result'); assert.equal(JSON.parse(app.storage.get(SAVE)).screen, 'results');
  const restored = harness(app.storage); assert.match(restored.html(), /みんなの役割が/);
});

test('手を一つ選んだところで更新しても、次のメンバーから再開する', async () => {
  const app = harness(); app.click('sample'); app.click('to-tasks'); app.click('match'); await app.flush();
  app.click('ready'); app.click('hand', { hand: 'paper' });
  const restored = harness(app.storage);
  assert.match(restored.html(), /佐藤 りくさんに、画面を渡してください/);
  assert.doesNotMatch(restored.html(), /✋/);
  restored.click('ready'); restored.click('hand', { hand: 'rock' }); await restored.flush();
  assert.deepEqual(restored.state().game.outcome.selected, ['member-0']);
});

test('公開演出中に更新しても選び終えた手から勝敗を復元する', async () => {
  const app = harness(); app.click('sample'); app.click('to-tasks'); app.click('match'); await app.flush();
  app.click('ready'); app.click('hand', { hand: 'rock' }); app.click('ready'); app.click('hand', { hand: 'scissors' });
  const restored = harness(app.storage); assert.match(restored.html(), /勝利！🎉/);
  restored.click('next-round'); await restored.flush();
  assert.equal(restored.state().screen, 'results');
});

test('確定後の再配分演出中に更新しても、確定担当を二重追加しない', async () => {
  const app = harness(); app.click('sample'); app.click('to-tasks'); app.click('match'); await app.flush();
  app.click('ready'); app.click('hand', { hand: 'rock' }); app.click('ready'); app.click('hand', { hand: 'scissors' }); await app.flush();
  app.click('next-round');
  const restored = harness(app.storage); restored.click('next-round'); await restored.flush();
  assert.equal(restored.state().screen, 'results'); assert.deepEqual(restored.state().locked['task-2'], ['member-0']);
});

test('あいこは全員で再戦し、手をクリアする', async () => {
  const app = harness(); app.click('sample'); app.click('to-tasks'); app.click('match'); await app.flush();
  app.click('ready'); app.click('hand', { hand: 'rock' }); app.click('ready'); app.click('hand', { hand: 'rock' }); await app.flush();
  assert.match(app.html(), /あいこでしょ！/);
  app.click('next-round'); assert.equal(app.state().game.round, 2); assert.deepEqual(app.state().game.hands, {});
  assert.equal(app.state().game.active.length, 2);
});

test('希望の重複がなければじゃんけんを省略する', async () => {
  const app = harness(); app.click('sample'); app.click('to-tasks');
  app.input({ dataset: { task: 'task-2', field: 'count' }, value: '2' });
  app.click('match'); await app.flush();
  assert.equal(app.state().screen, 'results'); assert.equal(app.state().game, null);
});

test('最初に戻っても別保存した結果を再び開ける', async () => {
  const app = harness(); app.click('sample'); app.click('to-tasks'); app.input({ dataset: { task: 'task-2', field: 'count' }, value: '2' });
  app.click('match'); await app.flush(); app.click('save-result');
  app.click('reset'); app.confirm(); assert.equal(app.state().screen, 'diagnosis');
  app.click('saved'); app.confirm(); assert.equal(app.state().screen, 'results');
});

test('HTMLを含む名前を画面内でエスケープする', () => {
  const app = harness(); app.input({ id: 'member-name', value: '<img src=x onerror=alert(1)>', dataset: {} });
  const restored = harness(app.storage);
  assert.doesNotMatch(restored.html(), /<img src=x/); assert.match(restored.html(), /&lt;img/);
});

test('壊れた保存データ・保存不能でも、アプリ全体を停止させない', () => {
  const app = harness(new Map([[KEY, '{not-json']])); assert.match(app.html(), /あなたの得意/);
  assert.match(app.node('#toast').textContent, /読み込めません/);
  const quota = harness(new Map(), true); quota.click('count', { count: '2' });
  assert.match(quota.node('#save-status').textContent, /自動保存できません/);
});

test('新しい評価項目を編集し、既存結果から目標EXP付きの活動を開始する', async () => {
  const app = harness(); app.click('sample'); app.click('to-tasks');
  for (const [field, value] of [['difficulty', '3'], ['workload', '3'], ['complexity', '2']]) app.input({ dataset: { task: 'task-2', field }, value });
  app.input({ dataset: { task: 'task-2', field: 'count' }, value: '2' });
  app.click('match'); await app.flush();
  assert.match(app.html(), /役割を確定して活動開始/);
  app.click('q-start'); app.confirm();
  assert.equal(app.state().screen, 'activity'); assert.equal(app.quest().tasks.find(t => t.id === 'task-2').baseExp, 80);
  assert.ok(app.quest().members.every(m => m.hp === 100 && m.targetExp > 0));
  assert.equal(app.quest().isDemo, false);
  const restored = harness(app.storage); assert.match(restored.html(), /チームの活動ボード/);
  assert.deepEqual(restored.quest().members, app.quest().members);
});

test('活動がないときは開始案内を表示し、11操作デモを既存診断とは別保存する', () => {
  const app = harness(); app.input({ id: 'member-name', value: '入力途中の名前', dataset: {} }); app.click('q-open');
  assert.match(app.html(), /11操作デモをはじめる/); app.click('q-demo');
  assert.equal(app.quest().demoStep, 1); assert.equal(app.state().members[0].name, '入力途中の名前');
  assert.match(app.html(), /教員・管理者の認証や/);
});

test('11操作ガイドの全画面を描画し、HP0・復活・評価の保存を復元する', () => {
  const app = harness(); app.click('q-demo');
  for (let step = 1; step <= 10; step++) {
    app.click('q-demo-next'); assert.equal(app.quest().demoStep, step + 1);
    assert.doesNotMatch(app.node('#toast').textContent, /見つかりません|変更されています/);
    if (step === 7) { assert.equal(app.quest().members.find(m => m.id === app.quest().demoOrigin).hp, 0); app.click('q-task-back'); assert.match(app.html(), /ゲームオーバー/); }
    if (step === 8) assert.equal(app.quest().members.find(m => m.id === app.quest().demoOrigin).hp, 10);
  }
  assert.match(app.html(), /全11操作 完了/); assert.match(app.html(), /教員コメント・参考点の調整/);
  const restored = harness(app.storage); assert.match(restored.html(), /教員コメント・参考点の調整/);
  assert.equal(restored.quest().demoStep, 11); assert.ok(restored.quest().closedAt);
});

test('成果物フォームと貢献確認フォームからEXPを付与する', () => {
  const app = harness(); app.click('q-demo'); const t = app.quest().tasks[0], id = t.assignees[0];
  app.click('q-task', { id: t.id }); assert.match(app.html(), /成果物を提出する/);
  app.questSubmit('submit', t.id, { member: id, evidence: '<b>実際に作成した成果</b>', url: 'https://example.com/report' });
  assert.equal(app.quest().members.find(m => m.id === id).exp.total, 0); assert.match(app.html(), /&lt;b&gt;/);
  app.click('q-detail-tab', { tab: 'review' });
  const shares = Object.fromEntries(app.quest().members.map(m => [`share-${m.id}`, m.id === id ? '100' : '0']));
  app.questSubmit('approve', t.id, { ...shares, reason: '成果物と全体の貢献を確認', verified: 'on' });
  assert.equal(app.quest().members.find(m => m.id === id).exp.base, 80); assert.equal(app.quest().tasks[0].status, 'done');
  assert.equal(app.quest().members.find(m => m.id === id).hp, 100);
});

test('不正な承認の途中で記録を書き換えず、理由を画面に示す', () => {
  const app = harness(); app.click('q-demo'); const t = app.quest().tasks[0]; const before = app.quest();
  const shares = Object.fromEntries(before.members.map(m => [`share-${m.id}`, '100']));
  app.questSubmit('approve', t.id, { ...shares, reason: '確認', verified: 'on' });
  assert.deepEqual(app.quest(), before); assert.match(app.node('#toast').textContent, /未提出|現在の担当者|100%以下/);
});

test('正式な担当変更と目標調整をUIから記録できる', () => {
  const app = harness(); app.click('q-demo'); const t = app.quest().tasks[0], before = t.assignees[0], after = app.quest().members.find(m => m.id !== before).id;
  app.click('q-task', { id: t.id }); app.click('q-detail-tab', { tab: 'admin' });
  assert.match(app.html(), /正式に役割を変更/);
  app.questSubmit('reassign', t.id, { [`assign-${after}`]: 'on', basis: 'consensus', reason: '全員で役割変更に合意した' });
  assert.deepEqual(app.quest().tasks[0].assignees, [after]);
  const originalTarget = app.quest().members.find(m => m.id === before).targetExp;
  app.questSubmit('target', before, { target: String(originalTarget - 80), basis: 'consensus', reason: '合意した役割変更を目標に反映' });
  assert.equal(app.quest().members.find(m => m.id === before).targetExp, originalTarget - 80);
  assert.ok(app.quest().audit.some(a => a.kind === '目標EXP変更'));
});

test('HP0の最終レポートで部分貢献と提出を示し、振り返りを任意保存する', () => {
  const app = harness(); app.click('q-demo'); const t = app.quest().tasks[0], id = t.assignees[0];
  app.questSubmit('submit', t.id, { member: id, evidence: '部分成果', url: '' });
  const shares = Object.fromEntries(app.quest().members.map(m => [`share-${m.id}`, m.id === id ? '25' : '0']));
  app.questSubmit('approve', t.id, { ...shares, reason: '部分確認', verified: 'on' });
  app.questSubmit('penalty', t.id, { member: id, type: 'abandoned', reason: '確認した事実', unjustified: 'on' });
  const e = app.quest().hpEvents[0]; app.questSubmit('penalty-correct', e.id, { amount: '100', reason: '管理者が事実を確認して修正' });
  app.click('q-view', { view: 'report' });
  assert.match(app.html(), /この状態だけで貢献の有無は判断しません/);
  assert.match(app.html(), /本人 25%/);
  assert.equal(app.quest().members.find(m => m.id === id).reflection, '');
  app.input({ dataset: { qReflection: id }, value: '導入部分は完成しました。残りの事情を説明します。' });
  app.click('q-reflection-example', { id }); assert.match(app.node('#dialog-message').textContent, /1件/); app.confirm();
  assert.match(app.quest().members.find(m => m.id === id).reflection, /導入部分/);
  const restored = harness(app.storage); assert.match(restored.html(), /導入部分は完成しました/);
});

test('別のデモ・診断リセットでも前の活動を残し、切り替えて復元できる', () => {
  const app = harness(); app.click('q-demo'); const first = app.quest().id; app.click('q-demo');
  assert.notEqual(app.quest().id, first); assert.equal(JSON.parse(app.storage.get('teamquest-activities-v1')).projects.length, 2);
  app.change({ dataset: { qSwitch: '' }, value: first }); assert.equal(app.quest().id, first);
  app.click('q-back'); app.click('reset'); app.confirm(); app.click('q-open');
  assert.equal(app.quest().id, first); assert.match(app.html(), /チームの活動ボード/);
});

test('活動入力の下書きは再読み込みで復元し、保存失敗を表示する', () => {
  const app = harness(); app.click('q-demo'); const t = app.quest().tasks[0]; app.click('q-task', { id: t.id });
  app.input({ dataset: { qDraft: `submit:${t.id}:evidence` }, value: '入力途中の成果物' });
  const restored = harness(app.storage); assert.match(restored.html(), /入力途中の成果物/);
  const failed = harness(app.storage, true); failed.click('q-day'); assert.match(failed.html(), /ブラウザに保存できません/);
});

test('保存済み活動が壊れていても既存診断を起動できる', () => {
  const app = harness(new Map([['teamquest-activities-v1', '{broken']]));
  assert.match(app.html(), /あなたの得意/); app.click('q-open'); assert.match(app.html(), /活動の保存データを読み込めません/);
});

test('懸賞引受・補救承認・教員評価・終了再開のフォームが保存まで動く', () => {
  const app = harness(); app.click('q-demo');
  for (let i = 0; i < 4; i++) app.click('q-demo-next');
  let q = app.quest(); const t = q.tasks[0], origin = q.demoOrigin, taker = q.demoClaimant;
  assert.equal(t.wanted.status, 'open');
  app.questSubmit('claim', t.id, { member: taker }); assert.equal(app.quest().tasks[0].wanted.status, 'open'); app.confirm();
  assert.equal(app.quest().tasks[0].wanted.claimedBy, taker);
  app.questSubmit('submit', t.id, { member: taker, evidence: '残り75%を完了しました', url: '' });
  const shares = Object.fromEntries(q.members.map(m => [`share-${m.id}`, m.id === origin ? '25' : m.id === taker ? '75' : '0']));
  app.questSubmit('approve', t.id, { ...shares, reason: '成果確認', verified: 'on' });
  assert.equal(app.quest().members.find(m => m.id === taker).exp.bonus, 16);
  const hp = app.quest().members.find(m => m.id === origin).hp;
  app.questSubmit('recovery', origin, { title: '作業報告を整理', evidence: '実際の未完了事項と成果を整理した' });
  const r = app.quest().recoveries.at(-1); app.questSubmit('recovery-approve', r.id, { reason: '達成を確認', verified: 'on' });
  assert.equal(app.quest().members.find(m => m.id === origin).hp, hp + 10);
  app.questSubmit('teacher', origin, { comment: '実際の事情を確認', score: '75', reason: '分担時の過大な負担を考慮' });
  assert.equal(app.quest().members.find(m => m.id === origin).evaluation.finalScore, 75);
  app.questSubmit('close', q.id, { reason: '全体を確認して終了' }); app.confirm(); assert.ok(app.quest().closedAt);
  app.questSubmit('reopen', q.id, { reason: '追加作業のため再開' }); assert.equal(app.quest().closedAt, null);
});

test('全デモ画面と管理フォームのHTMLはタグが整合しフォームが入れ子にならない', () => {
  const app = harness();
  function check() {
    const stack = [], voidTags = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'area', 'wbr', 'source']);
    for (const match of app.html().matchAll(/<\/?([a-z][a-z0-9-]*)(?:\s[^<>]*?)?\s*\/?>/gi)) {
      const tag = match[1].toLowerCase(), raw = match[0];
      if (raw.startsWith('</')) assert.equal(stack.pop(), tag, `閉じタグ ${tag}`);
      else if (!voidTags.has(tag) && !raw.endsWith('/>')) {
        if (tag === 'form') assert.ok(!stack.includes('form'), 'フォームが入れ子になっていない');
        stack.push(tag);
      }
    }
    assert.deepEqual(stack, []);
  }
  app.click('q-open'); check(); app.click('q-demo'); check();
  const t = app.quest().tasks[0]; app.click('q-task', { id: t.id }); check();
  app.click('q-detail-tab', { tab: 'admin' }); check(); app.click('q-detail-tab', { tab: 'review' }); check();
  for (let i = 0; i < 10; i++) { app.click('q-demo-next'); check(); }
  for (const view of ['board', 'wanted', 'teacher', 'report']) { app.click('q-view', { view }); check(); }
});
