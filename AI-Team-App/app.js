(() => {
  'use strict';
  if (window.TeamShared && !new URLSearchParams(window.location.search).has('demo')) { window.TeamShared.start(); return; }
  const E = window.TeamEngine;
  const { SKILLS, TIME_OPTIONS } = E;
  const KEY = 'teamquest-session-v1', SAVE_KEY = 'teamquest-results-v1';
  const $ = s => document.querySelector(s);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n.toFixed(2)).toLocaleString('ja-JP');
  const icons = {
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    bulb: '<path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c2 0 3-1 2-3s0-3 2-3h2c5 0 4-12-6-12Z"/><path d="M7 10h.01M10 6h.01M16 7h.01M6 15h.01" stroke-width="3"/>',
    pen: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
    chart: '<path d="M4 3v17h17M8 16v-5m5 5V6m5 10V9"/>',
    mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-13 5 3 2 5-4"/>',
    chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 1-7a8 8 0 0 1 7-12h3a8 8 0 0 1 8 8Z"/><path d="M7 10h10m-10 4h6"/>',
    users: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3m0-17a3 3 0 0 1 0 6m3 4a6 6 0 0 1 3 5v2"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7"/>',
    flag: '<path d="M5 22V3c4-4 10 4 15 0v11c-5 4-11-4-15 0"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 8h.01M16 16h.01M8 16h.01M16 8h.01M12 12h.01" stroke-width="3"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 2v6m-5 1h10"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    book: '<path d="M12 5v16M3 3c4 0 7 1 9 3 2-2 5-3 9-3v15c-4 0-7 1-9 3-2-2-5-3-9-3Z"/>',
    refresh: '<path d="M20 8a9 9 0 1 0 1 8M20 2v6h-6"/>'
  };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
  const avatar = (m, i, size = '') => `<span class="avatar avatar-${i % 6} ${size}" aria-hidden="true">${escape((m.name || String(i + 1)).slice(0, 1))}</span>`;
  const blankMember = i => ({ id: `member-${i}`, name: '', skills: Array(8).fill(null), wishes: [], avoids: [], time: null, done: false });
  const fresh = () => ({ version: 1, screen: 'diagnosis', count: 4, members: Array.from({ length: 4 }, (_, i) => blankMember(i)), current: 0, tasks: E.defaultTasks(), locked: {}, game: null, result: null, isSample: false });
  let storageError = false, restoreError = false, busy = false, pendingConfirm = null, toastTimer;
  function readStorage(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { restoreError = true; return null; } }
  function validMember(m) {
    return m && typeof m.id === 'string' && typeof m.name === 'string' && Array.isArray(m.skills) && m.skills.length === 8 && m.skills.every(s => s === null || [0, 1, 2].includes(s))
      && ['wishes', 'avoids'].every(k => Array.isArray(m[k]) && m[k].length <= 2 && m[k].every(s => Number.isInteger(s) && s >= 0 && s < 8)) && (m.time === null || [0, 1, 2, 3].includes(m.time));
  }
  function validState(s) {
    return s?.version === 1 && ['diagnosis', 'overview', 'tasks', 'game', 'results', 'activity'].includes(s.screen) && Number.isInteger(s.count) && s.count >= 2 && s.count <= 6
      && Array.isArray(s.members) && s.members.length === s.count && s.members.every(validMember) && new Set(s.members.map(m => m.id)).size === s.count
      && Number.isInteger(s.current) && s.current >= 0 && s.current < s.count && Array.isArray(s.tasks) && s.tasks.length <= 30
      && s.tasks.every(t => typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.skills) && t.skills.every(v => Number.isInteger(v) && v >= 0 && v < 8))
      && s.locked && typeof s.locked === 'object' && (s.screen !== 'results' || s.result?.assignments && s.result?.loads && s.result?.reasons)
      && (s.screen !== 'game' || s.game && Array.isArray(s.game.active) && s.tasks.some(t => t.id === s.game.taskId));
  }
  const restored = readStorage(KEY);
  let state = validState(restored) ? restored : fresh();
  if (restored && !validState(restored)) restoreError = true;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageError = false; }
    catch { storageError = true; }
    updateSaveStatus();
  }
  function updateSaveStatus() {
    const el = $('#save-status');
    if (el) { el.textContent = storageError ? '自動保存できません（ブラウザ設定を確認）' : 'このブラウザに自動保存中'; el.classList.toggle('warning', storageError); }
  }
  function toast(message) {
    $('#toast').textContent = message; $('#toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200);
  }
  function confirmAction(title, message, callback, label = '続ける') {
    $('#dialog-title').textContent = title; $('#dialog-message').textContent = message; $('#dialog-ok').textContent = label;
    pendingConfirm = callback; $('#confirm-dialog').showModal(); $('#dialog-cancel').focus();
  }
  $('#dialog-cancel').onclick = () => { pendingConfirm = null; $('#confirm-dialog').close(); };
  $('#dialog-ok').onclick = () => { const action = pendingConfirm; pendingConfirm = null; $('#confirm-dialog').close(); action?.(); };
  $('#confirm-dialog').addEventListener('cancel', () => { pendingConfirm = null; });
  function phase() { return state.screen === 'activity' ? state.result ? 4 : -1 : { diagnosis: 0, overview: 0, tasks: 1, game: 2, results: 3 }[state.screen]; }
  function go(screen, scroll = true) { state.screen = screen; persist(); render(); if (scroll) { window.scrollTo({ top: 0, behavior: 'instant' }); $('#page-title')?.focus({ preventScroll: true }); } }
  const completed = () => state.members.filter(m => m.done).length;
  function sidebar() {
    const labels = ['得意を見つける', 'AIと役割を考える', 'じゃんけんで決める', 'チームのできあがり'];
    const subs = ['メンバーのスキル診断', 'タスクの設定・自動分担', '希望が重なったときだけ', '役割と負担をチェック'];
    return `<aside class="sidebar"><div class="brand">${icon('spark')}<div>チームクエスト<small>みんなの得意で、前に進もう。</small></div></div>
      <div class="side-label">グループワークの第一歩</div><div class="quest-label"><span>01</span> スマート役割分担</div>
      <nav class="steps" aria-label="第1ステップの進行状況">${labels.map((label, i) => `<div class="step ${phase() === i ? 'active' : ''} ${phase() > i ? 'complete' : ''}" ${phase() === i ? 'aria-current="step"' : ''}><div class="step-dot">${phase() > i ? icon('check') : i + 1}</div><div><strong>${label}</strong><small>${subs[i]}</small></div></div>`).join('')}</nav>
      ${window.QuestUI ? `<button type="button" class="quest-label q-side-entry ${state.screen === 'activity' ? 'q-current' : ''}" data-action="q-open"><span>02</span> 活動・懸賞・振り返り ${icon('arrow')}</button>` : ''}
      <div class="sidebar-tip"><span class="tip-spark">✧</span><strong>違う得意が、チームの強さ。</strong><p>得意なことも、ちょっと苦手なことも。持ち寄れば、きっといいチームに。</p><div class="tip-people"><span>😊</span><span>😎</span><span>🙂</span><span class="tip-plus">＋</span></div></div>
      <div class="sidebar-bottom">${icon('lock')} データはこのブラウザだけに保存<small>授業・発表用プロトタイプ</small></div></aside>`;
  }
  function header() {
    return `<header class="topbar"><div class="breadcrumb">ワークスペース <span>/</span> <strong>${state.screen === 'activity' ? '第2ステップ：活動・評価' : '第1ステップ：役割分担'}</strong></div><div class="top-actions">${window.QuestUI?.nav() || ''}<button class="button ghost small" data-action="saved">${icon('save')}<span>保存した結果</span></button><button class="button sample small" data-action="sample">${icon('dice')}<span>サンプルで体験</span></button></div></header>`;
  }
  function hero(kicker, title, desc, art = true) {
    return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="status-dot"></span> ${kicker}</div><h1 id="page-title" tabindex="-1">${title}</h1><p>${desc}</p></div>${art ? `<div class="party-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✧</span><div class="art-person person-one">🧑🏻‍🎨<span>アイデア</span></div><div class="art-person person-two">🧑🏻‍💻<span>リサーチ</span></div><div class="art-person person-three">🙋🏻‍♀️<span>コミュニケーション</span></div><div class="art-link">${icon('spark')}</div></div>` : ''}</section>`;
  }
  function pill(text, cls = '') { return `<span class="pill ${cls}">${text}</span>`; }
  function sectionHead(num, title, subtitle, right = '') {
    return `<div class="section-heading"><div class="section-title"><span class="section-number">${num}</span><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div></div>${right}</div>`;
  }
  function memberTabs() {
    return `<div class="member-tabs" aria-label="診断するメンバー">${state.members.map((m, i) => `<button class="member-tab ${state.current === i ? 'selected' : ''}" data-action="member" data-index="${i}" ${i > completed() && !m.done ? 'disabled' : ''} aria-pressed="${state.current === i}">${avatar(m, i, 'tiny')}<span>${escape(m.name || `メンバー ${i + 1}`)}</span>${m.done ? icon('check', 'member-check') : `<small>${i === state.current ? '入力中' : '未入力'}</small>`}</button>`).join('')}</div>`;
  }
  function diagnosis() {
    const m = state.members[state.current], answered = m.skills.filter(v => v !== null).length;
    return `${hero('第1ステップ ／ スキル診断', 'あなたの得意・不得意を<br>教えて！', 'あなたらしさが、チームの力になる。<br class="mobile-break">まずは一人ずつ、得意なことを見つけましょう。')}
      <div class="setup-strip"><div class="setup-label">${icon('users')}<div><strong>パーティーの人数</strong><small>何人で取り組みますか？</small></div></div><div class="count-picker" role="group" aria-label="グループの人数">${[2, 3, 4, 5, 6].map(n => `<button data-action="count" data-count="${n}" class="${state.count === n ? 'selected' : ''}" aria-pressed="${state.count === n}">${n}<small>人</small></button>`).join('')}</div><span class="setup-note">${icon('info')} 2〜6人でチームを組めます</span></div>
      <div class="member-progress"><div><strong>メンバーの診断</strong><span>${completed()} / ${state.count} 人 完了</span></div><div class="progress-track" role="progressbar" aria-label="全員の診断進捗" aria-valuenow="${completed()}" aria-valuemin="0" aria-valuemax="${state.count}"><span style="width:${completed() / state.count * 100}%"></span></div></div>
      ${memberTabs()}<form id="diagnosis-form" novalidate><section class="panel diagnosis-panel"><div class="member-form-heading"><div>${avatar(m, state.current)}<div><div class="overline">メンバー ${String(state.current + 1).padStart(2, '0')}</div><h2>あなたのことを教えてください</h2></div></div><span class="required-legend"><i></i> 必須項目</span></div>
      <div class="name-field"><label for="member-name">お名前 <span class="required">必須</span></label><input id="member-name" name="member-name" maxlength="24" placeholder="例：田中 はるか" autocomplete="off" value="${escape(m.name)}" required><small>チームで呼ばれたい名前でも大丈夫です。</small></div>
      <div class="divider"></div>${sectionHead('01', '8つのスキルをチェック', '直感で選んで大丈夫。正解・不正解はありません。', `<span class="answer-count" id="answer-count">${answered} / 8 回答</span>`)}
      <div class="skill-grid">${SKILLS.map((s, i) => `<fieldset class="skill-card"><legend><span class="skill-symbol ${s.color}">${icon(s.icon)}</span><span>${s.name}</span></legend><div class="rating-options">${[[2, '😊', '得意'], [1, '😐', '普通'], [0, '😵', '苦手']].map(([value, emoji, label]) => `<label class="rating"><input type="radio" name="skill-${i}" value="${value}" data-skill="${i}" ${m.skills[i] === value ? 'checked' : ''} required><span><b>${emoji}</b>${label}</span></label>`).join('')}</div></fieldset>`).join('')}</div>
      <div class="gentle-note">${icon('bulb')} 「苦手」も大切なヒント。チームで補い合える役割を探します。</div></section>
      <section class="panel preference-panel">${sectionHead('02', '今回の気持ちも、聞かせてください', '得意だけでなく、「やってみたい」も大切に。')}
        ${preferenceGroup('wishes', '今回、特にやってみたい役割は？', m)}
        ${preferenceGroup('avoids', 'できれば避けたい役割は？', m)}
        <div class="time-question"><label class="question-label">今週、グループワークに使える時間は？ <span class="required">必須</span></label><div class="time-options">${TIME_OPTIONS.map((t, i) => `<label><input type="radio" name="available-time" value="${i}" ${m.time === i ? 'checked' : ''} required><span>${icon('clock')}${t.label}</span></label>`).join('')}</div><small>使える時間に合わせて、作業量のバランスを調整します。</small></div>
      </section><div id="form-error" class="form-error" role="alert"></div><div class="page-actions"><span class="save-hint">${icon('lock')} 回答は自動保存されます</span><button type="submit" class="button primary large">${m.done ? '回答を保存して進む' : state.current === state.count - 1 ? '全員のスキルを確認する' : '保存して次のメンバーへ'}${icon('arrow')}</button></div></form>`;
  }
  function preferenceGroup(key, title, m) {
    return `<div class="preference-group"><div class="question-heading"><h3>${title}</h3><span>任意・最大2つ <b id="${key}-count">${m[key].length}/2</b></span></div><div class="preference-options">${SKILLS.map((s, i) => `<button type="button" class="preference-chip ${m[key].includes(i) ? 'chosen' : ''} ${key === 'avoids' ? 'avoid' : ''}" data-action="preference" data-key="${key}" data-index="${i}" aria-pressed="${m[key].includes(i)}">${icon(s.icon)}${s.short}<span class="chip-check">${icon('check')}</span></button>`).join('')}</div></div>`;
  }
  function overview() {
    return `${hero('第1ステップ ／ チームのスキル一覧', 'いいチームの予感。<br>みんなの得意が集まりました！', 'それぞれの強みを見渡して、次は役割を考えましょう。')}
      <section class="panel"><div class="section-heading"><div><h2>パーティーのスキルマップ</h2><p>😊 得意　 😐 普通　 😵 苦手</p></div>${pill(`${state.count}人の診断が完了`, 'mint')}</div><div class="table-scroll"><table class="skill-table"><caption class="sr-only">メンバーごとの診断結果</caption><thead><tr><th>スキル</th>${state.members.map((m, i) => `<th>${avatar(m, i, 'tiny')}<span>${escape(m.name)}</span></th>`).join('')}</tr></thead><tbody>${SKILLS.map((s, i) => `<tr><th>${icon(s.icon)}${s.name}</th>${state.members.map(m => `<td aria-label="${['苦手', '普通', '得意'][m.skills[i]]}">${['😵', '😐', '😊'][m.skills[i]]}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
      <div class="member-summary-grid">${state.members.map((m, i) => `<section class="panel member-summary"><div class="card-person">${avatar(m, i)}<div><h3>${escape(m.name)}</h3><small>${icon('clock')} 今週 ${TIME_OPTIONS[m.time].label}</small></div><button class="button ghost small" data-action="edit-member" data-index="${i}" aria-label="${escape(m.name)}の回答を編集">編集</button></div><div class="summary-line"><span>やってみたい</span><p>${m.wishes.map(s => SKILLS[s].short).join('、') || '指定なし'}</p></div><div class="summary-line"><span>できれば避けたい</span><p>${m.avoids.map(s => SKILLS[s].short).join('、') || '指定なし'}</p></div></section>`).join('')}</div>
      <div class="page-actions"><button class="button secondary" data-action="back-diagnosis">${icon('back')} 診断に戻る</button><button class="button primary large" data-action="to-tasks">タスクを設定する ${icon('arrow')}</button></div>`;
  }
  function tasksScreen() {
    const total = state.tasks.reduce((sum, t) => sum + (Number(t.hours) || 0), 0);
    const capacity = state.members.reduce((sum, m) => sum + TIME_OPTIONS[m.time].hours, 0);
    const clashes = E.conflicts(state.members, state.tasks);
    return `${hero('第1ステップ ／ スマートマッチング', 'AIがあなたにぴったりの<br>役割を提案！', 'タスクを整えたら、あとはチームの得意におまかせ。')}
      <div class="notice demo-notice">${icon('spark')}<div><strong>デモ用の自動マッチングです</strong><p>スキル・希望・使える時間・作業量から、ブラウザ内で担当を計算します。外部AIへの送信はありません。</p></div>${pill('ローカルで動作')}</div>
      <div class="stats-row"><div class="stat-card"><span>チームの人数</span><strong>${state.count}<small>人</small></strong>${icon('users')}</div><div class="stat-card"><span>タスクの合計作業量</span><strong id="total-hours">${fmt(total)}<small>時間</small></strong>${icon('clock')}</div><div class="stat-card"><span>チームの時間の目安</span><strong>${fmt(capacity)}<small>時間</small></strong>${icon('calendar')}</div></div>
      <section class="panel task-panel"><div class="section-heading"><div><h2>チームのタスクを準備しよう</h2><p>作業量はタスク全体の合計時間。複数担当なら均等に分けます。</p></div><button class="button secondary small" data-action="add-task" ${state.tasks.length >= 30 ? 'disabled' : ''}>${icon('plus')}タスクを追加</button></div>
        <div class="task-list">${state.tasks.map((t, i) => `<article class="task-row" data-task-id="${escape(t.id)}"><div class="task-main"><span class="task-index">${String(i + 1).padStart(2, '0')}</span><div class="task-name"><label class="sr-only" for="name-${t.id}">タスク${i + 1}の名前</label><input id="name-${t.id}" data-task="${t.id}" data-field="name" value="${escape(t.name)}" maxlength="40" placeholder="タスク名" required></div><label class="task-number">担当人数<div><input type="number" data-task="${t.id}" data-field="count" value="${t.count}" min="1" max="${state.count}" step="1" aria-label="タスク${i + 1}の担当人数"><span>人</span></div></label><label class="task-number">合計作業量<div><input type="number" data-task="${t.id}" data-field="hours" value="${t.hours}" min="0.5" max="100" step="0.5" aria-label="タスク${i + 1}の合計作業時間"><span>時間</span></div></label><button class="button icon-button delete-task" data-action="delete-task" data-id="${t.id}" aria-label="タスク${i + 1}を削除">${icon('trash')}</button></div><div class="task-skills"><span>必要なスキル</span>${SKILLS.map((s, si) => `<label class="mini-skill"><input type="checkbox" data-task="${t.id}" data-field="skills" value="${si}" ${t.skills.includes(si) ? 'checked' : ''}><span>${s.short}</span></label>`).join('')}</div>${window.QuestUI?.ratingFields(t) || ''}</article>`).join('') || '<div class="empty-state">タスクを追加して、チームのやることを整理しましょう。</div>'}</div>
      </section><div id="task-summary"><div class="notice ${total > capacity ? 'warm' : ''}">${icon(total > capacity ? 'clock' : 'dice')}<div><strong>${total > capacity ? '合計作業量が、チームの時間の目安を超えています' : clashes.length ? `${clashes.length}件のタスクで希望が重なっています` : 'タスクの設定ができたら、分担をはじめましょう'}</strong><p>${total > capacity ? '担当が決まっても無理は禁物。作業を小さくする、締切を相談するなど調整しましょう。' : '希望者が担当人数を超えたタスクは、じゃんけんで納得できる分担に。'}</p></div></div></div>
      <div id="form-error" class="form-error" role="alert"></div><div class="page-actions"><button class="button secondary" data-action="overview">${icon('back')} スキル一覧へ</button><button class="button primary large" data-action="match">${icon('spark')} AIで役割を分担する</button></div><p class="center-footnote">公平性は「同じ作業時間」だけでなく、「使える時間に対する負担」も考慮します。</p>`;
  }
  const handNames = { rock: ['✊', 'グー'], scissors: ['✌️', 'チョキ'], paper: ['✋', 'パー'] };
  const memberById = id => state.members.find(m => m.id === id);
  function gameScreen() {
    const g = state.game, task = state.tasks.find(t => t.id === g.taskId), outcome = g.outcome;
    const person = memberById(g.active[g.turn]);
    const pending = E.conflicts(state.members, state.tasks, state.locked);
    const allCandidates = state.members.filter(m => E.preferred(m, task));
    return `${hero('第1ステップ ／ じゃんけんタイム', '希望が重なったら、<br>じゃんけんで決めよう！', '勝っても負けても、活躍できる場所がある。<br class="mobile-break">気持ちよく、次の一歩へ。', false)}
      <div class="game-layout"><section class="panel arena"><div class="arena-top">${pill(`第${g.round}回戦`, 'purple')}<span>残り ${pending.length} 件の重複</span></div><div class="arena-role"><div class="arena-role-icon">${icon(SKILLS[task.skills[0]].icon)}</div><h2>${escape(task.name)}</h2><p>${allCandidates.length}人が希望 ／ 担当 ${task.count}人 ／ 残り ${task.count - g.selected.length}枠</p></div>
      ${g.selected.length ? `<div class="qualified">${icon('trophy')} 担当獲得：${g.selected.map(id => escape(memberById(id).name)).join('、')}</div>` : ''}
      <div class="arena-members">${g.active.map((id, i) => { const m = memberById(id), mi = state.members.indexOf(m); return `<div class="arena-member ${!outcome && i === g.turn ? 'current-player' : ''} ${outcome?.winners.includes(id) ? 'winner' : ''}">${avatar(m, mi)}<strong>${escape(m.name)}</strong><div class="hand-status">${outcome ? `<span class="revealed-hand">${handNames[g.hands[id]][0]}</span><small>${outcome.tie ? 'あいこ' : outcome.winners.includes(id) ? '勝利！🎉' : '次のチャンスへ'}</small>` : g.hands[id] ? `${icon('lock')} 選択済み` : i === g.turn ? 'あなたの番' : '待機中'}</div></div>`; }).join('')}</div>
      ${outcome ? `<div class="round-result ${outcome.tie ? 'tie' : ''}"><h3>${outcome.tie ? 'あいこでしょ！' : '勝利！🎉'}</h3><p>${outcome.tie ? 'みんなの手が同じ、または3種類そろいました。もう一度！' : outcome.next.length ? outcome.selected.length ? '勝ったメンバーは担当確定。残りの枠をもう一度じゃんけん！' : '勝ったメンバーが残り枠を超えたので、勝者同士でもう一度！' : `${[...g.selected, ...outcome.selected].map(id => escape(memberById(id).name)).join('さん、')}さんが、この役割を獲得！`}</p><button class="button primary" data-action="next-round">${outcome.next.length ? outcome.tie ? 'もう一度じゃんけん' : '残りの枠を決める' : '担当を確定して進む'} ${icon('arrow')}</button></div>`
        : g.ready ? `<div class="hand-picker"><h3>${escape(person.name)}さん、手を選んでください</h3><p>選ぶとすぐに手を隠します。全員が選んだら一斉に公開！</p><div class="hands">${Object.entries(handNames).map(([key, [emoji, name]]) => `<button data-action="hand" data-hand="${key}" aria-label="${name}"><span>${emoji}</span><strong>${name}</strong></button>`).join('')}</div></div>`
          : `<div class="handoff"><div class="handoff-lock">${icon('lock')}</div><h3>${escape(person.name)}さんに、画面を渡してください</h3><p>他のメンバーには手が見えないよう、一人ずつ選びます。</p><button class="button primary" data-action="ready">${escape(person.name)}さんの番をはじめる ${icon('arrow')}</button></div>`}
      </section><aside class="game-aside"><section class="panel"><div class="section-icon">${icon('dice')}</div><h3>ちょっとした運も、<br>チームづくりのスパイス。</h3><ol><li>順番に、こっそり手を選ぶ</li><li>全員そろったら一斉に公開</li><li>勝った人が希望の役割へ！</li></ol><div class="gentle-note">${icon('spark')} 負けた人には、別の役割を自動提案します。</div></section><section class="game-rules"><h3>${icon('info')} 複数人・複数枠にも対応</h3><p>勝者が枠より多ければ勝者で再戦。少なければ勝者を確定し、残りの人で次の枠を決めます。</p><p>同じ端末で使うデモです。手は画面上で隠され、端末内にのみ保存されます。</p></section></aside></div>
      <div class="page-actions"><button class="button ghost" data-action="restart-matching">${icon('back')} タスク設定に戻る</button></div>`;
  }
  function resultsScreen() {
    const r = state.result, total = state.tasks.reduce((s, t) => s + t.hours, 0), max = Math.max(1, ...Object.values(r.loads), ...state.members.map(m => TIME_OPTIONS[m.time].hours));
    const over = state.members.filter(m => r.loads[m.id] > TIME_OPTIONS[m.time].hours + 0.01);
    const wished = state.tasks.reduce((sum, t) => sum + r.assignments[t.id].filter(id => E.preferred(memberById(id), t)).length, 0);
    const slots = state.tasks.reduce((sum, t) => sum + t.count, 0);
    return `${hero('第1ステップ ／ パーティー編成完了', 'みんなの役割が<br>決まりました！', '一人ひとりの「得意」をつないで。<br class="mobile-break">さあ、このチームで進んでいこう。')}
      <div class="result-banner"><div class="banner-icon">${icon('trophy')}</div><div><strong>あなたたちだけのパーティーが完成！</strong><p>${state.count}人で ${state.tasks.length}個のタスクに挑戦します。</p></div>${pill('役割分担 完了')}</div>
      <div class="result-cards">${state.members.map((m, i) => { const assigned = state.tasks.filter(t => r.assignments[t.id].includes(m.id)), strong = SKILLS.filter((s, si) => m.skills[si] === 2); return `<article class="panel result-card"><div class="result-card-top color-${i % 6}"></div><div class="card-person">${avatar(m, i)}<div><h2>${escape(m.name)}</h2><span class="muted">今週 ${TIME_OPTIONS[m.time].label}</span></div><div class="member-workload"><strong>${fmt(r.loads[m.id])}</strong><span>時間の担当</span></div></div><div class="strong-skills"><span>得意なスキル</span><div>${strong.length ? strong.map(s => pill(`${icon(s.icon)}${s.short}`, s.color)).join('') : '<span class="muted">これから得意を見つけよう</span>'}</div></div><div class="assigned-tasks">${assigned.length ? assigned.map(t => `<div class="assigned-task"><div class="assigned-title"><span>${icon(SKILLS[t.skills[0]].icon)}<strong>${escape(t.name)}</strong></span><span>${fmt(t.hours / t.count)}時間</span></div><p>${escape(r.reasons[t.id][m.id])}</p>${t.count > 1 ? `<small class="partner">共同担当：${r.assignments[t.id].filter(id => id !== m.id).map(id => escape(memberById(id).name)).join('、')} ／ 合計${fmt(t.hours)}時間を${t.count}人で分担</small>` : ''}</div>`).join('') : '<div class="empty-role">今回は担当タスクがありません。タスクや担当人数を増やすと、全員の活躍の場を作れます。</div>'}</div>${r.loads[m.id] > TIME_OPTIONS[m.time].hours + 0.01 ? `<div class="over-capacity">${icon('clock')} 時間の目安を超えています。チームで調整しましょう。</div>` : ''}</article>`; }).join('')}</div>
      <section class="panel workload-panel"><div class="section-heading"><div><h2>チームの負担バランス</h2><p>使える時間と比べて、無理のない分担になっているか確認しよう。</p></div><span class="chart-legend"><i></i>担当作業量 <b></b>時間の目安</span></div><div class="workload-chart">${state.members.map((m, i) => { const cap = TIME_OPTIONS[m.time].hours, load = r.loads[m.id]; return `<div class="chart-row"><div class="chart-person">${avatar(m, i, 'tiny')}<span>${escape(m.name)}</span></div><div class="bar-track" role="img" aria-label="${escape(m.name)}：担当${fmt(load)}時間、使える時間の目安${cap}時間"><div class="capacity-area" style="width:${cap / max * 100}%"></div><div class="workload-bar color-${i % 6}" style="width:${load / max * 100}%"></div><span class="capacity-marker" style="left:${cap / max * 100}%"></span></div><div class="chart-value"><strong>${fmt(load)}時間</strong><small>目安 ${cap}時間</small></div></div>`; }).join('')}</div><div class="workload-summary"><span>合計 <strong>${fmt(total)}時間</strong></span><span>希望に合う担当枠 <strong>${wished} / ${slots}枠</strong></span><span>目安を超えるメンバー <strong>${over.length}人</strong></span></div><p class="chart-note">時間帯の計算上の目安：1時間未満＝0.5時間、1～3時間＝2時間、3～5時間＝4時間、5時間以上＝6時間。タスクは分割できないため、完全に均等にならない場合があります。</p></section>
      <div class="notice ${over.length ? 'warm' : ''}">${icon(over.length ? 'chat' : 'spark')}<div><strong>${over.length ? '最後は、みんなで相談して完成させよう' : '得意・希望・作業時間を考慮した、チームへの提案です'}</strong><p>${over.length ? '時間の目安を超える担当があります。タスクの作業量や担当人数を見直すこともできます。' : 'デモの計算結果です。全員が納得できるか確認し、必要ならタスク設定から調整しましょう。'}</p></div></div>
      <div class="result-actions"><button class="button secondary" data-action="restart-matching">${icon('refresh')}もう一度分担する</button><button class="button primary large" data-action="save-result">${icon('save')}結果を保存する</button></div>${window.QuestUI?.startPanel() || ''}<div class="center"><button class="button ghost" data-action="reset">最初に戻る</button></div>`;
  }
  function render() {
    const screens = { diagnosis, overview, tasks: tasksScreen, game: gameScreen, results: resultsScreen, activity: () => window.QuestUI.render() };
    $('#app').innerHTML = `${sidebar()}<div class="workspace">${header()}<main id="main">${state.isSample ? '<div class="sample-mode">サンプルデータで体験中 <span>架空の4人の回答です。自由に編集できます。</span></div>' : ''}${screens[state.screen]()}<footer class="page-footer"><span>チームクエスト <span class="footer-dot">·</span> 小さな得意から、大きなチームへ。</span><span id="save-status"></span></footer></main></div>`;
    updateSaveStatus();
  }
  function invalidate() { state.result = null; state.locked = {}; state.game = null; }
  function editMember(i) { invalidate(); state.current = i; go('diagnosis'); }
  function showError(message, element) { $('#form-error').textContent = message; element?.focus(); $('#form-error').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  function submitDiagnosis() {
    const m = state.members[state.current]; m.name = m.name.trim();
    if (!m.name) return showError('お名前を入力してください。', $('#member-name'));
    if (state.members.some((p, i) => i !== state.current && p.name.trim() === m.name)) return showError('メンバーを区別できるよう、別のお名前・ニックネームにしてください。', $('#member-name'));
    const missing = m.skills.findIndex(v => v === null);
    if (missing >= 0) return showError(`「${SKILLS[missing].name}」の得意・普通・苦手を選んでください。`, $(`[name="skill-${missing}"]`));
    if (m.time === null) return showError('今週、グループワークに使える時間を選んでください。', $('[name="available-time"]'));
    m.done = true; invalidate();
    const next = state.members.findIndex(p => !p.done);
    if (next === -1) go('overview');
    else { state.current = next; go('diagnosis'); toast(`${m.name}さんの回答を保存しました。次のメンバーに渡してください。`); }
  }
  function validateTasks() {
    if (!state.tasks.length) return 'タスクを1つ以上追加してください。';
    for (const [i, t] of state.tasks.entries()) {
      if (!t.name.trim()) return `タスク${i + 1}の名前を入力してください。`;
      if (!Number.isInteger(t.count) || t.count < 1 || t.count > state.count) return `「${t.name}」の担当人数は1～${state.count}人で入力してください。`;
      if (!Number.isFinite(t.hours) || t.hours < 0.5 || t.hours > 100 || t.hours % 0.5 !== 0) return `「${t.name}」の作業量は0.5～100時間を0.5時間単位で入力してください。`;
      if (!t.skills.length) return `「${t.name}」に必要なスキルを1つ以上選んでください。`;
      if (window.QuestEngine) { try { window.QuestEngine.baseExp(t); } catch (error) { return `「${t.name}」：${error.message}`; } }
    }
    return null;
  }
  async function animate(text, action) {
    busy = true;
    const overlay = document.createElement('div'); overlay.className = 'analysis-overlay'; overlay.setAttribute('role', 'status');
    overlay.innerHTML = `<div class="analysis-box"><div class="analysis-orbit">${icon('spark')}</div><h2>${text}</h2><p>一人ひとりの得意を、チームの力に。</p><div class="analysis-dots"><i></i><i></i><i></i></div></div>`;
    document.body.append(overlay); $('#app').inert = true;
    try { await new Promise(resolve => setTimeout(resolve, 1000)); await action(); }
    catch (error) { toast(`計算を完了できませんでした。${error.message}`); }
    finally { busy = false; $('#app').inert = false; overlay.remove(); $('#page-title')?.focus({ preventScroll: true }); }
  }
  function startGame(conflict) {
    state.game = { taskId: conflict.taskId, active: conflict.candidates, selected: [], hands: {}, turn: 0, round: 1, ready: false, outcome: null };
    go('game');
  }
  async function continueMatching() {
    // 毎回、未解決の希望重複を再検出。人数を超えて自動で担当を追加しない。
    const pending = E.conflicts(state.members, state.tasks, state.locked);
    if (pending.length) startGame(pending[0]);
    else { state.result = await E.MatchingService.propose({ members: state.members, tasks: state.tasks, locked: state.locked }); state.game = null; go('results'); }
  }
  function nextRound() {
    const g = state.game, out = g.outcome;
    g.selected.push(...out.selected);
    if (!out.next.length) {
      state.locked[g.taskId] = [...g.selected];
      // 次の画面と一緒に確定結果を保存する。演出中の更新では直前の勝敗画面に戻る。
      animate('新しい役割を探しています…', continueMatching);
    } else { g.active = [...out.next]; g.hands = {}; g.turn = 0; g.ready = false; g.outcome = null; g.round++; persist(); render(); }
  }
  function loadSample() {
    state = fresh(); state.isSample = true;
    const samples = [
      ['田中 はるか', [1, 2, 2, 1, 0, 1, 1, 2], [1, 2], [4], 2],
      ['佐藤 りく', [2, 1, 2, 1, 2, 0, 1, 1], [2, 4], [5], 3],
      ['鈴木 あおい', [2, 1, 1, 2, 1, 2, 1, 2], [0, 5], [], 2],
      ['高橋 そうた', [1, 1, 0, 2, 1, 1, 2, 2], [3, 6], [2], 1]
    ];
    state.members = samples.map(([name, skills, wishes, avoids, time], i) => ({ id: `member-${i}`, name, skills, wishes, avoids, time, done: true }));
    go('overview'); toast('4人のサンプルを読み込みました。資料作成でじゃんけんを体験できます。');
  }
  function saveResult() {
    try {
      const snapshot = JSON.parse(JSON.stringify(state)); snapshot.savedAt = new Date().toISOString();
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
      toast('結果をこのブラウザに保存しました。「保存した結果」からいつでも開けます。');
    } catch { toast('保存できませんでした。ブラウザのストレージ設定や空き容量を確認してください。'); }
  }
  function loadSaved() {
    const saved = readStorage(SAVE_KEY);
    if (!saved) return toast('保存した結果はまだありません。分担結果の画面で保存できます。');
    if (!validState(saved) || saved.screen !== 'results') return toast('保存データを読み込めませんでした。新しく役割分担を行ってください。');
    confirmAction('保存した結果を開きますか？', `${new Date(saved.savedAt || saved.result.createdAt).toLocaleString('ja-JP')}に保存した結果です。現在の入力は、保存時のデータに置き換わります。`, () => { state = saved; go('results'); }, '結果を開く');
  }
  document.addEventListener('submit', event => { if (window.QuestUI?.handleSubmit(event)) return; if (event.target.id === 'diagnosis-form') { event.preventDefault(); submitDiagnosis(); } });
  document.addEventListener('input', event => {
    const el = event.target;
    if (window.QuestUI?.handleInput(el)) return;
    if (el.id === 'member-name') { state.members[state.current].name = el.value; state.members[state.current].done = false; persist(); }
    if (el.dataset.task && el.dataset.field !== 'skills') {
      const task = state.tasks.find(t => t.id === el.dataset.task);
      task[el.dataset.field] = el.dataset.field === 'name' ? el.value : el.value === '' ? null : Number(el.value);
      invalidate(); persist();
      const expBadge = $(`#exp-${task.id}`); if (expBadge && window.QuestEngine) { try { expBadge.textContent = window.QuestEngine.baseExp(task); } catch { expBadge.textContent = '要確認'; } }
      if ($('#total-hours')) $('#total-hours').innerHTML = `${fmt(state.tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0))}<small>時間</small>`;
      const summary = $('#task-summary'); if (summary) summary.innerHTML = `<div class="notice">${icon('info')}<div><strong>設定を更新しました</strong><p>分担時に、最新の作業量・希望の重複を確認します。</p></div></div>`;
    }
  });
  document.addEventListener('change', event => {
    const el = event.target, m = state.members[state.current];
    if (window.QuestUI?.handleChange(el)) return;
    if (el.dataset.skill !== undefined) { m.skills[Number(el.dataset.skill)] = Number(el.value); m.done = false; $('#answer-count').textContent = `${m.skills.filter(s => s !== null).length} / 8 回答`; invalidate(); persist(); }
    if (el.name === 'available-time') { m.time = Number(el.value); m.done = false; invalidate(); persist(); }
    if (el.dataset.field === 'skills') { const t = state.tasks.find(t => t.id === el.dataset.task), value = Number(el.value); t.skills = el.checked ? [...new Set([...t.skills, value])] : t.skills.filter(s => s !== value); invalidate(); persist(); }
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button || button.disabled || busy) return;
    if (window.QuestUI?.handleClick(button)) return;
    const action = button.dataset.action, index = Number(button.dataset.index);
    if (action === 'count') {
      const n = Number(button.dataset.count); if (n === state.count) return;
      const change = () => { state.members = Array.from({ length: n }, (_, i) => state.members[i] || blankMember(i)); state.count = n; state.current = Math.min(state.current, n - 1); state.tasks.forEach(t => { t.count = Math.min(t.count, n); }); invalidate(); persist(); render(); };
      if (n < state.count && state.members.slice(n).some(m => m.name || m.skills.some(s => s !== null))) confirmAction('人数を減らしますか？', '人数から外れる末尾のメンバーの回答は削除されます。残るメンバーの回答は引き継ぎます。', change, `${n}人に変更`); else change();
    } else if (action === 'member' || action === 'edit-member') editMember(index);
    else if (action === 'preference') {
      const m = state.members[state.current], key = button.dataset.key, other = key === 'wishes' ? 'avoids' : 'wishes';
      if (m[key].includes(index)) m[key] = m[key].filter(s => s !== index);
      else {
        if (m[key].length >= 2) return toast('選べるのは最大2つです。選択済みの項目を外すと変更できます。');
        if (m[other].includes(index)) return toast('同じ役割を「やってみたい」と「避けたい」の両方には選べません。');
        m[key].push(index);
      }
      m.done = false; invalidate(); persist();
      button.classList.toggle('chosen', m[key].includes(index)); button.setAttribute('aria-pressed', String(m[key].includes(index))); $(`#${key}-count`).textContent = `${m[key].length}/2`;
    } else if (action === 'sample') {
      if (state.members.some(m => m.name || m.skills.some(s => s !== null))) confirmAction('サンプルデータを読み込みますか？', '現在の入力を、発表用の架空の4人のデータに置き換えます。別に保存した結果は残ります。', loadSample, 'サンプルを読み込む'); else loadSample();
    } else if (action === 'back-diagnosis') { state.current = 0; go('diagnosis'); }
    else if (action === 'to-tasks') go('tasks');
    else if (action === 'overview') go('overview');
    else if (action === 'add-task') { if (state.tasks.length >= 30) return; state.tasks.push({ id: `task-${Date.now()}`, name: '', skills: [0], count: 1, hours: 1 }); invalidate(); persist(); render(); const el = $('.task-row:last-child input'); el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (action === 'delete-task') { state.tasks = state.tasks.filter(t => t.id !== button.dataset.id); invalidate(); persist(); render(); }
    else if (action === 'match') { const error = validateTasks(); if (error) return showError(error); state.tasks.forEach(t => { t.name = t.name.trim(); }); invalidate(); animate('チームの得意を分析しています…', continueMatching); }
    else if (action === 'ready') { state.game.ready = true; persist(); render(); }
    else if (action === 'hand') {
      const g = state.game; g.hands[g.active[g.turn]] = button.dataset.hand; g.ready = false;
      if (g.turn + 1 < g.active.length) { g.turn++; persist(); render(); }
      else {
        persist();
        animate('じゃんけん…ぽん！', () => { g.outcome = E.resolveRound(g.hands, g.active, state.tasks.find(t => t.id === g.taskId).count - g.selected.length); persist(); render(); });
      }
    } else if (action === 'next-round') nextRound();
    else if (action === 'restart-matching') confirmAction('タスク設定に戻りますか？', '診断の回答を引き継いで、役割をもう一度考えます。今回のじゃんけんの結果はリセットされます。', () => { invalidate(); go('tasks'); }, 'もう一度分担する');
    else if (action === 'save-result') saveResult();
    else if (action === 'saved') loadSaved();
    else if (action === 'reset') confirmAction('最初からはじめますか？', '現在の診断・タスク・じゃんけんをリセットします。「結果を保存する」で保存した結果は残ります。', () => { state = fresh(); go('diagnosis'); }, '最初に戻る');
  });
  // 公開演出の途中で更新された場合にも、選び終えた手から勝敗を復元する。
  if (state.screen === 'game' && !state.game.outcome && state.game.active.every(id => state.game.hands[id])) {
    const g = state.game; g.outcome = E.resolveRound(g.hands, g.active, state.tasks.find(t => t.id === g.taskId).count - g.selected.length);
  }
  window.QuestUI?.init({ getState: () => state, go, render, toast, confirmAction });
  render();
  if (restoreError) toast('保存データを読み込めませんでした。新しい診断から始められます。');
})();
