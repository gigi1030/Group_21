const { test } = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../quest-engine.js');
const E = require('../matching.js');
const NOW = '2026-11-12T03:00:00.000Z';
function fixture(count = 1) {
  return Q.create([{ id: 'a', name: '田中' }, { id: 'b', name: '佐藤' }, { id: 'c', name: '鈴木' }],
    [{ id: 't', name: 'レポート', hours: 3, count, difficulty: 3, workload: 3, complexity: 2 }],
    { assignments: { t: count === 1 ? ['a'] : ['a', 'b'] } }, NOW, true);
}
function proof(q, who = 'a') { Q.submit(q, 't', who, '成果物の内容と確認可能な貢献'); }
function later(q) { Q.setClock(q, '2026-11-24T03:00:00.000Z'); }

test('初期HP100、基本EXP80、当初担当の目標を記録。未担当は目標0', () => {
  const q = fixture(); assert.equal(q.tasks[0].baseExp, 80);
  assert.deepEqual(q.members.map(m => m.hp), [100, 100, 100]);
  assert.deepEqual(q.members.map(m => m.targetExp), [80, 0, 0]);
  assert.equal(q.members[1].evaluation.finalScore, null);
});
test('共同担当の目標は指定どおり各人にタスクの基本EXP全額を記録', () => {
  assert.deepEqual(fixture(2).members.map(m => m.initialTarget), [80, 80, 0]);
});
test('難易度・作業量・煩雑さは1～3。基本EXPは30～90', () => {
  assert.equal(Q.baseExp({ difficulty: 1, workload: 1, complexity: 1 }), 30);
  assert.equal(Q.baseExp({ difficulty: 3, workload: 3, complexity: 3 }), 90);
  assert.throws(() => Q.baseExp({ difficulty: 4 }), /1～3/);
});
test('提出だけではEXPを付与しない。確認・成果物なしの承認は拒否', () => {
  const q = fixture();
  assert.throws(() => Q.approve(q, 't', { a: 100 }, '確認', true), /未提出/);
  proof(q); assert.equal(q.members[0].exp.total, 0);
  assert.throws(() => Q.approve(q, 't', { a: 100 }, '確認', false), /チェック/);
  Q.approve(q, 't', { a: 100 }, '実際の成果を確認した', true);
  assert.equal(q.members[0].exp.total, 80); assert.equal(q.members[0].hp, 100); assert.equal(q.tasks[0].status, 'done');
});
test('通常の完了は減ったHPを回復させない', () => {
  const q = fixture(); Q.penalize(q, 't', 'a', 'abandoned', '協議なく放棄したことを確認', true);
  proof(q); Q.approve(q, 't', { a: 100 }, '確認', true);
  assert.equal(q.members[0].hp, 80); assert.equal(q.members[0].exp.total, 80);
});
test('共同作業の合計は基本EXP以内。完了・部分貢献とも二重付与しない', () => {
  const q = fixture(2); proof(q); proof(q, 'b');
  assert.throws(() => Q.approve(q, 't', { a: 60, b: 60 }, '確認', true), /100%以下/);
  assert.equal(q.expEvents.length, 0);
  Q.approve(q, 't', { a: 25, b: 25 }, '部分成果を確認', true);
  assert.equal(q.members[0].exp.base, 20); assert.equal(q.members[1].exp.base, 20);
  assert.throws(() => Q.approve(q, 't', { a: 25, b: 25 }, '再確認', true), /再付与/);
  assert.throws(() => Q.approve(q, 't', { a: 20, b: 40 }, '減少', true), /現在以上/);
  Q.approve(q, 't', { a: 40, b: 60 }, '全体を確認', true);
  assert.equal(q.members.reduce((s, m) => s + m.exp.base, 0), 80);
  assert.throws(() => Q.approve(q, 't', { a: 40, b: 60 }, '二度目', true), /すでに/);
});
test('締切・中間チェック以前に減点しない。着手済みは未着手にしない', () => {
  const q = fixture();
  assert.throws(() => Q.penalize(q, 't', 'a', 'unstarted', '確認', true), /中間チェック/);
  assert.throws(() => Q.penalize(q, 't', 'a', 'overdue', '確認', true), /締め切り/);
  Q.started(q, 't', 'a'); later(q);
  assert.throws(() => Q.penalize(q, 't', 'a', 'unstarted', '確認', true), /未着手/);
});
test('事情の確認・理由がないペナルティを拒否し、同じ違反を重複計上しない', () => {
  const q = fixture(); later(q);
  assert.throws(() => Q.penalize(q, 't', 'a', 'overdue', '確認', false), /正当な理由/);
  assert.throws(() => Q.penalize(q, 't', 'a', 'overdue', '', true), /理由/);
  Q.penalize(q, 't', 'a', 'overdue', '正当な理由がない期限超過を確認', true);
  assert.equal(q.members[0].hp, 90);
  assert.throws(() => Q.penalize(q, 't', 'a', 'overdue', '二度目', true), /記録済み/);
  assert.equal(q.members[0].hp, 90);
});
test('応答なし追加減点は期限超過記録と2日の無応答を必要とする', () => {
  const q = fixture(); later(q);
  assert.throws(() => Q.penalize(q, 't', 'a', 'silent', '確認', true), /期限超過の記録/);
  Q.penalize(q, 't', 'a', 'overdue', '期限超過を確認', true); Q.started(q, 't', 'a');
  assert.throws(() => Q.penalize(q, 't', 'a', 'silent', '確認', true), /2日/);
  Q.setClock(q, '2026-11-27T03:00:00.000Z'); Q.penalize(q, 't', 'a', 'silent', '連絡後2日以上応答なし', true);
  assert.equal(q.members[0].hp, 85);
});
test('免除・修正を履歴に保存し、免除した同一違反も再度減点しない', () => {
  const q = fixture(); const e = Q.penalize(q, 't', 'a', 'abandoned', '放棄と判断', true);
  assert.throws(() => Q.correctPenalty(q, e.id, 0, ''), /理由/);
  Q.correctPenalty(q, e.id, 5, '分担の問題を確認'); assert.equal(q.members[0].hp, 95);
  Q.correctPenalty(q, e.id, 0, '正当な事情が確認できたため免除'); assert.equal(q.members[0].hp, 100);
  assert.equal(e.revisions.length, 2); assert.equal(e.originalAmount, -20);
  assert.throws(() => Q.penalize(q, 't', 'a', 'abandoned', '再記録', true), /記録済み/);
});
test('HPの下限0、補救で10回復。承認済みクエストは再承認・再提出できない', () => {
  const q = fixture(); const e = Q.penalize(q, 't', 'a', 'abandoned', '確認', true);
  Q.correctPenalty(q, e.id, 100, '事実確認に基づく修正'); assert.equal(q.members[0].hp, 0);
  const r = Q.requestRecovery(q, 'a', '引き継ぎ手順を整理', '引き継ぎ資料を作りチームが確認');
  assert.equal(q.members[0].hp, 0);
  Q.approveRecovery(q, r.id, '達成を確認', true);
  assert.equal(q.members[0].hp, 10); assert.equal(q.members[0].exp.total, 0);
  assert.throws(() => Q.approveRecovery(q, r.id, '再確認', true), /確認済み/);
  assert.throws(() => Q.requestRecovery(q, 'a', r.title, r.evidence), /記録済み/);
});
test('HPは回復しても100を超えず、過去の免除でも上限を維持', () => {
  const q = fixture(); later(q); const e = Q.penalize(q, 't', 'a', 'unstarted', '確認', true);
  const r = Q.requestRecovery(q, 'a', '補救作業', '補救の成果'); Q.approveRecovery(q, r.id, '確認', true);
  assert.equal(q.members[0].hp, 100); Q.correctPenalty(q, e.id, 0, '正当な理由を確認'); assert.equal(q.members[0].hp, 100);
});
test('元担当の部分貢献・目標を保持し、80 EXPと16の懸賞を分配する', () => {
  const q = fixture(); proof(q); Q.approve(q, 't', { a: 25 }, '25%確認', true);
  Q.postWanted(q, 't', '残りが放置されている', true);
  assert.equal(q.tasks[0].wanted.bonusPool, 16); assert.equal(q.tasks[0].wanted.remainingPercent, 75);
  assert.throws(() => Q.claim(q, 't', 'a'), /元の担当者以外/);
  Q.claim(q, 't', 'b'); assert.equal(q.members[0].targetExp, 80); assert.equal(q.members[0].exp.base, 20);
  assert.throws(() => Q.claim(q, 't', 'c'), /引き受け済み/);
  proof(q, 'b'); Q.approve(q, 't', { b: 75 }, '残り75%の完成を確認', true);
  assert.equal(q.members[1].exp.base, 60); assert.equal(q.members[1].exp.bonus, 16);
  assert.equal(q.members.reduce((s, m) => s + m.exp.base, 0), 80);
  assert.equal(q.tasks[0].wanted.status, 'closed');
});
test('懸賞の部分確認を繰り返してもボーナス合計は20%を超えない', () => {
  const q = fixture(); proof(q); Q.approve(q, 't', { a: 33 }, '33%確認', true); Q.postWanted(q, 't', '放置', true); Q.claim(q, 't', 'b'); proof(q, 'b');
  for (let share = 1; share <= 67; share++) Q.approve(q, 't', { b: share }, '追加の成果を確認', true);
  assert.equal(q.members[1].exp.bonus, 16); assert.equal(q.members[1].exp.base, 53.6); assert.equal(q.members[0].exp.base, 26.4);
});
test('懸賞の取り消しに理由を残す。公開中の承認で元の貢献を上書きしない', () => {
  const q = fixture(); proof(q); Q.approve(q, 't', { a: 0 }, '提出物は現在の作業成果に含まれないことを確認', true); Q.postWanted(q, 't', '放置確認', true);
  assert.throws(() => Q.approve(q, 't', { a: 50 }, '確認', true), /公開中/);
  Q.cancelWanted(q, 't', '本人と合意して元担当が継続'); assert.equal(q.tasks[0].wanted, null);
  Q.approve(q, 't', { a: 100 }, '完成を確認', true);
  assert.throws(() => Q.postWanted(q, 't', '再掲', true), /完了済み/);
});
test('最終貢献度の指定例と四捨五入・100点上限', () => {
  for (const [target, actual, expected] of [[200, 180, 90], [160, 160, 100], [200, 100, 50], [180, 210, 100], [300, 100, 33]]) {
    assert.equal(Q.evaluation({ targetExp: target, exp: { base: actual, bonus: 0 }, teacherAdjustment: null }).autoScore, expected);
  }
});
test('累積ボーナスに上限なし。最終評価では目標の10%まで', () => {
  const m = { targetExp: 200, exp: { base: 150, bonus: 1000 }, teacherAdjustment: null };
  const score = Q.evaluation(m);
  assert.equal(score.eligibleBonus, 20); assert.equal(score.actual, 170); assert.equal(score.autoScore, 85); assert.equal(score.excludedBonus, 980);
  assert.equal(m.exp.bonus, 1000);
});

