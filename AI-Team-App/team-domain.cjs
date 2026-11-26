'use strict';
const E = require('./matching.js');
const Q = require('./quest-engine.js');
const crypto = require('node:crypto');
const fail = (ok, message, status = 400) => { if (!ok) throw Object.assign(new Error(message), { status }); };
const text = (s, label, max = 2000, optional = false) => { fail(typeof s === 'string' && s.length <= max && (optional || s.trim()), `${label}を入力してください（${max}文字以内）。`); return s.trim(); };
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const date = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
function validateAnswer(a) {
  fail(a && a.consent === true, '利用目的への同意が必要です。');
  fail(Array.isArray(a.skills) && a.skills.length === 8 && a.skills.every(v => [0, 1, 2].includes(v)), '8つのスキルすべてに回答してください。');
  fail([0, 1, 2, 3].includes(a.time), '使える時間を選んでください。');
  for (const k of ['wishes', 'avoids']) fail(Array.isArray(a[k]) && a[k].length <= 2 && new Set(a[k]).size === a[k].length && a[k].every(v => Number.isInteger(v) && v >= 0 && v < 8), '希望・回避は各2つまで選んでください。');
  fail(!a.wishes.some(v => a.avoids.includes(v)), '同じスキルを希望と回避の両方には選べません。');
  fail(typeof a.shareNote === 'boolean' && typeof a.allowAI === 'boolean', '公開範囲と外部AIへの送信設定を確認してください。');
  return { skills: a.skills, time: a.time, wishes: a.wishes, avoids: a.avoids, note: text(a.note ?? '', '自由記述', 2000, true), shareNote: a.shareNote, allowAI: a.allowAI, consentAt: now(), consentVersion: '2026-11-25' };
}
function validateTasks(tasks, count) {
  fail(Array.isArray(tasks) && tasks.length > 0 && tasks.length <= 30, 'タスクは1～30件にしてください。');
  fail(new Set(tasks.map(t => t.id)).size === tasks.length, 'タスクが重複しています。');
  const clean = tasks.map(t => {
    fail(typeof t.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(t.id), 'タスクIDが不正です。');
    fail(Number.isInteger(t.count) && t.count >= 1 && t.count <= count, '担当人数を確認してください。');
    fail(Number.isFinite(t.hours) && t.hours >= .5 && t.hours <= 100 && t.hours % .5 === 0, '作業量は0.5～100時間、0.5時間単位です。');
    fail(Array.isArray(t.skills) && t.skills.length && t.skills.every(s => Number.isInteger(s) && s >= 0 && s < 8), '必要なスキルを選んでください。');
    fail(date(t.startDate) && date(t.deadline) && t.startDate <= t.deadline, '開始予定日と締め切りを正しい順番で入力してください。');
    fail(Array.isArray(t.dependencies) && new Set(t.dependencies).size === t.dependencies.length && t.dependencies.every(d => d !== t.id && tasks.some(x => x.id === d)), '先行タスクが不正です。');
    Q.baseExp(t);
    return { id: t.id, name: text(t.name, 'タスク名', 100), count: t.count, hours: t.hours, skills: [...new Set(t.skills)], startDate: t.startDate, deadline: t.deadline, checkpoint: t.startDate, dependencies: t.dependencies, difficulty: t.difficulty ?? 2, workload: t.workload ?? 2, complexity: t.complexity ?? 2 };
  });
  const active = new Set(), visited = new Set();
  function visit(t) { fail(!active.has(t.id), 'タスクの順番が循環しています。先行タスクを見直してください。'); if (visited.has(t.id)) return; active.add(t.id); t.dependencies.forEach(d => visit(clean.find(x => x.id === d))); active.delete(t.id); visited.add(t.id); }
  clean.forEach(visit); return clean;
}
function createGroup(name, size, owner, memberName) {
  fail(Number.isInteger(size) && size >= 2 && size <= 6, '人数は2～6人にしてください。');
  const today = Q.dateInJapan(now()), due = Q.dayAfter(now(), 7);
  return { id: id(), name: text(name, 'グループ名', 80), size, owner, code: crypto.randomBytes(8).toString('hex').toUpperCase(), version: 1, proposalVersion: 0, phase: 'diagnosis', members: [{ id: owner, name: text(memberName, '名前', 40), answer: null, confirmation: null }], tasks: E.defaultTasks().map(t => ({ ...t, startDate: today, deadline: due, checkpoint: today, dependencies: [], difficulty: 2, workload: 2, complexity: 2 })), locked: {}, game: null, result: null, activity: null, history: [] };
}
const member = (g, uid) => { const m = g.members.find(m => m.id === uid); fail(m, 'このグループへの参加が必要です。', 403); return m; };
function publicGroup(g, uid) {
  member(g, uid);
  const result = structuredClone(g);
  result.members = g.members.map(m => ({ id: m.id, name: m.name, answered: !!m.answer, confirmation: m.confirmation, answer: !m.answer ? null : { ...m.answer, note: m.id === uid || m.answer.shareNote ? m.answer.note : '', notePrivate: !m.answer.shareNote && m.id !== uid } }));
  if (result.game) { result.game.chosen = Object.keys(g.game.hands); delete result.game.hands; }
  return result;
}
function availability(g, t, today = Q.dateInJapan(now())) {
  const pending = t.dependencies.filter(id => g.activity?.tasks.find(x => x.id === id)?.status !== 'done');
  return { ready: !pending.length && t.startDate <= today, pending, reason: pending.length ? `${pending.map(id => g.tasks.find(x => x.id === id).name).join('・')}の完了待ち` : t.startDate > today ? `${t.startDate}から開始予定` : '着手できます' };
}
function resetProposal(g) { g.result = null; g.game = null; g.locked = {}; g.phase = 'diagnosis'; g.proposalVersion++; g.members.forEach(m => { m.confirmation = null; }); }
// 非公開の記述を理由文に転載しない。ローカル配分では短い表現の補助判定に限定する。
function localScores(m, tasks) {
  const hints = [['情報', '調査', 'リサーチ'], ['アイデア', '企画'], ['デザイン', '資料', 'PowerPoint'], ['文章', 'レポート'], ['Excel', 'データ', '分析'], ['発表', '人前', 'プレゼン'], ['締め切り', 'スケジュール'], ['調整', '話し合い']];
  const scores = {};
  for (const t of tasks) {
    scores[t.id] = 0;
    for (const sentence of m.answer.note.split(/[。\n、]/)) if (t.skills.some(s => hints[s].some(w => sentence.toLowerCase().includes(w.toLowerCase())))) scores[t.id] += /苦手|難しい|避け|できない/.test(sentence) ? -5 : /得意|やってみたい|希望/.test(sentence) ? 4 : 0;
  }
  return scores;
}
async function propose(g, aiScores) {
  const pending = E.conflicts(g.members.map(m => ({ ...m, ...m.answer })), g.tasks, g.locked);
  if (pending.length) { const c = pending[0]; g.phase = 'game'; g.game = { taskId: c.taskId, active: c.candidates, selected: [], hands: {}, round: 1, roundId: id(), last: null }; return; }
  const members = g.members.map(m => ({ id: m.id, name: m.name, ...m.answer, taskScores: localScores(m, g.tasks) }));
  let usedAI = false;
  if (aiScores) for (const m of members) if (m.allowAI) { m.taskScores = await aiScores(m, g.tasks); usedAI = true; }
  g.result = E.assign(members, g.tasks, g.locked);
  g.result.method = usedAI ? 'ai' : 'rules';
  g.result.reasons = Object.fromEntries(g.tasks.map(t => [t.id, Object.fromEntries(g.result.assignments[t.id].map(uid => [uid, `${g.locked[t.id]?.includes(uid) ? 'じゃんけんで獲得した担当です。' : '診断の得意度・希望・回避・使える時間と、入力された補足を参考に、チーム全体の負担を調整して提案しました。'}本人の確認をもとに最終決定します。`]))]));
  g.phase = 'confirmation'; g.game = null; g.proposalVersion++; g.members.forEach(m => { m.confirmation = null; });
}
async function act(g, uid, action, p, aiScores) {
  const m = member(g, uid), owner = () => fail(g.owner === uid, 'グループ作成者だけが操作できます。', 403);
  const beforeActivity = () => fail(!g.activity, '活動開始後は診断・役割を変更できません。');
  if (action === 'answer') {
    beforeActivity(); fail(g.phase === 'diagnosis', '配分開始後は、作成者が再調整を開始してから回答を編集してください。');
    m.answer = validateAnswer(p); resetProposal(g);
  } else if (action === 'tasks') {
    owner(); beforeActivity(); fail(g.phase !== 'game', 'じゃんけん中は、再調整を開始してからタスクを変更してください。');
    fail(p.version === g.version, '他のメンバーが更新しました。最新の状態を読み込んで設定し直してください。', 409);
    g.tasks = validateTasks(p.tasks, g.size); resetProposal(g);
  } else if (action === 'propose') {
    owner(); beforeActivity(); fail(g.phase === 'diagnosis' && g.members.length === g.size && g.members.every(m => m.answer), '予定人数全員の回答が完了してから配分できます。');
    validateTasks(g.tasks, g.size); await propose(g, aiScores);
  } else if (action === 'hand') {
    const game = g.game; fail(g.phase === 'game' && game && game.roundId === p.roundId && game.active.includes(uid), '現在のじゃんけんの参加者が操作してください。');
    fail(!game.hands[uid], '選んだ手は変更できません。'); fail(['rock', 'scissors', 'paper'].includes(p.hand), '手を選んでください。'); game.hands[uid] = p.hand;
    if (game.active.every(id => game.hands[id])) {
      const out = E.resolveRound(game.hands, game.active, g.tasks.find(t => t.id === game.taskId).count - game.selected.length);
      const last = { hands: game.hands, winners: out.winners, tie: out.tie, round: game.round };
      g.history.push({ at: now(), kind: 'じゃんけん', taskId: game.taskId, ...last });
      game.selected.push(...out.selected);
      if (!out.next.length) { g.locked[game.taskId] = [...game.selected]; await propose(g, aiScores); }
      else { game.active = out.next; game.hands = {}; game.round++; game.roundId = id(); game.last = last; }
    }
  } else if (action === 'confirm') {
    fail(g.phase === 'confirmation' && p.proposalVersion === g.proposalVersion, '最新の役割提案を確認してください。', 409);
    fail(['ok', 'change'].includes(p.choice), '確認方法を選択してください。');
    m.confirmation = { choice: p.choice, note: p.choice === 'change' ? text(p.note, '相談したい内容', 500) : '', at: now(), version: g.proposalVersion };
    if (g.members.every(x => x.confirmation?.choice === 'ok' && x.confirmation.version === g.proposalVersion)) {
      g.activity = Q.create(g.members, g.tasks, g.result); g.phase = 'activity';
      g.activity.tasks.forEach(t => { const source = g.tasks.find(x => x.id === t.id); t.startDate = source.startDate; t.dependencies = source.dependencies; t.delayNotes = []; });
    }
  } else if (action === 'manual') {
    owner(); beforeActivity(); fail(g.phase === 'confirmation' && p.proposalVersion === g.proposalVersion, '最新の提案を開き直してください。', 409);
    const reason = text(p.reason, '再調整の理由', 500);
    fail(p.assignments && Object.keys(p.assignments).length === g.tasks.length, 'すべてのタスクの担当者を指定してください。');
    for (const t of g.tasks) { const ids = p.assignments[t.id]; fail(Array.isArray(ids) && ids.length === t.count && new Set(ids).size === ids.length && ids.every(id => g.members.some(m => m.id === id)), '担当枠数に合わせてメンバーを選んでください。'); }
    g.result.assignments = p.assignments;
    g.result.loads = Object.fromEntries(g.members.map(m => [m.id, g.tasks.filter(t => p.assignments[t.id].includes(m.id)).reduce((s, t) => s + t.hours / t.count, 0)]));
    g.result.reasons = Object.fromEntries(g.tasks.map(t => [t.id, Object.fromEntries(p.assignments[t.id].map(id => [id, `チームの相談にもとづく再調整案です。理由：${reason}`]))]));
    g.result.method = 'manual'; g.proposalVersion++; g.members.forEach(m => { m.confirmation = null; });
    g.history.push({ at: now(), kind: '担当者の再調整', memberId: uid, reason });
  } else if (action === 'reset') { owner(); beforeActivity(); resetProposal(g); }
  else if (action === 'rotate-code') { owner(); g.code = crypto.randomBytes(8).toString('hex').toUpperCase(); }
  else {
    fail(g.activity && g.phase === 'activity', '全員が役割を確認してから活動を開始できます。');
    const q = g.activity; q.clock = now();
    const t = q.tasks.find(x => x.id === p.taskId);
    const ready = () => { fail(t, 'タスクが見つかりません。'); const a = availability(g, t); fail(a.ready, a.reason); };
    if (action === 'start') { ready(); Q.started(q, t.id, uid); }
    else if (action === 'submit') { ready(); Q.submit(q, t.id, uid, p.evidence, p.url); }
    else if (action === 'approve') { owner(); Q.approve(q, p.taskId, p.shares, p.reason, p.verified); }
    else if (action === 'delay') { fail(t && t.assignees.includes(uid), '担当者が記録してください。'); t.delayNotes.push({ at: now(), memberId: uid, reason: text(p.reason, '開始できない事情', 500), dependencies: availability(g, t).pending }); }
    else if (action === 'penalty') { owner(); fail(t, 'タスクが見つかりません。'); fail(availability(g, t).ready && !t.delayNotes?.length, '先行タスク待ち・事情の記録があるため減点できません。日程と事情を見直してください。'); Q.penalize(q, t.id, p.memberId, p.type, p.reason, p.verified); }
    else if (action === 'wanted') { owner(); ready(); fail(!t.delayNotes?.length, '開始できない事情が記録されています。懸賞化せず日程を見直してください。'); Q.postWanted(q, t.id, p.reason, p.verified); }
    else if (action === 'cancel-wanted') { owner(); Q.cancelWanted(q, p.taskId, p.reason); }
    else if (action === 'claim') { Q.claim(q, p.taskId, uid); }
    else if (action === 'recover') Q.requestRecovery(q, uid, p.title, p.evidence);
    else if (action === 'approve-recovery') { owner(); Q.approveRecovery(q, p.id, p.reason, p.verified); }
    else if (action === 'correct-penalty') { owner(); Q.correctPenalty(q, p.id, p.amount, p.reason); }
    else if (action === 'dates') {
      owner(); fail(t, 'タスクが見つかりません。'); fail(date(p.startDate) && date(p.deadline) && p.startDate <= p.deadline, '日付の順番を確認してください。');
      Q.setDates(q, t.id, p.startDate, p.deadline, p.reason); t.startDate = p.startDate;
      Object.assign(g.tasks.find(x => x.id === t.id), { startDate: p.startDate, deadline: p.deadline, checkpoint: p.startDate });
    } else if (action === 'reflection') { q.members.find(x => x.id === uid).reflection = text(p.text, '振り返り', 2000, true); }
    else if (action === 'target') { owner(); Q.adjustTarget(q, p.memberId, p.target, p.reason, p.basis); }
    else if (action === 'teacher') { owner(); Q.teacherReview(q, p.memberId, p.comment, p.score, p.reason); }
    else if (action === 'close') { owner(); Q.closeActivity(q, p.reason); }
    else if (action === 'reopen') { owner(); Q.reopen(q, p.reason); }
    else fail(false, '操作が見つかりません。', 404);
  }
  g.history.push({ at: now(), kind: action, memberId: uid });
  g.version++; return g;
}
module.exports = { fail, text, id, now, validateAnswer, validateTasks, createGroup, publicGroup, availability, act, member, localScores };
