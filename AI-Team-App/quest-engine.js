/* 活動の記録と計算。UI・localStorage・外部APIから独立したドメインロジック。 */
(function (root) {
  'use strict';
  const PENALTIES = {
    unstarted: { label: '中間チェックで未着手', amount: 5 },
    overdue: { label: '正当な理由のない期限超過', amount: 10 },
    silent: { label: '期限後2日以上、応答なし', amount: 5 },
    abandoned: { label: '協議のない放棄', amount: 20 }
  };
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const copy = o => JSON.parse(JSON.stringify(o));
  function fail(condition, message) { if (!condition) throw new Error(message); }
  function text(value, label, max = 2000) { fail(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${label}を入力してください（${max}文字以内）。`); return value.trim(); }
  const stamp = q => q.clock;
  function uid(q, prefix) { return `${prefix}-${++q.sequence}`; }
  function member(q, id) { const m = q.members.find(m => m.id === id); fail(m, 'メンバーが見つかりません。'); return m; }
  function task(q, id) { const t = q.tasks.find(t => t.id === id); fail(t, 'タスクが見つかりません。'); return t; }
  function open(q) { fail(!q.closedAt, '活動は終了しています。活動を再開してから操作してください。'); }
  function log(q, kind, detail) { q.audit.push({ id: uid(q, 'audit'), at: stamp(q), kind, ...copy(detail) }); }
  function dateInJapan(iso) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
  function dayAfter(iso, days) { return dateInJapan(new Date(Date.parse(iso) + days * 86400000).toISOString()); }
  function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
  const endOfDay = date => Date.parse(`${date}T23:59:59+09:00`);
  function baseExp(t) {
    const ratings = [t.difficulty ?? 2, t.workload ?? 2, t.complexity ?? 2];
    fail(ratings.every(v => Number.isInteger(v) && v >= 1 && v <= 3), '難易度・作業量・煩雑さは1～3で設定してください。');
    return 10 * ratings.reduce((a, b) => a + b, 0);
  }
  function create(members, tasks, result, now = new Date().toISOString(), isDemo = false) {
    fail(members.length >= 2 && members.length <= 6 && tasks.length && result?.assignments, '全員の役割分担を先に完了してください。');
    fail(!Number.isNaN(Date.parse(now)), '開始日時が不正です。');
    const q = { version: 1, id: `activity-${Date.parse(now)}`, createdAt: now, clock: now, sequence: 0, isDemo, closedAt: null, view: 'board', selected: null, memberFilter: 'all', drafts: {}, members: [], tasks: [], hpEvents: [], expEvents: [], submissions: [], recoveries: [], audit: [] };
    const ids = members.map(m => m.id);
    fail(new Set(ids).size === ids.length, 'メンバーIDが重複しています。');
    q.tasks = tasks.map(t => {
      const assigned = result.assignments[t.id];
      fail(Array.isArray(assigned) && assigned.length === t.count && new Set(assigned).size === assigned.length && assigned.every(id => ids.includes(id)), '役割分担の担当人数が不正です。');
      const due = t.deadline || dayAfter(now, 7), checkpoint = t.checkpoint || dayAfter(now, 3);
      fail(validDate(due) && validDate(checkpoint) && checkpoint <= due, '中間チェック日は締め切り以前の日付にしてください。');
      return { id: t.id, name: t.name, difficulty: t.difficulty ?? 2, workload: t.workload ?? 2, complexity: t.complexity ?? 2, baseExp: baseExp(t), hours: t.hours,
        deadline: due, checkpoint, initialAssignees: [...assigned], assignees: [...assigned], status: 'todo', startedBy: [], responses: {}, contributions: Object.fromEntries(ids.map(id => [id, 0])), wanted: null, completedAt: null };
    });
    q.members = members.map(m => ({ id: m.id, name: m.name, hp: 100, exp: { base: 0, bonus: 0, total: 0 }, initialTarget: q.tasks.filter(t => t.initialAssignees.includes(m.id)).reduce((sum, t) => sum + t.baseExp, 0), targetExp: 0, evaluation: {}, teacherAdjustment: null, teacherComment: '', reflection: '' }));
    q.members.forEach(m => { m.targetExp = m.initialTarget; });
    log(q, '開始', { note: '役割を確定し、当初担当タスクの基本EXP合計を目標として記録。共同担当も各人に全額を計上。' });
    return recompute(q);
  }
  function evaluation(m) {
    // 評価上限を丸め上げない。小数の目標でも厳密に10%までにとどめる。
    const eligibleBonus = Math.min(m.exp.bonus, m.targetExp / 10);
    const actual = m.exp.base + eligibleBonus;
    const autoScore = m.targetExp === 0 ? null : Math.min(100, Math.round(actual / m.targetExp * 100));
    return { target: m.targetExp, actual, eligibleBonus, excludedBonus: round(m.exp.bonus - eligibleBonus), autoScore,
      finalScore: autoScore === null ? null : m.teacherAdjustment?.score ?? autoScore };
  }
  function recompute(q) {
    for (const m of q.members) {
      m.hp = q.hpEvents.filter(e => e.memberId === m.id).reduce((hp, e) => Math.max(0, Math.min(100, hp + e.amount)), 100);
      m.exp = { base: 0, bonus: 0, total: 0 };
      q.expEvents.filter(e => e.memberId === m.id).forEach(e => { m.exp[e.type] = round(m.exp[e.type] + e.amount); });
      m.exp.total = round(m.exp.base + m.exp.bonus);
      m.evaluation = evaluation(m);
    }
    return q;
  }
  function started(q, taskId, memberId) {
    open(q); const t = task(q, taskId); member(q, memberId);
    fail(t.assignees.includes(memberId) && t.status !== 'done' && t.wanted?.status !== 'open', '現在の担当者が、未完了のタスクで操作してください。');
    if (!t.startedBy.includes(memberId)) t.startedBy.push(memberId);
    t.responses[memberId] = stamp(q); t.status = 'doing';
    log(q, '着手・応答', { taskId, memberId, note: '取り組み状況を更新しました。' });
  }
  function submit(q, taskId, memberId, evidence, url = '') {
    open(q); const t = task(q, taskId); member(q, memberId);
    fail(t.assignees.includes(memberId) && t.status !== 'done' && t.wanted?.status !== 'open', '現在の担当者が、未完了のタスクで提出してください。');
    const content = text(evidence, '成果物の内容・自分の貢献');
    if (url) { fail(typeof url === 'string' && url.length <= 2000, '成果物URLが長すぎます。'); let parsed; try { parsed = new URL(url); } catch {} fail(parsed && ['http:', 'https:'].includes(parsed.protocol), '成果物URLは http または https で入力してください。'); }
    const submission = { id: uid(q, 'submission'), taskId, memberId, evidence: content, url, at: stamp(q) };
    q.submissions.push(submission); t.responses[memberId] = stamp(q); t.status = 'review';
    if (!t.startedBy.includes(memberId)) t.startedBy.push(memberId);
    log(q, '成果物提出', { taskId, memberId, submissionId: submission.id, note: content });
    return submission;
  }
  function approve(q, taskId, shares, reason, verified) {
    open(q); const t = task(q, taskId);
    fail(verified === true, '成果物と実際の貢献を確認したことにチェックしてください。');
    const note = text(reason, '確認内容・承認理由');
    fail(t.status !== 'done', 'このタスクはすでに確認・完了しています。');
    fail(t.wanted?.status !== 'open', '懸賞公開中は貢献を確定できません。掲載を取り消すか、引き受け後に確認してください。');
    fail(shares && typeof shares === 'object' && Object.keys(shares).every(id => q.members.some(m => m.id === id)), '貢献割合のメンバーが不正です。');
    let sum = 0, delta = 0;
    const changes = q.members.map(m => {
      const value = shares[m.id] ?? t.contributions[m.id], prev = t.contributions[m.id];
      fail(Number.isInteger(value) && value >= prev && value <= 100, '確認割合は現在以上・100%以下の整数で入力してください。付与済みの貢献は取り消しません。');
      if (value > prev) {
        fail(t.assignees.includes(m.id), '引き継ぎ前に確認済みの貢献は保持します。追加の貢献は現在の担当者にのみ付与できます。');
        fail(q.submissions.some(s => s.taskId === taskId && s.memberId === m.id), `${m.name}さんの成果物が未提出です。`);
      }
      sum += value; delta += value - prev; return { memberId: m.id, prev, value };
    });
    fail(sum <= 100, '全員の確認済み割合の合計を100%以下にしてください。');
    const pendingSubmissions = q.submissions.filter(s => s.taskId === taskId && !s.reviewedAt);
    fail(delta > 0 || pendingSubmissions.length > 0, '新しく確認した貢献割合を入力してください。同じ作業には再付与しません。');
    const reviewId = uid(q, 'review');
    pendingSubmissions.forEach(s => { s.reviewedAt = stamp(q); s.reviewId = reviewId; s.reviewReason = note; });
    changes.forEach(({ memberId, prev, value }) => {
      if (value === prev) return;
      q.expEvents.push({ id: uid(q, 'exp'), reviewId, taskId, memberId, type: 'base', amount: round(t.baseExp * (value - prev) / 100), at: stamp(q), reason: note });
      if (t.wanted?.status === 'claimed' && t.wanted.claimedBy === memberId) {
        const w = t.wanted;
        const creditedPercent = value - w.sharesAtPost[memberId];
        const earned = Math.min(w.bonusPool, round(w.bonusPool * creditedPercent / w.remainingPercent));
        const awarded = q.expEvents.filter(e => e.taskId === taskId && e.type === 'bonus').reduce((s, e) => s + e.amount, 0);
        const bonusDelta = round(earned - awarded);
        if (bonusDelta > 0) q.expEvents.push({ id: uid(q, 'exp'), reviewId, taskId, memberId, type: 'bonus', amount: bonusDelta, at: stamp(q), reason: '引き継いだ未完了分の確認済み貢献に対する懸賞ボーナス。' });
      }
      t.contributions[memberId] = value;
    });
    if (sum === 100) { t.status = 'done'; t.completedAt = stamp(q); if (t.wanted?.status === 'claimed') t.wanted.status = 'closed'; }
    else t.status = 'doing';
    log(q, sum === 100 ? 'タスク完了' : delta > 0 ? '部分貢献の確認' : '成果確認（追加EXPなし）', { taskId, reviewId, shares: copy(t.contributions), note });
    recompute(q);
  }
  function penaltyEligibility(q, t, memberId, type) {
    if (q.closedAt || t.status === 'done' || !t.assignees.includes(memberId) || t.wanted?.status === 'open') return '未完了タスクの現在の担当者を選んでください。';
    if (q.hpEvents.some(e => e.kind === 'penalty' && e.taskId === t.id && e.memberId === memberId && e.penaltyType === type)) return 'この違反はすでに記録済みです（免除済みも含む）。';
    const now = Date.parse(q.clock), due = endOfDay(t.deadline);
    if (type === 'unstarted' && (now <= endOfDay(t.checkpoint) || t.startedBy.includes(memberId) || t.contributions[memberId] > 0)) return '中間チェック日を過ぎた未着手の担当者が対象です。';
    if (type === 'overdue' && now <= due) return '締め切りを過ぎたタスクが対象です。';
    if (type === 'silent') {
      if (!q.hpEvents.some(e => e.taskId === t.id && e.memberId === memberId && e.penaltyType === 'overdue' && e.amount < 0)) return '期限超過の記録を先に確認してください。';
      if (now < Math.max(due, Date.parse(t.responses[memberId] || 0) || 0) + 2 * 86400000) return '締め切り・最後の応答から2日以上経過していません。';
    }
    return null;
  }
  function penalize(q, taskId, memberId, type, reason, unjustified) {
    open(q); const t = task(q, taskId); member(q, memberId);
    fail(PENALTIES[type], '違反の種類を選択してください。');
    fail(unjustified === true, '本人の事情・分配の妥当性を確認し、正当な理由がないことを確認してください。');
    const note = text(reason, '確認した事実・理由'), error = penaltyEligibility(q, t, memberId, type); fail(!error, error);
    const event = { id: uid(q, 'hp'), kind: 'penalty', taskId, memberId, penaltyType: type, amount: -PENALTIES[type].amount, originalAmount: -PENALTIES[type].amount, at: stamp(q), reason: note, revisions: [] };
    q.hpEvents.push(event); log(q, 'HP減点', { memberId, taskId, eventId: event.id, amount: event.amount, note }); recompute(q); return event;
  }
  function correctPenalty(q, eventId, amount, reason) {
    const event = q.hpEvents.find(e => e.id === eventId && e.kind === 'penalty'); fail(event, '減点記録が見つかりません。');
    fail(Number.isInteger(amount) && amount >= 0 && amount <= 100, '修正後の減点量は0～100の整数にしてください。0で免除します。');
    const note = text(reason, '免除・修正の理由');
    fail(event.amount !== -amount, '減点量が変更されていません。');
    event.revisions.push({ before: event.amount, after: -amount, at: stamp(q), reason: note }); event.amount = -amount;
    log(q, 'HP免除・修正', { eventId, memberId: event.memberId, amount: -amount, note }); recompute(q);
  }
  function requestRecovery(q, memberId, title, evidence) {
    open(q); const m = member(q, memberId); fail(m.hp < 100, 'HPはすでに100です。');
    const name = text(title, '補救・復活クエスト名', 100), proof = text(evidence, '達成内容・成果物');
    fail(!q.recoveries.some(r => r.memberId === memberId && r.status === 'pending'), 'このメンバーには確認待ちの補救クエストがあります。');
    fail(!q.recoveries.some(r => r.memberId === memberId && r.title === name && r.evidence === proof), '同じ補救クエストの成果はすでに記録済みです。別の達成内容を提出してください。');
    const r = { id: uid(q, 'recovery'), memberId, title: name, evidence: proof, status: 'pending', at: stamp(q), approvedAt: null };
    q.recoveries.push(r); log(q, '補救クエスト提出', { memberId, recoveryId: r.id, note: name }); return r;
  }
  function approveRecovery(q, id, reason, verified) {
    open(q); const r = q.recoveries.find(r => r.id === id); fail(r && r.status === 'pending', 'この補救クエストは未提出、または確認済みです。');
    fail(verified === true, '補救クエストの達成を確認してください。'); const note = text(reason, '達成の確認理由');
    q.hpEvents.push({ id: uid(q, 'hp'), kind: 'recovery', memberId: r.memberId, recoveryId: r.id, amount: 10, at: stamp(q), reason: note });
    r.status = 'approved'; r.approvedAt = stamp(q); log(q, '補救クエスト承認', { memberId: r.memberId, recoveryId: r.id, note }); recompute(q);
  }
  function postWanted(q, taskId, reason, unjustified) {
    open(q); const t = task(q, taskId); const note = text(reason, '放置の状況・掲載理由');
    fail(unjustified === true, '正当な理由がなく未完了で放置されていることを確認してください。');
    fail(t.status !== 'done' && !t.wanted, '完了済み、または掲載済みのタスクです。');
    fail(!q.submissions.some(s => s.taskId === taskId && !s.reviewedAt), '未確認の成果物があります。元担当の貢献を先に確認・承認してください（追加貢献がない場合は現在の割合のまま確認できます）。');
    fail(q.members.some(m => !t.assignees.includes(m.id)), '全員が担当中のため、引き受け可能な別メンバーがいません。');
    const percent = Object.values(t.contributions).reduce((a, b) => a + b, 0);
    fail(percent < 100, '作業はすべて確認済みです。');
    t.wanted = { status: 'open', postedAt: stamp(q), originalAssignees: [...t.assignees], sharesAtPost: copy(t.contributions), remainingPercent: 100 - percent, bonusPool: round(t.baseExp * 0.2), claimedBy: null, claimedAt: null, reason: note };
    log(q, '懸賞掲載', { taskId, note });
  }
  function cancelWanted(q, taskId, reason) {
    open(q); const t = task(q, taskId); fail(t.wanted?.status === 'open', '引き受け前の懸賞だけ取り消せます。');
    const note = text(reason, '掲載取消の理由'); log(q, '懸賞掲載取消', { taskId, wanted: t.wanted, note }); t.wanted = null;
  }
  function claim(q, taskId, memberId) {
    open(q); const t = task(q, taskId); const m = member(q, memberId); fail(t.wanted?.status === 'open', 'この懸賞はすでに引き受け済み、または掲載されていません。');
    fail(!t.wanted.originalAssignees.includes(memberId), '元の担当者以外のメンバーを選んでください。');
    t.wanted.status = 'claimed'; t.wanted.claimedBy = memberId; t.wanted.claimedAt = stamp(q); t.assignees = [memberId]; t.status = 'todo'; t.responses[memberId] = stamp(q);
    log(q, '懸賞引き継ぎ', { taskId, memberId, originalAssignees: t.wanted.originalAssignees, note: `${m.name}さんが残りの作業を引き受けました。元の目標EXPと確認済みEXPは維持します。` });
  }
  function adjustTarget(q, memberId, target, reason, basis) {
    const m = member(q, memberId); fail(Number.isFinite(target) && target >= 0 && target <= 1000000 && round(target) === target, '目標EXPは0～1,000,000を小数第2位までで入力してください。');
    fail(['consensus', 'unavoidable'].includes(basis), 'チーム全員の合意、またはやむを得ない事情を確認してください。');
    const note = text(reason, '目標EXPの変更理由'); fail(target !== m.targetExp, '目標EXPが変更されていません。');
    log(q, '目標EXP変更', { memberId, before: m.targetExp, after: target, basis, note }); m.targetExp = target; recompute(q);
  }
  function teacherReview(q, memberId, comment, score, reason) {
    const m = member(q, memberId); const note = text(comment, '教員コメント');
    fail(score === null || Number.isInteger(score) && score >= 0 && score <= 100, '調整スコアは0～100の整数、または空欄にしてください。');
    fail(score === null || m.targetExp > 0, '目標EXPが0のため評価対象外です。まず目標と事情を確認してください。');
    const changed = score !== (m.teacherAdjustment?.score ?? null);
    if (changed) text(reason, 'スコア調整・解除の理由');
    log(q, '教員コメント・評価調整', { memberId, before: m.teacherAdjustment?.score ?? null, after: score, comment: note, note: reason || 'コメントを記録しました。' });
    m.teacherComment = note; m.teacherAdjustment = score === null ? null : { score, reason: reason || m.teacherAdjustment?.reason, at: stamp(q) }; recompute(q);
  }
  function setDates(q, taskId, checkpoint, deadline, reason) {
    open(q); const t = task(q, taskId); fail(t.status !== 'done', '完了タスクの日付は変更できません。');
    fail(validDate(checkpoint) && validDate(deadline) && checkpoint <= deadline, '有効な日付を入力し、中間チェック日を締め切り以前にしてください。');
    const note = text(reason, '日付の変更理由'); log(q, '日付変更', { taskId, before: { checkpoint: t.checkpoint, deadline: t.deadline }, after: { checkpoint, deadline }, note }); t.checkpoint = checkpoint; t.deadline = deadline;
  }
  function reassign(q, taskId, assignees, basis, reason) {
    open(q); const t = task(q, taskId);
    fail(t.status !== 'done' && !t.wanted, '未完了で懸賞の記録がないタスクを選んでください。公開中の懸賞は先に取り消してください。');
    fail(!q.submissions.some(s => s.taskId === taskId && !s.reviewedAt), '元担当の未確認の成果物を、役割変更の前に確認してください。');
    fail(Array.isArray(assignees) && assignees.length > 0 && new Set(assignees).size === assignees.length && assignees.every(id => q.members.some(m => m.id === id)), '新しい担当メンバーを1人以上選択してください。');
    fail(['consensus', 'unavoidable'].includes(basis), '全員の合意またはやむを得ない事情を確認してください。');
    const note = text(reason, '正式な役割変更の理由');
    fail([...t.assignees].sort().join(',') !== [...assignees].sort().join(','), '担当メンバーが変更されていません。');
    log(q, '正式な役割変更', { taskId, beforeAssignees: t.assignees, afterAssignees: assignees, basis, note });
    t.assignees = [...assignees]; t.assignees.forEach(id => { t.responses[id] = stamp(q); });
  }
  function setClock(q, iso) { fail(q.isDemo, '日付送りはデモ専用です。'); open(q); fail(!Number.isNaN(Date.parse(iso)) && Date.parse(iso) >= Date.parse(q.clock), 'デモ日時は現在以降を指定してください。'); q.clock = new Date(iso).toISOString(); log(q, 'デモ日時変更', { note: q.clock }); }
  function closeActivity(q, reason) { open(q); const note = text(reason, '活動終了の確認理由'); q.closedAt = stamp(q); log(q, '活動終了', { note }); recompute(q); }
  function reopen(q, reason) { fail(q.closedAt, '活動はすでに進行中です。'); const note = text(reason, '再開の理由'); q.closedAt = null; log(q, '活動再開', { note }); }
  function stats(q, id) {
    member(q, id);
    const initial = q.tasks.filter(t => t.initialAssignees.includes(id)), current = q.tasks.filter(t => t.assignees.includes(id));
    return { initial: initial.length, current: current.length, completed: q.tasks.filter(t => t.status === 'done' && t.contributions[id] > 0).length,
      unfinished: initial.filter(t => t.status !== 'done').length, currentUnfinished: current.filter(t => t.status !== 'done').length,
      contributed: q.tasks.filter(t => t.contributions[id] > 0).length,
      submitted: q.submissions.filter(s => s.memberId === id).length,
      taken: q.tasks.filter(t => t.wanted?.claimedBy === id).length,
      transferred: q.tasks.filter(t => t.wanted?.claimedBy && t.wanted.originalAssignees.includes(id)).length };
  }
  function valid(q) {
    return q?.version === 1 && Array.isArray(q.members) && q.members.length >= 2 && q.members.every(m => typeof m.id === 'string' && typeof m.name === 'string' && Number.isFinite(m.targetExp) && m.targetExp >= 0)
      && Array.isArray(q.tasks) && q.tasks.every(t => t.contributions && Array.isArray(t.assignees) && Array.isArray(t.initialAssignees) && Array.isArray(t.startedBy) && t.responses && Number.isFinite(t.baseExp))
      && ['audit', 'hpEvents', 'expEvents', 'submissions', 'recoveries'].every(k => Array.isArray(q[k])) && Number.isInteger(q.sequence) && !Number.isNaN(Date.parse(q.clock));
  }
  const DEMO_STEPS = ['AIで役割を分配', '基本EXPを計算', '成果確認でEXPを付与', '未着手・遅延等でHP減点', '懸賞掲示板に掲載', '別メンバーが引き受け', '確認して懸賞ボーナス獲得', 'HP 0・ゲームオーバー', '復活クエストでHP回復', '100点満点の最終評価', '教員用画面で確認'];
  function createDemo(engine, now = new Date().toISOString()) {
    const members = ['田中 はるか', '佐藤 りく', '鈴木 あおい', '高橋 そうた'].map((name, i) => ({ id: `demo-member-${i}`, name, skills: Array(8).fill(1), wishes: [], avoids: [], time: 3 }));
    const names = ['調査レポート', 'アンケート設計', '関連文献の整理', 'データの収集', '結果の可視化', 'スライドの構成', '発表原稿', '参考資料の確認', '図表のデザイン', '進捗の整理', '発表の練習', '最終チェック'];
    const tasks = names.map((name, i) => ({ id: `demo-task-${i}`, name, skills: [i % 8], hours: 1, count: 1, difficulty: i === 0 ? 3 : 2, workload: i === 0 ? 3 : 2, complexity: 2 }));
    const result = engine.assign(members, tasks);
    const q = create(members, tasks, result, now, true);
    q.title = '発表用デモ・チームの冒険'; q.demoStep = 1; q.demoOrigin = q.tasks[0].assignees[0]; q.demoClaimant = q.members.find(m => m.id !== q.demoOrigin).id;
    q.demoMessage = '既存の自動マッチングで12タスクを4人に分配しました。全員HP 100からスタート。';
    return q;
  }
  function advanceDemo(q) {
    fail(q.isDemo && q.demoStep >= 1 && q.demoStep <= 10, '体験できる次のデモ操作はありません。');
    const t = q.tasks[0], origin = q.demoOrigin, taker = q.demoClaimant;
    switch (q.demoStep) {
      case 1:
        q.selected = t.id; q.detailTab = 'work'; q.view = 'board';
        q.demoMessage = '調査レポートは難易度3・作業量3・煩雑さ2。10 × (3＋3＋2) ＝ 80 EXPです。'; break;
      case 2: {
        const finished = q.tasks.find(u => u.id !== t.id && !u.assignees.includes(origin)); const owner = finished.assignees[0];
        submit(q, finished.id, owner, 'デモ成果物：構成・資料を作成し、チームで内容を確認しました。'); approve(q, finished.id, { [owner]: 100 }, 'デモ確認：提出内容と担当者の100%の貢献を確認。', true);
        submit(q, t.id, origin, 'デモ成果物：調査レポートの先行研究・導入部分（全体の25%）。'); approve(q, t.id, { [origin]: 25 }, 'デモ確認：導入部分の貢献25%を確認。残り75%は未完了。', true);
        q.demoMessage = '完了タスクにEXPを付与。調査レポートの元担当にも部分貢献20 EXPを記録しました。通常の完了ではHPは増えません。'; break;
      }
      case 3: {
        setClock(q, new Date(Date.parse(q.createdAt) + 11 * 86400000).toISOString());
        const other = q.tasks.find(u => u.id !== t.id && u.assignees.includes(origin));
        penalize(q, other.id, origin, 'unstarted', 'デモ上の事実：中間チェックを過ぎても未着手。事情を確認し、正当な理由なし。', true);
        for (const type of ['overdue', 'silent', 'abandoned']) penalize(q, t.id, origin, type, `デモ上の事実：${PENALTIES[type].label}。事情・分配を確認済み。`, true);
        q.demoMessage = 'デモ日時を11日後に進め、未着手・遅延・応答なし・放棄を個別記録。各違反は1回だけ減点されます。'; break;
      }
      case 4:
        postWanted(q, t.id, 'デモ確認：25%は確認済み、残り75%が協議なく放置されています。', true); q.view = 'wanted';
        q.demoMessage = '80 EXPのタスクに、20%の懸賞16 EXPを設定。元担当の20 EXPを残し、引き継ぎ分は60＋16＝76 EXPです。'; break;
      case 5:
        claim(q, t.id, taker); q.demoMessage = '別のメンバーが残り75%を引き受けました。元担当者の目標EXPは減らしません。'; break;
      case 6:
        submit(q, t.id, taker, 'デモ成果物：調査レポートの分析・考察・校正（残り75%）を完成。'); approve(q, t.id, { [taker]: 75 }, 'デモ確認：元担当25%・引受担当75%で完成。基本EXP合計80、懸賞合計16。', true);
        q.view = 'board'; q.demoMessage = '元担当20 EXP、引受担当60＋16 EXP。基本EXPは合計80で二重計上されず、HPも回復しません。'; break;
      case 7:
        for (const u of q.tasks.filter(u => u.id !== t.id && u.assignees.includes(origin) && u.status !== 'done')) {
          for (const type of Object.keys(PENALTIES)) if (!penaltyEligibility(q, u, origin, type)) penalize(q, u.id, origin, type, `デモ上の別タスクの事実：${PENALTIES[type].label}。同一違反の重複ではありません。`, true);
        }
        fail(member(q, origin).hp === 0, 'デモ対象のタスクが変更されています。新しいデモでこの手順を体験できます。');
        q.demoMessage = '別タスクの違反を記録し、HPが0になりました。ゲームオーバーですが、確認済みEXPと部分貢献は失いません。'; break;
      case 8: {
        const r = requestRecovery(q, origin, 'チームへの状況共有と残作業の整理', 'デモ成果物：未完了事項と引き継ぎ手順を整理し、メンバーへ共有。');
        approveRecovery(q, r.id, 'デモ確認：整理した内容と共有の実施を確認しました。', true);
        q.demoMessage = '復活クエストの達成を確認して＋10 HP。HP 10で復帰し、EXPは増えません。'; break;
      }
      case 9:
        closeActivity(q, '発表用デモの活動を終了し、確認済みの記録から評価を確認。'); q.view = 'report';
        q.demoMessage = '最終評価は100点上限。評価対象の懸賞ボーナスは目標の10%までで、累積EXPとは別に記録されます。'; break;
      case 10:
        q.view = 'teacher'; q.teacherMember = origin;
        q.demoMessage = '教員用画面で、HP・EXP・目標・評価・成果物・全履歴を確認できます。認証のない同一端末のデモ操作です。'; break;
    }
    q.demoStep++; log(q, 'デモ操作', { note: q.demoMessage }); recompute(q);
  }
  const api = { PENALTIES, round, create, baseExp, evaluation, recompute, started, submit, approve, penaltyEligibility, penalize, correctPenalty, requestRecovery, approveRecovery, postWanted, cancelWanted, claim, adjustTarget, teacherReview, setDates, reassign, setClock, closeActivity, reopen, stats, valid, dateInJapan, dayAfter, DEMO_STEPS, createDemo, advanceDemo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QuestEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