test('小数の目標でも懸賞の評価上限を丸め上げず10%に制限する', () => {
  const result = Q.evaluation({ targetExp: 0.03, exp: { base: 0, bonus: 16 }, teacherAdjustment: null });
  assert.equal(result.eligibleBonus, 0.003); assert.equal(result.autoScore, 10);
});
test('目標0はEXPがあっても評価対象外。教員調整で100点にはできない', () => {
  const q = fixture(); q.members[1].exp.total = 100;
  assert.equal(Q.evaluation(q.members[1]).finalScore, null);
  assert.throws(() => Q.teacherReview(q, 'b', '確認', 100, '調整'), /評価対象外/);
});
test('目標EXPの変更には合意または事情と理由が必須。初期目標を保持', () => {
  const q = fixture();
  assert.throws(() => Q.adjustTarget(q, 'a', 40, '変更', ''), /合意/);
  assert.throws(() => Q.adjustTarget(q, 'a', 40, '', 'consensus'), /理由/);
  Q.adjustTarget(q, 'a', 40, '共同担当の範囲変更を全員で合意', 'consensus');
  assert.equal(q.members[0].targetExp, 40); assert.equal(q.members[0].initialTarget, 80);
  assert.ok(q.audit.some(a => a.kind === '目標EXP変更' && a.before === 80 && a.after === 40));
});
test('教員のコメント・点数調整を自動計算と分けて保存し解除も記録', () => {
  const q = fixture(); proof(q); Q.approve(q, 't', { a: 50 }, '部分確認', true);
  assert.throws(() => Q.teacherReview(q, 'a', '事情確認', 75, ''), /理由/);
  Q.teacherReview(q, 'a', '本人の事情を確認した', 75, '当初分担に過大な負担があった');
  assert.equal(q.members[0].evaluation.autoScore, 50); assert.equal(q.members[0].evaluation.finalScore, 75); assert.equal(q.members[0].exp.total, 40);
  Q.teacherReview(q, 'a', '自動参考点に戻す', null, '正式な目標調整に変更する'); assert.equal(q.members[0].evaluation.finalScore, 50);
});
test('部分貢献・未確認提出を完了ゼロと区別し、記録だけで無貢献と扱わない', () => {
  const q = fixture(); proof(q); Q.approve(q, 't', { a: 25 }, '部分確認', true);
  const s = Q.stats(q, 'a'); assert.equal(s.completed, 0); assert.equal(s.contributed, 1); assert.equal(s.submitted, 1); assert.equal(s.unfinished, 1);
});
test('終了後は作業付与を停止し、理由を記録して再開。補正・振り返りは保持', () => {
  const q = fixture(); Q.closeActivity(q, '残作業を確認して終了');
  assert.throws(() => proof(q), /終了/);
  Q.teacherReview(q, 'a', '未完了の状況を確認', null, '');
  Q.reopen(q, '追加提出の機会を設定'); proof(q); assert.equal(q.submissions.length, 1); assert.equal(q.members[0].teacherComment, '未完了の状況を確認');
});
test('危険な成果物URLを拒否する', () => {
  const q = fixture(); assert.throws(() => Q.submit(q, 't', 'a', '説明', 'javascript:alert(1)'), /http/);
  assert.equal(q.submissions.length, 0);
});
test('11操作デモを最後まで実行。80+16、HP0→10、最終評価、履歴を検証', () => {
  const q = Q.createDemo(E, NOW); assert.equal(q.demoStep, 1); assert.equal(q.tasks.length, 12);
  while (q.demoStep <= 10) {
    Q.advanceDemo(q);
    if (q.demoStep === 8) assert.equal(q.members.find(m => m.id === q.demoOrigin).hp, 0);
    if (q.demoStep === 9) assert.equal(q.members.find(m => m.id === q.demoOrigin).hp, 10);
  }
  const t = q.tasks[0]; assert.equal(t.status, 'done'); assert.equal(q.expEvents.filter(e => e.taskId === t.id && e.type === 'base').reduce((s, e) => s + e.amount, 0), 80);
  assert.equal(q.expEvents.filter(e => e.taskId === t.id && e.type === 'bonus').reduce((s, e) => s + e.amount, 0), 16);
  assert.equal(q.demoStep, 11); assert.equal(q.view, 'teacher'); assert.ok(q.closedAt);
  const restored = JSON.parse(JSON.stringify(q)); assert.equal(Q.valid(restored), true); Q.recompute(restored);
  assert.deepEqual(restored.members, q.members);
});

