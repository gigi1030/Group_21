/* 外部依存のないマッチングエンジン。ブラウザと Node.js で同じロジックを使う。 */
(function (root) {
  'use strict';
  const SKILLS = [
    { name: '情報収集・リサーチ', short: 'リサーチ', icon: 'search', color: 'blue' },
    { name: 'アイデア発想・企画', short: '企画・発想', icon: 'bulb', color: 'amber' },
    { name: '資料作成・デザイン', short: '資料・デザイン', icon: 'palette', color: 'purple' },
    { name: '文章作成・まとめ', short: '文章作成', icon: 'pen', color: 'mint' },
    { name: 'データ分析', short: 'データ分析', icon: 'chart', color: 'blue' },
    { name: 'プレゼンテーション', short: 'プレゼン', icon: 'mic', color: 'rose' },
    { name: 'スケジュール管理', short: '進捗管理', icon: 'calendar', color: 'amber' },
    { name: 'コミュニケーション・調整', short: '調整・対話', icon: 'chat', color: 'mint' }
  ];
  const TIME_OPTIONS = [
    { label: '1時間未満', hours: 0.5 }, { label: '1～3時間', hours: 2 },
    { label: '3～5時間', hours: 4 }, { label: '5時間以上', hours: 6 }
  ];
  const descriptions = ['必要な情報を調べたり、参考資料を探したりすること。', '新しいアイデアを考えたり、企画の方向性を決めたりすること。', 'PowerPointなどで、見やすい資料を作ること。', 'レポートを書いたり、情報を文章にまとめたりすること。', 'アンケート結果や数値を整理・分析すること。', '人前で発表したり、内容を分かりやすく説明したりすること。', '作業の締め切りを決めたり、全体の進み具合を確認したりすること。', 'メンバーの意見をまとめたり、話し合いを進めたりすること。'];
  SKILLS.forEach((skill, i) => { skill.description = descriptions[i]; });
  const defaultTasks = () => [
    ['情報収集', [0], 2], ['企画・アイデア出し', [1], 1.5],
    ['PPT・資料作成', [2], 3], ['レポート作成', [3], 2.5],
    ['データ分析', [4], 2], ['プレゼンテーション', [5], 1.5],
    ['進捗管理', [6, 7], 1]
  ].map(([name, skills, hours], i) => ({ id: `task-${i}`, name, skills, hours, count: 1 }));
  const preferred = (member, task) => task.skills.some(s => member.wishes.includes(s));
  const avoided = (member, task) => task.skills.some(s => member.avoids.includes(s));
  function conflicts(members, tasks, locked = {}) {
    return tasks.filter(t => !Object.prototype.hasOwnProperty.call(locked, t.id)).map(task => ({
      taskId: task.id, candidates: members.filter(m => preferred(m, task)).map(m => m.id)
    })).filter(c => c.candidates.length > tasks.find(t => t.id === c.taskId).count);
  }
  function suitability(member, task) {
    const skill = task.skills.reduce((sum, s) => sum + member.skills[s], 0) / task.skills.length;
    return skill * 4 + (preferred(member, task) ? 5 : 0) - (avoided(member, task) ? 10 : 0) + Math.max(-10, Math.min(10, member.taskScores?.[task.id] || 0));
  }
  function assign(members, tasks, locked = {}) {
    if (members.length < 2 || members.length > 6 || !tasks.length) throw new Error('メンバーとタスクを確認してください。');
    const byId = Object.fromEntries(members.map(m => [m.id, m]));
    const assignments = {};
    const loads = Object.fromEntries(members.map(m => [m.id, 0]));
    const counts = Object.fromEntries(members.map(m => [m.id, 0]));
    const burden = (m, hours) => 2 * hours * hours / TIME_OPTIONS[m.time].hours + 0.25 * hours * hours;
    const benefit = (m, t) => suitability(m, t) + (counts[m.id] === 0 ? 14 : 0)
      - burden(m, loads[m.id] + t.hours / t.count) + burden(m, loads[m.id]);
    for (const t of tasks) {
      if (!Number.isInteger(t.count) || t.count < 1 || t.count > members.length || !(t.hours > 0) || !t.skills.length) throw new Error('タスクの設定を確認してください。');
      assignments[t.id] = [...(locked[t.id] || [])];
      if (new Set(assignments[t.id]).size !== assignments[t.id].length || assignments[t.id].length > t.count || assignments[t.id].some(id => !byId[id])) throw new Error('じゃんけんの結果を確認してください。');
      assignments[t.id].forEach(id => { loads[id] += t.hours / t.count; counts[id]++; });
    }
    // 大きい作業から埋め、負担増・得意・希望・回避を同時に評価する。
    const ordered = [...tasks].sort((a, b) => b.hours / b.count - a.hours / a.count);
    for (const t of ordered) {
      while (assignments[t.id].length < t.count) {
        const candidates = members.filter(m => !assignments[t.id].includes(m.id));
        candidates.sort((a, b) => benefit(b, t) - benefit(a, t) || a.id.localeCompare(b.id));
        const id = candidates[0].id;
        assignments[t.id].push(id); loads[id] += t.hours / t.count; counts[id]++;
      }
    }
    function objective() {
      let value = members.reduce((sum, m) => sum - burden(m, loads[m.id]) + (counts[m.id] > 0 ? 14 : 0), 0);
      tasks.forEach(t => assignments[t.id].forEach(id => { value += suitability(byId[id], t); }));
      return value;
    }
    function replace(t, i, next) {
      const prev = assignments[t.id][i];
      assignments[t.id][i] = next;
      loads[prev] -= t.hours / t.count; loads[next] += t.hours / t.count;
      counts[prev]--; counts[next]++;
    }
    // 局所探索で担当移動・交換を評価。じゃんけんで獲得した枠は動かさない。
    let best = objective();
    for (let pass = 0; pass < 30; pass++) {
      let improved = false;
      for (const t of tasks) {
        for (let i = 0; i < assignments[t.id].length; i++) {
          if ((locked[t.id] || []).includes(assignments[t.id][i])) continue;
          for (const m of members) {
            if (assignments[t.id].includes(m.id)) continue;
            const prev = assignments[t.id][i]; replace(t, i, m.id);
            const score = objective();
            if (score > best + 1e-7) { best = score; improved = true; }
            else replace(t, i, prev);
          }
          for (const u of tasks) {
            if (t.id === u.id) continue;
            for (let j = 0; j < assignments[u.id].length; j++) {
              const a = assignments[t.id][i], b = assignments[u.id][j];
              if ((locked[u.id] || []).includes(b) || assignments[t.id].includes(b) || assignments[u.id].includes(a)) continue;
              replace(t, i, b); replace(u, j, a);
              const score = objective();
              if (score > best + 1e-7) { best = score; improved = true; }
              else { replace(u, j, b); replace(t, i, a); }
            }
          }
        }
      }
      if (!improved) break;
    }
    const reasons = {};
    tasks.forEach(t => {
      reasons[t.id] = {};
      assignments[t.id].forEach(id => {
        const m = byId[id];
        const strong = t.skills.filter(s => m.skills[s] === 2).map(s => SKILLS[s].short);
        const parts = [];
        if ((locked[t.id] || []).includes(id)) parts.push('希望が重なったため、じゃんけんで担当を獲得しました');
        else if (strong.length) parts.push(`${strong.join('・')}が得意なことを活かせます`);
        else parts.push('全員のスキルと作業時間のバランスから提案しました');
        if (preferred(m, t)) parts.push('やってみたい役割とも一致しています');
        if (avoided(m, t)) parts.push('避けたい分野を含むため、チームでサポートを相談してください');
        if (t.skills.some(s => m.skills[s] === 0)) parts.push('苦手な分野は、得意なメンバーと協力して進めましょう');
        reasons[t.id][id] = parts.join('。') + '。';
      });
    });
    return { assignments, loads, reasons, createdAt: new Date().toISOString() };
  }
  function resolveRound(hands, candidates, slots) {
    if (!Number.isInteger(slots) || slots < 1 || slots >= candidates.length) throw new Error('残りの担当人数が不正です。');
    if (candidates.some(id => !['rock', 'scissors', 'paper'].includes(hands[id]))) throw new Error('全員の手を選択してください。');
    const kinds = [...new Set(candidates.map(id => hands[id]))];
    if (kinds.length !== 2) return { tie: true, selected: [], next: [...candidates], winners: [] };
    const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
    const winningHand = beats[kinds[0]] === kinds[1] ? kinds[0] : kinds[1];
    const winners = candidates.filter(id => hands[id] === winningHand);
    const losers = candidates.filter(id => hands[id] !== winningHand);
    if (winners.length > slots) return { tie: false, selected: [], next: winners, winners };
    if (winners.length === slots) return { tie: false, selected: winners, next: [], winners };
    return { tie: false, selected: winners, next: losers, winners };
  }
  // 実AI連携時はこの非同期インターフェースを、サーバー側APIを呼ぶ実装へ差し替える。
  const MatchingService = { async propose({ members, tasks, locked = {} }) { return assign(members, tasks, locked); } };
  const api = { SKILLS, TIME_OPTIONS, defaultTasks, preferred, avoided, conflicts, suitability, assign, resolveRound, MatchingService };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
