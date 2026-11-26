'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server.cjs');
const D = require('../team-domain.cjs');
const Q = require('../quest-engine.js');
const answer = overrides => ({ skills: Array(8).fill(1), time: 3, wishes: [], avoids: [], note: '', shareNote: false, allowAI: false, consent: true, ...overrides });
async function fixture(t, opts = {}) {
  const server = createServer({ dbPath: ':memory:', env: {}, ...opts });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.stop());
  const origin = `http://127.0.0.1:${server.address().port}`;
  function client(cookie = '') {
    return { uid: null, get cookie() { return cookie; },
      async call(route, data, expected = 200, headers = {}) {
        const res = await fetch(`${origin}/api/${route}`, { method: data ? 'POST' : 'GET', headers: { Cookie: cookie, Origin: origin, ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
        if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
        const body = await res.json(); assert.equal(res.status, expected, JSON.stringify(body)); if (body.uid) this.uid = body.uid; return body;
      },
      action(g, action, payload = {}, status = 200) { return this.call('action', { groupId: g.id, action, payload }, status); },
      read(g, status = 200) { return this.call(`group?id=${g.id}`, null, status); }
    };
  }
  return { server, origin, client };
}
async function groupOf(t, size = 4, opts = {}) {
  const f = await fixture(t, opts), clients = Array.from({ length: size }, () => f.client());
  await Promise.all(clients.map(c => c.call('me')));
  let g = await clients[0].call('create', { name: '共有テスト班', memberName: 'メンバー1', size }, 201);
  await Promise.all(clients.slice(1).map((c, i) => c.call('join', { code: g.code, name: `メンバー${i + 2}` })));
  g = await clients[0].read(g); return { ...f, clients, g };
}
test('独立した4セッションで参加・回答・同意・提案・全員確認・成果共有を完了', async t => {
  const { clients: c, g: initial } = await groupOf(t);
  let g = initial; assert.equal(g.members.length, 4);
  await c[0].action(g, 'propose', {}, 400);
  await c[0].action(g, 'answer', answer({ consent: false }), 400);
  await c[0].action(g, 'answer', answer({ skills: [1] }), 400);
  await Promise.all(c.map((client, i) => client.action(g, 'answer', answer({ note: i === 0 ? '非公開の個人的事情' : '', shareNote: false }))));
  g = await c[0].read(g); assert.ok(g.members.every(m => m.answered && m.answer.consentAt));
  const other = await c[1].read(g); assert.equal(other.members[0].answer.note, ''); assert.equal(JSON.stringify(other).includes('非公開の個人的事情'), false);
  assert.equal(g.members[0].answer.note, '非公開の個人的事情');
  await c[1].action(g, 'propose', {}, 403);
  g = await c[0].action(g, 'propose'); assert.equal(g.phase, 'confirmation'); assert.equal(g.result.method, 'rules');
  await c[0].action(g, 'start', { taskId: g.tasks[0].id }, 400);
  await Promise.all(c.slice(0, 3).map(client => client.action(g, 'confirm', { choice: 'ok', proposalVersion: g.proposalVersion })));
  g = await c[0].read(g); assert.equal(g.activity, null);
  g = await c[3].action(g, 'confirm', { choice: 'ok', proposalVersion: g.proposalVersion }); assert.equal(g.phase, 'activity');
  const task = g.activity.tasks[0], actor = c.find(client => client.uid === task.assignees[0]);
  await actor.action(g, 'start', { taskId: task.id });
  await actor.action(g, 'submit', { taskId: task.id, evidence: '調査成果と参考資料の整理を提出しました', url: '' });
  g = await c[0].action(g, 'approve', { taskId: task.id, shares: { [actor.uid]: 100 }, reason: '成果を確認しました', verified: true });
  const all = await Promise.all(c.map(client => client.read(g)));
  for (const view of all) { assert.equal(view.activity.tasks[0].status, 'done'); assert.equal(view.activity.members.find(m => m.id === actor.uid).exp.total, 60); }
  await c[0].action(g, 'approve', { taskId: task.id, shares: { [actor.uid]: 100 }, reason: '二重承認', verified: true }, 400);
  assert.equal((await actor.read(g)).activity.members.find(m => m.id === actor.uid).exp.total, 60);
});
test('グループ外の取得・操作・イベント購読、一般メンバーの管理操作を拒否', async t => {
  const { clients: c, client, g, origin } = await groupOf(t, 2), outsider = client(); await outsider.call('me');
  await outsider.read(g, 403); await outsider.action(g, 'reset', {}, 403); await c[1].action(g, 'reset', {}, 403);
  const events = await fetch(`${origin}/api/events?id=${g.id}`, { headers: { Cookie: outsider.cookie } }); assert.equal(events.status, 403);
  await c[0].call('action', { groupId: g.id, action: 'reset' }, 403, { Origin: 'https://other.example' });
  const forbidden = await fetch(`${origin}/data/teamquest.sqlite`); assert.equal(forbidden.status, 404);
  const oldCode = g.code; await c[0].action(g, 'rotate-code'); await outsider.call('join', { code: oldCode, name: '侵入' }, 404);
});
test('じゃんけんの手は選択者一覧のみ公開し、同時送信・あいこ・再送信を処理', async t => {
  const { clients: c, g: initial } = await groupOf(t, 2); let g = initial;
  await Promise.all(c.map(x => x.action(g, 'answer', answer({ wishes: [0] }))));
  g = await c[0].action(g, 'propose'); assert.equal(g.phase, 'game'); const round = g.game.roundId;
  g = await c[0].action(g, 'hand', { hand: 'rock', roundId: round });
  const view = await c[1].read(g); assert.equal(view.game.hands, undefined); assert.deepEqual(view.game.chosen, [c[0].uid]);
  await c[0].action(g, 'hand', { hand: 'paper', roundId: round }, 400);
  g = await c[1].action(g, 'hand', { hand: 'rock', roundId: round }); assert.equal(g.game.round, 2);
  await c[0].action(g, 'hand', { hand: 'rock', roundId: round }, 400);
  await Promise.all([c[0].action(g, 'hand', { hand: 'rock', roundId: g.game.roundId }), c[1].action(g, 'hand', { hand: 'scissors', roundId: g.game.roundId })]);
  g = await c[0].read(g); assert.equal(g.phase, 'confirmation'); assert.equal(g.result.assignments['task-0'][0], c[0].uid);
});
test('相談希望・担当の再調整で全員の確認を失効し、古い提案への同意を拒否', async t => {
  const { clients: c, g: initial } = await groupOf(t, 2); let g = initial;
  await Promise.all(c.map(x => x.action(g, 'answer', answer()))); g = await c[0].action(g, 'propose'); const old = g.proposalVersion;
  await c[0].action(g, 'confirm', { choice: 'ok', proposalVersion: old });
  g = await c[1].action(g, 'confirm', { choice: 'change', note: '作業時間を減らしたいです', proposalVersion: old }); assert.equal(g.phase, 'confirmation');
  const assignments = structuredClone(g.result.assignments); assignments['task-0'] = [c[1].uid];
  g = await c[0].action(g, 'manual', { assignments, reason: '相談にもとづき変更', proposalVersion: old }); assert.ok(g.members.every(m => !m.confirmation));
  await c[0].action(g, 'confirm', { choice: 'ok', proposalVersion: old }, 409);
  g = await c[0].action(g, 'reset'); assert.equal(g.phase, 'diagnosis'); await c[1].action(g, 'answer', answer({ time: 1 }));
});
test('循環・自己参照・不正日付を拒否し、完了待ち・事情記録で体力減点を防止', async t => {
  const { clients: c, g: initial } = await groupOf(t, 2); let g = initial;
  let tasks = structuredClone(g.tasks.slice(0, 2)); tasks[1].dependencies = [tasks[0].id];
  const bad = structuredClone(tasks); bad[0].dependencies = [bad[1].id];
  await c[0].action(g, 'tasks', { tasks: bad, version: g.version }, 400);
  bad[0].dependencies = [bad[0].id]; await c[0].action(g, 'tasks', { tasks: bad, version: g.version }, 400);
  bad[0].dependencies = []; bad[0].deadline = '2026-02-30'; await c[0].action(g, 'tasks', { tasks: bad, version: g.version }, 400);
  g = await c[0].action(g, 'tasks', { tasks, version: g.version });
  await c[0].action(g, 'tasks', { tasks, version: initial.version }, 409);
  await Promise.all(c.map(x => x.action(g, 'answer', answer()))); g = await c[0].action(g, 'propose');
  await Promise.all(c.map(x => x.action(g, 'confirm', { choice: 'ok', proposalVersion: g.proposalVersion }))); g = await c[0].read(g);
  const next = g.activity.tasks[1], actor = c.find(x => x.uid === next.assignees[0]);
  await actor.action(g, 'start', { taskId: next.id }, 400);
  await actor.action(g, 'submit', { taskId: next.id, evidence: '順番を飛ばす', url: '' }, 400);
  await c[0].action(g, 'penalty', { taskId: next.id, memberId: actor.uid, type: 'abandoned', reason: '依存待ち', verified: true }, 400);
  await actor.action(g, 'delay', { taskId: next.id, reason: '情報収集が遅れているため開始できません' });
  const first = g.activity.tasks[0], worker = c.find(x => x.uid === first.assignees[0]);
  await worker.action(g, 'submit', { taskId: first.id, evidence: '先行作業を完了', url: '' });
  await c[0].action(g, 'approve', { taskId: first.id, shares: { [worker.uid]: 100 }, reason: '完了確認', verified: true });
  await actor.action(g, 'start', { taskId: next.id });
  await c[0].action(g, 'penalty', { taskId: next.id, memberId: actor.uid, type: 'abandoned', reason: '遅延', verified: true }, 400);
  assert.ok((await actor.read(g)).activity.members.every(m => m.hp === 100));
});
test('変更通知を別セッションに配信し、再接続時に最新の版を通知', async t => {
  const { clients: c, g, origin } = await groupOf(t, 2), controller = new AbortController(); t.after(() => controller.abort());
  const res = await fetch(`${origin}/api/events?id=${g.id}`, { headers: { Cookie: c[1].cookie }, signal: controller.signal });
  const reader = res.body.getReader(), decoder = new TextDecoder();
  assert.match(decoder.decode((await reader.read()).value), new RegExp(`data: ${g.version}`));
  await c[0].action(g, 'answer', answer());
  assert.match(decoder.decode((await reader.read()).value), new RegExp(`data: ${g.version + 1}`)); controller.abort();
});
test('サーバー再起動後もグループ・本人認証・回答を復元', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamquest-test-')), dbPath = path.join(dir, 'test.sqlite');
  const f = await fixture(t, { dbPath }); const a = f.client(); await a.call('me');
  const g = await a.call('create', { name: '永続化', memberName: '本人', size: 2 }, 201); await a.action(g, 'answer', answer({ note: '保存される補足' }));
  await f.server.stop();
  const second = await fixture(t, { dbPath }), restored = second.client(a.cookie);
  assert.equal((await restored.read(g)).members[0].answer.note, '保存される補足');
  await second.server.stop(); fs.rmSync(dir, { recursive: true, force: true });
});
test('外部AIの送信同意を尊重し非公開メモを送信するが、返却データに漏らさない', async t => {
  const seen = [], aiScores = async (m, tasks) => { seen.push(m); return Object.fromEntries(tasks.map(t => [t.id, 5])); };
  const { clients: c, g: initial } = await groupOf(t, 2, { aiScores }); let g = initial;
  await c[0].action(g, 'answer', answer({ note: '秘密の事情', allowAI: true })); await c[1].action(g, 'answer', answer({ note: '送信しない事情', allowAI: false }));
  g = await c[0].action(g, 'propose'); assert.equal(seen.length, 1); assert.equal(seen[0].note, '秘密の事情');
  assert.equal(g.result.method, 'ai'); const view = await c[1].read(g); assert.ok(!JSON.stringify(view).includes('秘密の事情'));
});
test('自由記述の得意・苦手をローカル配分でも補助的に参照する', () => {
  const scores = D.localScores({ answer: answer({ note: 'デザインは得意ですが、人前で話すのは苦手です。Excelをやってみたいです。' }) }, require('../matching.js').defaultTasks());
  assert.ok(scores['task-2'] > 0); assert.ok(scores['task-5'] < 0); assert.ok(scores['task-4'] > 0);
});