test('正式な役割変更は合意・理由を記録し、当初担当・部分貢献・目標を保持する', () => {
  const q = fixture(); proof(q); Q.approve(q, 't', { a: 25 }, '部分確認', true);
  assert.throws(() => Q.reassign(q, 't', ['b'], '', '事情'), /合意/);
  Q.reassign(q, 't', ['b'], 'consensus', '残りの作業を佐藤さんに変えることを全員で合意');
  assert.deepEqual(q.tasks[0].assignees, ['b']); assert.deepEqual(q.tasks[0].initialAssignees, ['a']);
  assert.equal(q.members[0].targetExp, 80); assert.equal(q.members[0].exp.base, 20);
  proof(q, 'b'); Q.approve(q, 't', { b: 75 }, '残りの確認', true);
  assert.equal(q.members[1].exp.base, 60); assert.equal(q.members[1].exp.bonus, 0);
});

test('未確認成果物があるまま懸賞掲載・正式引き継ぎして元担当の貢献を失わせない', () => {
  const q = fixture(); proof(q);
  assert.throws(() => Q.postWanted(q, 't', '掲載', true), /未確認の成果物/);
  assert.throws(() => Q.reassign(q, 't', ['b'], 'consensus', '交代'), /未確認の成果物/);
  Q.approve(q, 't', { a: 30 }, '元担当の実際の貢献30%を確認', true);
  Q.postWanted(q, 't', '残りを掲載', true);
  assert.equal(q.tasks[0].wanted.remainingPercent, 70); assert.equal(q.members[0].exp.base, 24);
});
