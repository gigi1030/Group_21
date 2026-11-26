/* 既存の診断画面に接続する、活動ボード・教員用デモのUI。 */
(() => {
  'use strict';
  const Q = window.QuestEngine, KEY = 'teamquest-activities-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = value => Number((value || 0).toFixed(3)).toLocaleString('ja-JP');
  const dt = value => value ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未設定';
  let host, store = { version: 1, activeId: null, projects: [] }, saveError = false, restoreError = false;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.version === 1 && Array.isArray(saved.projects) && saved.projects.every(Q.valid)) { store = saved; store.projects.forEach(Q.recompute); }
    else if (saved) restoreError = true;
  } catch { restoreError = true; }
  const current = () => store.projects.find(p => p.id === store.activeId);
  const person = (q, id) => q.members.find(m => m.id === id)?.name || '不明';
  const taskName = (q, id) => q.tasks.find(t => t.id === id)?.name || '活動全体';
  const names = (q, ids) => ids.map(id => esc(person(q, id))).join('、');
  const badge = (label, type = '') => `<span class="q-badge ${type}">${esc(label)}</span>`;
  function action(label, key, attrs = '', cls = 'secondary') { return `<button type="button" class="button ${cls}" data-action="q-${key}" ${attrs}>${label}</button>`; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); saveError = false; }
    catch { saveError = true; }
  }
  function refresh() { host.render(); }
  function transact(fn, message = '記録を保存しました。') {
    const q = current(); if (!q) return host.toast('活動を先にはじめてください。');
    const next = JSON.parse(JSON.stringify(q));
    if (!next.isDemo) next.clock = new Date().toISOString();
    try {
      fn(next); Q.recompute(next);
      store.projects[store.projects.findIndex(p => p.id === next.id)] = next;
      save(); refresh(); host.toast(saveError ? 'ブラウザに保存できません。このタブ内でのみ変更を保持しています。' : message);
    } catch (error) { host.toast(error.message); return false; }
    return true;
  }
  function addProject(q) {
    q.id = `activity-${Date.now()}-${store.projects.length}`; store.projects.push(q); store.activeId = q.id; save(); host.go('activity');
    if (saveError) host.toast('活動を開始しましたが、このブラウザに保存できません。');
  }
  function init(context) { host = context; }
  function nav() { return action('活動・評価', 'open', '', 'sample small'); }
  function startPanel() {
    return `<section class="panel q-launch"><div><span class="eyebrow">役割が決まった、その先へ</span><h2>チームの冒険をはじめよう</h2><p>担当を確定すると、HP 100でスタート。目標EXPを記録して、成果物・懸賞・振り返りを管理できます。</p><small>当初担当タスクの基本EXP合計を目標にします。共同担当でも各人に全額を計上し、正式な合意による調整は履歴に残します。</small></div>${action('役割を確定して活動開始 →', 'start', '', 'primary large')}</section>`;
  }
  function ratingFields(t) {
    return `<div class="q-rating-fields">${[['difficulty', '難易度'], ['workload', '作業量'], ['complexity', '煩雑さ']].map(([key, label]) => `<label>${label}<select data-task="${esc(t.id)}" data-field="${key}" aria-label="${esc(t.name || '追加タスク')}の${label}">${[1, 2, 3].map(v => `<option value="${v}" ${(t[key] ?? 2) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`).join('')}<span>基本EXP <b id="exp-${esc(t.id)}">${Q.baseExp(t)}</b><small>10 ×（難易度＋作業量＋煩雑さ）</small></span></div>`;
  }
  function formKey(kind, id) { return `${kind}:${id}`; }
  function val(q, key, name, initial = '') { return q.drafts?.[`${key}:${name}`] ?? initial; }
  function field(q, key, name, label, initial = '', options = {}) {
    const value = options.readonly ? initial : val(q, key, name, initial), attr = `name="${name}" data-q-draft="${esc(key)}:${name}"`;
    if (options.type === 'checkbox') return `<label class="q-check"><input type="checkbox" ${attr} ${value === true || value === 'on' ? 'checked' : ''}>${label}</label>`;
    let input;
    if (options.choices) input = `<select ${attr}>${options.choices.map(([v, title]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select>`;
    else if (options.type === 'textarea') input = `<textarea ${attr} rows="${options.rows || 3}" maxlength="2000" ${options.required ? 'required' : ''} placeholder="${esc(options.placeholder || '')}">${esc(value)}</textarea>`;
    else input = `<input ${attr} type="${options.type || 'text'}" value="${esc(value)}" ${options.required ? 'required' : ''} ${options.readonly ? 'readonly' : ''} ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''} ${options.step ? `step="${options.step}"` : ''} maxlength="2000" placeholder="${esc(options.placeholder || '')}">`;
    return `<label class="q-field">${label}${input}</label>`;
  }
  function form(kind, id, content, label, disabled = false, buttonClass = 'primary') {
    return `<form class="q-form" data-quest-form="${kind}" data-id="${esc(id)}">${content}<button type="submit" class="button ${buttonClass}" ${disabled ? 'disabled' : ''}>${label}</button></form>`;
  }
  function empty() {
    const state = host.getState();
    return `<section class="hero"><div class="hero-copy"><div class="eyebrow">第2ステップ ／ チームの活動</div><h1 id="page-title" tabindex="-1">得意を、成果につなげよう。</h1><p>HP・EXP・懸賞クエストで、チームの歩みを見える形に。</p></div></section><div class="q-empty-grid"><section class="panel"><span class="q-feature-icon">⚔️</span><h2>今のチームで活動を開始</h2><p>診断・AI分担・じゃんけんで決めた担当を引き継ぎます。</p>${state.result ? startPanel() : action('スキル診断・役割分担へ', 'back', '', 'primary')}</section><section class="panel"><span class="q-feature-icon">🎲</span><h2>発表用・11操作デモ</h2><p>役割分担から、懸賞、ゲームオーバー、復活、教員評価まで。架空のチームで順に体験できます。</p>${action('11操作デモをはじめる', 'demo', '', 'primary')}<small>既存の診断や活動を上書きせず、別の活動として保存します。</small></section></div>${limits()}`;
  }
  function limits() { return '<div class="notice q-limit"><div><strong>同じ端末で操作する、発表用プロトタイプ</strong><p>教員・管理者の認証や、複数端末のリアルタイム共有はありません。成果確認・減点・教員操作も、この端末で体験するデモ機能です。スコアは正式な成績を自動決定するものではありません。</p></div></div>'; }
  function projectSwitcher(q) {
    return `<div class="q-project-strip"><label>活動を切り替え<select aria-label="活動を切り替え" data-q-switch>${store.projects.map(p => `<option value="${esc(p.id)}" ${p.id === q.id ? 'selected' : ''}>${esc(p.title || 'チームの活動')} ／ ${dt(p.createdAt)}</option>`).join('')}</select></label><span>${q.closedAt ? badge('活動終了', 'neutral') : badge('活動中', 'green')}${q.isDemo ? badge('デモ日時', 'amber') : badge('日本時間')}</span>${action('新しい11操作デモ', 'demo', '', 'ghost small')}</div>`;
  }
  function demoGuide(q) {
    if (!q.isDemo || !q.demoStep) return '';
    const finished = q.demoStep > 10;
    return `<section class="q-demo-guide"><div><span class="eyebrow">発表ガイド ／ ${Math.min(11, q.demoStep)} / 11</span><h2>${finished ? 'ひと通りの体験が完了しました！' : `次：${Q.DEMO_STEPS[q.demoStep]}`}</h2><p>${esc(q.demoMessage)}</p></div>${!finished ? action('次のデモ操作を実行 →', 'demo-next', '', 'primary') : badge('全11操作 完了', 'green')}<details><summary>11操作の進行状況</summary><ol>${Q.DEMO_STEPS.map((label, i) => `<li class="${i < q.demoStep ? 'q-done-step' : ''}">${i < q.demoStep ? '✓ ' : ''}${label}</li>`).join('')}</ol><p>実際の記録・承認処理を順に実行するガイドです。途中で自由に変更して手順が合わなくなった場合は、新しいデモを開始できます。</p></details></section>`;
  }
  function render() {
    const q = current(); if (!q) return `${empty()}${restoreError ? '<div class="form-error">活動の保存データを読み込めませんでした。診断の保存データはそのまま使えます。</div>' : ''}`;
    if (!q.isDemo) q.clock = new Date().toISOString();
    const views = { board, wanted, teacher, report }, titles = { board: ['チームの活動ボード', '小さな達成を積み重ねて、チームでゴールへ。'], wanted: ['だれかのピンチを、チームの力に。', '残った仕事を引き継ぐ、懸賞クエスト。'], teacher: ['チームの歩みを、ていねいに。', '数字だけでなく、成果物と事情を確認する教員用デモ。'], report: ['この冒険を、振り返ろう。', '確認できた貢献と未完了の仕事を、事実に沿って記録します。'] };
    const view = views[q.view] ? q.view : 'board';
    return `${projectSwitcher(q)}<section class="hero q-hero"><div class="hero-copy"><div class="eyebrow">${view === 'teacher' ? '教員用 ／ 認証なしのデモ操作' : '第2ステップ ／ チームの活動'}</div><h1 id="page-title" tabindex="-1">${titles[view][0]}</h1><p>${titles[view][1]}</p></div><div class="q-clock"><span>${q.isDemo ? 'デモの現在日時' : '現在日時（日本時間）'}</span><strong>${dt(q.clock)}</strong>${q.isDemo && !q.closedAt ? action('1日進める', 'day', '', 'ghost small') : ''}</div></section>${demoGuide(q)}${saveError ? '<div class="form-error" role="alert">ブラウザに保存できません。このタブ内でのみ変更を保持しています。ストレージ設定を確認してください。</div>' : ''}<nav class="q-nav" aria-label="活動の画面">${[['board', '⚔', '活動ボード'], ['wanted', '✦', '懸賞掲示板'], ['teacher', '▤', '教員用評価'], ['report', '✎', '最終レポート']].map(([key, symbol, label]) => action(`<span aria-hidden="true">${symbol}</span>${label}`, 'view', `data-view="${key}" aria-pressed="${view === key}"`, view === key ? 'primary' : 'ghost')).join('')}</nav>${views[view](q)}${limits()}<div class="q-bottom">${action('← 診断・役割分担に戻る', 'back', '', 'ghost')}<span>${saveError ? '保存できません' : '活動・履歴はこのブラウザに自動保存'}</span></div>`;
  }
  function hpBar(m) { return `<div class="q-hp-label"><strong>HP ${m.hp}<small> / 100</small></strong>${badge(m.hp === 0 ? 'ゲームオーバー' : m.hp <= 25 ? '要サポート' : '活動中', m.hp <= 25 ? 'red' : 'green')}</div><div class="q-hp-track" role="meter" aria-label="${esc(m.name)}のHP" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.hp}"><span class="${m.hp <= 25 ? 'low' : ''}" style="width:${m.hp}%"></span></div>`; }
  function memberCards(q) {
    return `<div class="q-member-grid">${q.members.map((m, i) => `<article class="panel q-member-card ${m.hp === 0 ? 'q-gameover' : ''}"><div class="card-person"><span class="avatar avatar-${i}">${esc(m.name.slice(0, 1))}</span><div><h3>${esc(m.name)}</h3><small>目標 ${n(m.targetExp)} EXP</small></div></div>${hpBar(m)}<div class="q-member-exp"><span>累積EXP<strong>${n(m.exp.total)}</strong></span><span>参考スコア<strong>${m.evaluation.finalScore === null ? '対象外' : `${m.evaluation.finalScore}<small> / 100</small>`}</strong></span></div><div class="q-member-links">${action('履歴・補救', 'member', `data-id="${esc(m.id)}"`, 'ghost small')}${m.hp === 0 ? '<small>復活クエストを確認すると＋10 HP</small>' : ''}</div></article>`).join('')}</div>`;
  }
  const statuses = { todo: '未着手', doing: '進行中', review: '確認待ち', done: '完了' };
  function board(q) {
    const selected = q.tasks.find(t => t.id === q.selected);
    if (selected) return taskDetail(q, selected);
    const tasks = q.memberFilter === 'all' || !q.memberFilter ? q.tasks : q.tasks.filter(t => t.assignees.includes(q.memberFilter));
    const finished = q.tasks.filter(t => t.status === 'done').length;
    return `${memberCards(q)}<section class="panel q-board"><div class="section-heading"><div><h2>チームのクエスト</h2><p>${finished} / ${q.tasks.length} 件 完了。成果物を提出し、貢献を確認してからEXPを付与します。</p></div><label class="q-filter">現在の担当で絞り込み<select data-q-filter aria-label="現在の担当で絞り込み"><option value="all">全員</option>${q.members.map(m => `<option value="${esc(m.id)}" ${q.memberFilter === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label></div><div class="q-task-grid">${tasks.map(t => {
      const progress = Object.values(t.contributions).reduce((a, b) => a + b, 0);
      return `<article class="q-task-card"><div class="q-task-head">${badge(statuses[t.status], t.status === 'done' ? 'green' : '')}<strong>${t.baseExp} <small>EXP</small></strong></div><h3>${esc(t.name)}</h3><p>${names(q, t.assignees)}</p><div class="q-task-meta"><span>締切 ${t.deadline}</span><span>確認済み ${progress}%</span></div><div class="q-mini-track"><i style="width:${progress}%"></i></div>${t.wanted ? badge(t.wanted.status === 'open' ? '懸賞掲載中' : '引き継ぎあり', 'amber') : ''}${action('詳細・成果物を開く →', 'task', `data-id="${esc(t.id)}"`, 'secondary small')}</article>`;
    }).join('') || '<p class="empty-state">このメンバーの現在の担当はありません。</p>'}</div></section>`;
  }
  function taskDetail(q, t) {
    const tab = q.detailTab || 'work', shares = Object.values(t.contributions).reduce((a, b) => a + b, 0);
    const k = kind => formKey(kind, t.id), disabled = Boolean(q.closedAt) || t.status === 'done';
    return `<div class="q-detail-back">${action('← クエスト一覧', 'task-back', '', 'ghost')}</div><section class="panel q-task-detail"><div class="section-heading"><div><div class="q-inline">${badge(statuses[t.status], t.status === 'done' ? 'green' : '')}${t.wanted ? badge('懸賞の記録あり', 'amber') : ''}</div><h2>${esc(t.name)}</h2><p>現在の担当：${names(q, t.assignees)} ／ 当初の担当：${names(q, t.initialAssignees)}</p></div><div class="q-exp-number">${t.baseExp}<small>基本EXP</small></div></div><div class="q-facts"><span>難易度 <b>${t.difficulty}</b></span><span>作業量 <b>${t.workload}</b></span><span>煩雑さ <b>${t.complexity}</b></span><span>合計時間 <b>${n(t.hours)}時間</b></span><span>確認済み <b>${shares}%</b></span></div><p class="q-help">基本EXP＝10 ×（${t.difficulty}＋${t.workload}＋${t.complexity}）。中間チェック ${t.checkpoint} ／ 締切 ${t.deadline}（日本時間23:59まで）</p><nav class="q-detail-tabs" aria-label="タスク操作">${[['work', '作業・成果物'], ['review', '成果の確認'], ['admin', 'HP・懸賞・日程']].map(([key, title]) => action(title, 'detail-tab', `data-tab="${key}" aria-pressed="${tab === key}"`, tab === key ? 'sample small' : 'ghost small')).join('')}</nav>
      ${tab === 'work' ? `<div class="q-two-col"><div><h3>取り組みを記録</h3>${form('start', t.id, field(q, k('start'), 'member', '担当メンバー', t.assignees[0], { choices: t.assignees.map(id => [id, person(q, id)]) }), '着手・応答を記録', disabled || t.wanted?.status === 'open', 'secondary')}<h3>成果物を提出</h3>${form('submit', t.id, field(q, k('submit'), 'member', '提出するメンバー', t.assignees[0], { choices: t.assignees.map(id => [id, person(q, id)]) }) + field(q, k('submit'), 'evidence', '成果物の内容・自分が行った仕事', '', { type: 'textarea', required: true, placeholder: '何を作り、どこまで担当したかを書いてください。' }) + field(q, k('submit'), 'url', '成果物のURL（任意）', '', { type: 'url', placeholder: 'https://…' }), '成果物を提出する', disabled || t.wanted?.status === 'open')}<p class="q-help">ファイルのアップロードは行いません。説明と参照URLをこの端末に保存します。提出だけではEXPは増えません。</p></div><div><h3>提出した成果物</h3>${submissions(q, s => s.taskId === t.id)}</div></div>` : ''}
      ${tab === 'review' ? `<div class="q-two-col"><div><div class="q-admin-label">確認者・教員として操作するデモ</div><h3>確認済みの累計貢献割合</h3><p class="q-help">全員の合計は100%以下。部分確認も可能です。掲載前に元担当の貢献を確定してください。確認済み割合は減らせません。</p>${form('approve', t.id, q.members.map(m => field(q, k('approve'), `share-${m.id}`, `${esc(m.name)}（現在 ${t.contributions[m.id]}%）`, t.contributions[m.id], { type: 'number', min: t.contributions[m.id], max: 100, step: 1, readonly: !t.assignees.includes(m.id), required: true })).join('') + field(q, k('approve'), 'reason', '成果確認の内容・承認理由', '', { type: 'textarea', required: true }) + field(q, k('approve'), 'verified', '成果物と実際の貢献を確認しました', false, { type: 'checkbox' }), '確認した貢献にEXPを付与', disabled || t.wanted?.status === 'open')}<p class="q-help">同じ作業のEXPは再付与しません。100%になったタスクは完了します。通常のタスク完了でHPは増えません。</p></div><div><h3>判断のための成果物</h3>${submissions(q, s => s.taskId === t.id)}<h3>EXPの付与履歴</h3>${expHistory(q, e => e.taskId === t.id)}</div></div>` : ''}
      ${tab === 'admin' ? `<div class="q-admin-label">事情を確認した管理者として操作するデモ</div><div class="q-two-col"><div><h3>HPのペナルティを確認</h3><p class="q-help">自動では減点しません。本人の事情と分配を確認してください。中間チェック・締切・最終応答からの経過を検証し、同じ違反は一度だけ記録します。</p>${form('penalty', t.id, field(q, k('penalty'), 'member', '対象メンバー', t.assignees[0], { choices: t.assignees.map(id => [id, person(q, id)]) }) + field(q, k('penalty'), 'type', '確認した違反', 'unstarted', { choices: Object.entries(Q.PENALTIES).map(([id, p]) => [id, `${p.label}：−${p.amount} HP`]) }) + field(q, k('penalty'), 'reason', '客観的な事実・本人への確認内容', '', { type: 'textarea', required: true }) + field(q, k('penalty'), 'unjustified', '本人の事情・役割分配を確認し、正当な理由がないことを確認しました', false, { type: 'checkbox' }), '確認してHP減点を記録', disabled || t.wanted?.status === 'open', 'secondary')}
      <h3>中間チェック・締め切り</h3>${form('dates', t.id, field(q, k('dates'), 'checkpoint', '中間チェック日', t.checkpoint, { type: 'date', required: true }) + field(q, k('dates'), 'deadline', '締め切り', t.deadline, { type: 'date', required: true }) + field(q, k('dates'), 'reason', '日程変更の理由', '', { required: true }), '理由を記録して日程変更', disabled, 'secondary')}</div><div><h3>懸賞クエストとして掲載</h3><p class="q-help">正当な理由なく放置された未完了作業が対象です。未確認の成果物がある場合は、先に元担当の部分貢献を確認してください。</p>${!t.wanted ? form('wanted', t.id, field(q, k('wanted'), 'reason', '放置の状況・掲載理由', '', { type: 'textarea', required: true }) + field(q, k('wanted'), 'unjustified', '事情を確認し、正当な理由なく残りの作業が放置されていると確認しました', false, { type: 'checkbox' }), `懸賞掲示板に掲載（＋${n(t.baseExp * .2)} EXP）`, disabled, 'secondary') : `<div class="q-note">${t.wanted.status === 'open' ? '懸賞掲示板で引き受けを待っています。' : `引受担当：${esc(person(q, t.wanted.claimedBy))}`}<p>${esc(t.wanted.reason)}</p></div>${t.wanted.status === 'open' ? form('cancel-wanted', t.id, field(q, k('cancel-wanted'), 'reason', '掲載取消の理由', '', { required: true }), '掲載を取り消す', disabled, 'secondary') : ''}`}</div></div>` : ''}
      ${tab === 'admin' ? reassignmentForm(q, t, disabled) : ''}</section>`;
  }
  function reassignmentForm(q, t, disabled) {
    const key = formKey('reassign', t.id);
    return `<details class="q-settings"><summary>合意・事情に基づいて正式に役割を変更する</summary><p class="q-help">確認済みEXPと当初担当の記録は維持します。目標EXPは自動変更しません。必要な目標の変更は教員用画面で理由を記録してください。</p>${form('reassign', t.id, q.members.map(m => field(q, key, `assign-${m.id}`, esc(m.name), t.assignees.includes(m.id), { type: 'checkbox' })).join('') + field(q, key, 'basis', '正式な変更の根拠', '', { choices: [['', '確認した根拠を選択'], ['consensus', 'チーム全員の合意'], ['unavoidable', 'やむを得ない事情']] }) + field(q, key, 'reason', '役割変更の理由・合意の記録', '', { type: 'textarea', required: true }), '理由を残して担当を変更', disabled || Boolean(t.wanted), 'secondary')}</details>`;
  }
  function submissions(q, filter) {
    const list = q.submissions.filter(filter).slice().reverse();
    return `<div class="q-records">${list.map(s => `<article><div><strong>${esc(person(q, s.memberId))}</strong><time>${dt(s.at)}</time></div><small>${esc(taskName(q, s.taskId))} ／ ${s.reviewedAt ? '内容を確認済み' : '内容は未確認'}</small><p>${esc(s.evidence)}</p>${safeLink(s.url)}${s.reviewedAt ? `<small>確認 ${dt(s.reviewedAt)}：${esc(s.reviewReason)}</small>` : ''}</article>`).join('') || '<p class="q-empty">提出された成果物はありません。</p>'}</div>`;
  }
  function safeLink(url) { try { const u = new URL(url); if (['https:', 'http:'].includes(u.protocol)) return `<a class="q-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">成果物を新しいタブで開く ↗</a>`; } catch {} return ''; }
  function expHistory(q, filter) {
    return `<div class="q-records">${q.expEvents.filter(filter).slice().reverse().map(e => `<article><div><strong>${e.type === 'base' ? '基本EXP' : '懸賞ボーナス'} ＋${n(e.amount)}</strong><time>${dt(e.at)}</time></div><small>${esc(person(q, e.memberId))} ／ ${esc(taskName(q, e.taskId))}</small><p>${esc(e.reason)}</p></article>`).join('') || '<p class="q-empty">EXPの付与はまだありません。</p>'}</div>`;
  }
  function wanted(q) {
    const list = q.tasks.filter(t => t.wanted);
    return `<div class="q-note"><strong>基本EXPの20%が、引き継ぎのボーナス。</strong><p>元担当の確認済み貢献は残します。基本EXPは全員分の合計でタスクの基本EXP以下。ボーナスは引き継ぐ残作業の確認割合に応じて付与します。</p></div><div class="q-wanted-grid">${list.map(t => {
      const w = t.wanted, available = q.members.filter(m => !w.originalAssignees.includes(m.id)), remainBase = Q.round(t.baseExp * w.remainingPercent / 100), key = formKey('claim', t.id);
      return `<article class="panel q-wanted-card"><div class="q-wanted-top"><span>懸賞クエスト</span>${badge({ open: '募集中', claimed: '引き継ぎ中', closed: '達成済み' }[w.status], w.status === 'closed' ? 'green' : 'amber')}</div><h2>${esc(t.name)}</h2><p>元の担当者：${names(q, w.originalAssignees)}</p><div class="q-facts"><span>難易度 <b>${t.difficulty}</b></span><span>作業量 <b>${t.workload}</b></span><span>煩雑さ <b>${t.complexity}</b></span></div><div class="q-wanted-values"><span>基本EXP<strong>${t.baseExp}</strong></span><span>懸賞ボーナス<strong>＋${n(w.bonusPool)}</strong></span><span>タスク全体の合計<strong>${n(t.baseExp + w.bonusPool)}</strong></span></div><div class="q-note"><strong>引受担当が獲得可能：${n(remainBase + w.bonusPool)} EXP</strong><p>残り${w.remainingPercent}%の基本EXP ${n(remainBase)} ＋ 懸賞 ${n(w.bonusPool)}。元担当の確認済み ${n(t.baseExp - remainBase)} EXPは保持。</p></div><p class="q-help">締め切り ${t.deadline} ／ 掲載 ${dt(w.postedAt)}</p><p class="q-help">掲載理由：${esc(w.reason)}</p>${w.status === 'open' ? form('claim', t.id, field(q, key, 'member', '引き受けるメンバー', available[0]?.id, { choices: available.map(m => [m.id, m.name]) }), 'このクエストを引き受ける', Boolean(q.closedAt) || !available.length) : `<p class="q-claimant">引受担当：${esc(person(q, w.claimedBy))} ／ ${dt(w.claimedAt)}</p>`}${action('成果物・貢献の確認へ →', 'task', `data-id="${esc(t.id)}"`, 'ghost small')}</article>`;
    }).join('') || '<section class="panel q-empty"><span class="q-feature-icon">✦</span><h2>いまは懸賞クエストがありません</h2><p>未完了の仕事が放置されたとき、タスク詳細の「HP・懸賞・日程」から掲載できます。</p></section>'}</div>`;
  }
  function teacher(q) {
    const selected = q.members.find(m => m.id === q.teacherMember) || q.members[0];
    const maxExp = Math.max(1, ...q.members.map(m => m.exp.total));
    return `<section class="panel"><div class="section-heading"><div><h2>メンバーの活動状況</h2><p>完了＝本人の確認済み貢献がある完了タスク。未完了＝当初担当タスクのうち活動全体で未完了のもの。</p></div>${badge('参考評価・成績ではありません')}</div><div class="table-scroll"><table class="q-teacher-table"><caption class="sr-only">メンバーのHP・EXP・最終貢献度評価</caption><thead><tr><th>メンバー</th><th>最終HP</th><th>累積EXP</th><th>目標EXP</th><th>自動参考点</th><th>調整後参考点</th><th>当初／現在担当</th><th>完了／未完了</th><th>懸賞 引受／引渡</th><th>詳細</th></tr></thead><tbody>${q.members.map(m => { const s = Q.stats(q, m.id); return `<tr><th>${esc(m.name)}</th><td>${m.hp === 0 ? badge('0・ゲームオーバー', 'red') : m.hp}</td><td><strong>${n(m.exp.total)}</strong><small>基本 ${n(m.exp.base)} ＋ 懸賞 ${n(m.exp.bonus)}</small></td><td>${n(m.targetExp)}</td><td>${m.evaluation.autoScore === null ? '評価対象外・要確認' : `${m.evaluation.autoScore} / 100`}</td><td>${m.evaluation.finalScore === null ? '評価対象外・要確認' : `${m.evaluation.finalScore} / 100`}</td><td>${s.initial} / ${s.current}</td><td>${s.completed} / ${s.unfinished}</td><td>${s.taken} / ${s.transferred}</td><td>${action('確認', 'member', `data-id="${esc(m.id)}"`, 'secondary small')}</td></tr>`; }).join('')}</tbody></table></div></section><section class="panel"><div class="section-heading"><div><h2>HP・EXP・参考スコアを比較</h2><p>HPと参考点は100基準、EXPは現在の最大値に対する相対表示です。</p></div></div><div class="q-comparison">${q.members.map(m => `<div class="q-compare-row"><strong>${esc(m.name)}</strong><div><span>HP ${m.hp}</span><div class="q-compare-track"><i class="hp" style="width:${m.hp}%"></i></div></div><div><span>EXP ${n(m.exp.total)}</span><div class="q-compare-track"><i class="exp" style="width:${m.exp.total / maxExp * 100}%"></i></div></div><div><span>参考点 ${m.evaluation.finalScore ?? '対象外'}</span><div class="q-compare-track"><i class="score" style="width:${m.evaluation.finalScore || 0}%"></i></div></div></div>`).join('')}</div></section>${memberDetail(q, selected)}<details class="panel q-all-history"><summary>活動全体の変更・完了・引き継ぎ履歴（${q.audit.length}件）</summary>${auditHistory(q, () => true)}</details>`;
  }
  function auditHistory(q, filter) {
    return `<div class="q-records">${q.audit.filter(filter).slice().reverse().map(a => `<article><div><strong>${esc(a.kind)}</strong><time>${dt(a.at)}</time></div>${a.taskId ? `<small>${esc(taskName(q, a.taskId))}</small>` : ''}${a.memberId ? `<small>${esc(person(q, a.memberId))}</small>` : ''}<p>${esc(a.note || '')}</p>${a.before !== undefined && typeof a.before !== 'object' ? `<small>変更前 ${a.before ?? '自動計算'} → 変更後 ${a.after ?? '自動計算'}</small>` : ''}${a.comment ? `<p>${esc(a.comment)}</p>` : ''}${a.shares ? `<small>確認割合：${Object.entries(a.shares).filter(([, v]) => v > 0).map(([id, v]) => `${esc(person(q, id))} ${v}%`).join(' ／ ')}</small>` : ''}</article>`).join('') || '<p class="q-empty">該当する履歴はありません。</p>'}</div>`;
  }
  function memberDetail(q, m) {
    const s = Q.stats(q, m.id), ev = m.evaluation, k = kind => formKey(kind, m.id);
    return `<section class="panel q-member-detail" id="q-member-detail"><div class="section-heading"><div><span class="eyebrow">個別の状況を確認</span><h2>${esc(m.name)}</h2><p>当初目標 ${n(m.initialTarget)} EXP ／ 現在目標 ${n(m.targetExp)} EXP</p></div>${badge(m.hp === 0 ? 'ゲームオーバー' : `HP ${m.hp}`, m.hp === 0 ? 'red' : 'green')}</div><div class="q-score-explain"><div><strong>${ev.autoScore === null ? '評価対象外・要確認' : `${ev.autoScore}点`}</strong><span>自動計算の参考スコア</span></div><p>基本 ${n(m.exp.base)} ＋ 評価対象の懸賞 ${n(ev.eligibleBonus)} ＝ 実績 ${n(ev.actual)} EXP<br>懸賞の評価上限は目標の10%（${n(m.targetExp * .1)} EXP）。評価対象外の懸賞 ${n(ev.excludedBonus)} EXPも累積EXPには残ります。</p></div>
      <div class="q-two-col"><div><h3>教員コメント・参考点の調整</h3>${form('teacher', m.id, field(q, k('teacher'), 'comment', '個別の事情・成果を踏まえたコメント', m.teacherComment, { type: 'textarea', required: true }) + field(q, k('teacher'), 'score', '調整後の参考点（空欄で自動計算に戻す）', m.teacherAdjustment?.score ?? '', { type: 'number', min: 0, max: 100, step: 1 }) + field(q, k('teacher'), 'reason', '調整・解除の理由（点数を変える場合は必須）', m.teacherAdjustment?.reason || '', { type: 'textarea', rows: 2 }), 'コメント・調整を保存')}
      <details class="q-settings"><summary>目標EXPを正式に変更する</summary><p class="q-help">引き継ぎでは自動で減りません。共同担当の当初目標も、指定どおり担当タスクの基本EXP全額です。正式に調整する場合は合意・事情を記録します。</p>${form('target', m.id, field(q, k('target'), 'target', '新しい目標EXP', m.targetExp, { type: 'number', min: 0, max: 1000000, step: .01, required: true }) + field(q, k('target'), 'basis', '変更の根拠', '', { choices: [['', '確認した根拠を選択'], ['consensus', 'チーム全員で合意した正式な変更'], ['unavoidable', 'やむを得ない事情による再分担']] }) + field(q, k('target'), 'reason', '変更理由・合意や事情の記録', '', { type: 'textarea', required: true }), '理由を記録して目標を変更', false, 'secondary')}</details></div>
      <div><h3>${m.hp === 0 ? '復活' : '補救'}クエスト</h3><p class="q-help">成果を提出し、達成を確認して＋10 HP。上限100。EXPは増えません。別の仕事を達成した場合は新しいクエストとして申請します。</p>${form('recovery', m.id, field(q, k('recovery'), 'title', 'クエスト名', '', { required: true, placeholder: '例：残作業と引き継ぎ手順の整理' }) + field(q, k('recovery'), 'evidence', '達成内容・成果物', '', { type: 'textarea', required: true }), '達成した補救クエストを提出', Boolean(q.closedAt) || m.hp === 100)}${q.recoveries.filter(r => r.memberId === m.id).slice().reverse().map(r => `<article class="q-recovery"><strong>${esc(r.title)}</strong>${badge(r.status === 'approved' ? '承認済み・＋10 HP' : '確認待ち', r.status === 'approved' ? 'green' : 'amber')}<p>${esc(r.evidence)}</p><small>${dt(r.at)}</small>${r.status === 'pending' ? form('recovery-approve', r.id, field(q, formKey('recovery-approve', r.id), 'reason', '管理者として確認した内容', '', { required: true }) + field(q, formKey('recovery-approve', r.id), 'verified', 'このクエストの達成と、他の補救との重複がないことを確認しました', false, { type: 'checkbox' }), '達成を確認してHP回復', Boolean(q.closedAt), 'secondary') : ''}</article>`).join('')}</div></div>
      <div class="q-two-col q-ledgers"><div><h3>HPの減点・回復履歴</h3>${hpHistory(q, m)}<h3>提出した成果物（${s.submitted}件）</h3>${submissions(q, a => a.memberId === m.id)}</div><div><h3>EXPの獲得履歴</h3>${expHistory(q, a => a.memberId === m.id)}<h3>完了・引き継ぎ・変更の履歴</h3>${auditHistory(q, a => a.memberId === m.id || a.taskId && q.tasks.some(t => t.id === a.taskId && (t.initialAssignees.includes(m.id) || t.assignees.includes(m.id))))}</div></div></section>`;
  }
  function hpHistory(q, m) {
    return `<div class="q-records">${q.hpEvents.filter(e => e.memberId === m.id).slice().reverse().map(e => `<article><div><strong>${e.kind === 'penalty' ? Q.PENALTIES[e.penaltyType].label : '補救・復活クエスト'}：${e.amount > 0 ? '+' : ''}${e.amount} HP</strong><time>${dt(e.at)}</time></div><small>${esc(taskName(q, e.taskId))}</small><p>${esc(e.reason)}</p>${e.kind === 'penalty' ? `<details class="q-settings"><summary>免除・修正（当初 ${e.originalAmount} HP）</summary>${form('penalty-correct', e.id, field(q, formKey('penalty-correct', e.id), 'amount', '修正後の減点量（0で免除）', -e.amount, { type: 'number', min: 0, max: 100, step: 1, required: true }) + field(q, formKey('penalty-correct', e.id), 'reason', '事情・分配を踏まえた修正理由', '', { type: 'textarea', required: true }), '理由を記録して修正', false, 'secondary')}${e.revisions.map(r => `<p class="q-help">${dt(r.at)}：${r.before} → ${r.after} HP ／ ${esc(r.reason)}</p>`).join('')}</details>` : ''}</article>`).join('') || '<p class="q-empty">HPの変更はありません。</p>'}</div>`;
  }
  function report(q) {
    const key = formKey(q.closedAt ? 'reopen' : 'close', q.id);
    return `<section class="panel q-report-head"><div><h2>${q.closedAt ? '活動終了時の最終レポート' : '最終レポートのプレビュー'}</h2><p>${q.closedAt ? `${dt(q.closedAt)}に終了。終了後の管理者による修正・コメントも理由とともに反映します。` : 'まだ活動中です。内容を確認して「活動を終了する」を押すと、終了日時を記録します。'}</p></div>${form(q.closedAt ? 'reopen' : 'close', q.id, field(q, key, 'reason', q.closedAt ? '活動を再開する理由' : '終了の確認・残作業の扱い', '', { required: true }), q.closedAt ? '活動を再開する' : '活動を終了する', false, q.closedAt ? 'secondary' : 'primary')}</section><div class="q-report-grid">${q.members.map(m => {
      const s = Q.stats(q, m.id), unfinished = q.tasks.filter(t => t.initialAssignees.includes(m.id) && t.status !== 'done'), involved = q.tasks.filter(t => t.contributions[m.id] > 0 || t.initialAssignees.includes(m.id)), noComplete = s.completed === 0 && s.initial > 0;
      return `<article class="panel q-report-card ${m.hp === 0 ? 'q-gameover' : ''}"><div class="section-heading"><h2>${esc(m.name)}</h2>${badge(m.hp === 0 ? 'ゲームオーバー・HP 0' : `最終HP ${m.hp}`, m.hp === 0 ? 'red' : 'green')}</div><div class="q-report-values"><span>累積EXP<strong>${n(m.exp.total)}</strong></span><span>目標EXP<strong>${n(m.targetExp)}</strong></span><span>参考スコア<strong>${m.evaluation.finalScore === null ? '対象外・要確認' : `${m.evaluation.finalScore} / 100`}</strong></span></div>${m.hp === 0 ? '<div class="q-note q-danger"><strong>HPが0の状態です</strong><p>この状態だけで貢献の有無は判断しません。下記の成果・部分貢献・提出記録・事情を合わせて確認してください。</p></div>' : ''}<h3>記録に基づく貢献</h3><p>本人の確認済み貢献がある完了タスク：${s.completed}件 ／ 確認済みの部分貢献を含むタスク：${s.contributed}件 ／ 提出：${s.submitted}件</p><ul class="q-report-tasks">${involved.map(t => `<li><span>${esc(t.name)}</span><small>本人 ${t.contributions[m.id]}% ／ ${statuses[t.status]}${t.wanted?.claimedBy ? ` ／ 引継ぎ先：${esc(person(q, t.wanted.claimedBy))}` : ''}</small></li>`).join('') || '<li>当初担当・確認済み貢献はありません。</li>'}</ul><h3>未完了の当初担当タスク（${unfinished.length}件）</h3><p>${unfinished.length ? unfinished.map(t => esc(t.name)).join('、') : 'ありません。'}</p>${m.teacherComment ? `<div class="q-note"><strong>教員コメント</strong><p>${esc(m.teacherComment)}</p>${m.teacherAdjustment ? `<small>調整理由：${esc(m.teacherAdjustment.reason)} ／ 自動参考点 ${m.evaluation.autoScore ?? '対象外'}</small>` : ''}</div>` : ''}<h3>本人の振り返り（任意・自動保存）</h3><label class="q-field"><span class="sr-only">${esc(m.name)}の振り返り</span><textarea data-q-reflection="${esc(m.id)}" rows="4" maxlength="2000" placeholder="できたこと、難しかったこと、個別の事情など。自由に書き換えられます。">${esc(m.reflection)}</textarea></label>${noComplete ? `<p class="q-help">確認済みの完了は0件です。未確認の提出や部分貢献もあり得るため、事実を確認してから文章を選んでください。入力は強制しません。</p>${action('未完了についての文章候補を入れる', 'reflection-example', `data-id="${esc(m.id)}"`, 'ghost small')}` : ''}</article>`;
    }).join('')}</div>`;
  }
  function handleClick(button) {
    const a = button.dataset.action;
    if (!a?.startsWith('q-')) return false;
    const id = button.dataset.id, q = current();
    if (a === 'q-open') host.go('activity');
    else if (a === 'q-back') host.go(host.getState().result ? 'results' : 'diagnosis');
    else if (a === 'q-start') {
      const s = host.getState();
      host.confirmAction('この役割で活動をはじめますか？', '担当とタスクの基本EXPを確定し、全員HP 100で開始します。既存の活動は履歴ごと別に残ります。', () => {
        try { const project = Q.create(s.members, s.tasks, s.result); project.title = `チームの活動 ${store.projects.length + 1}`; addProject(project); } catch (error) { host.toast(error.message); }
      }, '役割を確定して活動開始');
    } else if (a === 'q-demo') { try { addProject(Q.createDemo(window.TeamEngine)); } catch (error) { host.toast(error.message); } }
    else if (!q) host.toast('活動を先にはじめてください。');
    else if (a === 'q-demo-next') transact(Q.advanceDemo, '次のデモ操作を実行しました。');
    else if (a === 'q-day') transact(p => Q.setClock(p, new Date(Date.parse(p.clock) + 86400000).toISOString()), 'デモ日時を1日進めました。');
    else if (a === 'q-view') { q.view = button.dataset.view; q.selected = null; save(); refresh(); }
    else if (a === 'q-task') { q.view = 'board'; q.selected = id; q.detailTab = 'work'; save(); refresh(); }
    else if (a === 'q-task-back') { q.selected = null; save(); refresh(); }
    else if (a === 'q-detail-tab') { q.detailTab = button.dataset.tab; save(); refresh(); }
    else if (a === 'q-member') { q.view = 'teacher'; q.teacherMember = id; save(); refresh(); document.querySelector('#q-member-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (a === 'q-reflection-example') {
      const m = q.members.find(m => m.id === id), s = Q.stats(q, id);
      if (!m || s.completed !== 0 || !s.initial) return true;
      const add = () => transact(p => { const target = p.members.find(m => m.id === id); target.reflection = `${target.reflection ? `${target.reflection}\n` : ''}今回、私は担当したタスクを完了できませんでした。`; }, '文章候補を追加しました。実際の事情に合わせて自由に編集してください。');
      host.confirmAction('この文章は実際の状況に合っていますか？', `確認済みの完了は0件ですが、部分貢献を含む確認済みタスクは${s.contributed}件、提出は${s.submitted}件あります。内容が事実に合う場合だけ、任意の文章候補として追加してください。`, add, '文章候補を追加');
    }
    return true;
  }
  function handleInput(el) {
    const q = current(); if (!q) return false;
    if (el.dataset.qDraft) { q.drafts ||= {}; q.drafts[el.dataset.qDraft] = el.type === 'checkbox' ? el.checked : el.value; save(); return true; }
    if (el.dataset.qReflection) { const m = q.members.find(m => m.id === el.dataset.qReflection); if (m) m.reflection = el.value.slice(0, 2000); save(); return true; }
    return false;
  }
  function handleChange(el) {
    if (el.dataset.qSwitch !== undefined) { if (store.projects.some(p => p.id === el.value)) { store.activeId = el.value; save(); refresh(); } return true; }
    if (el.dataset.qFilter !== undefined && current()) { current().memberFilter = el.value; save(); refresh(); return true; }
    return false;
  }
  function handleSubmit(event) {
    const form = event.target, kind = form.dataset?.questForm;
    if (!kind) return false;
    event.preventDefault(); const id = form.dataset.id, v = Object.fromEntries(new FormData(form).entries()), key = formKey(kind, id);
    const run = p => {
      switch (kind) {
        case 'start': Q.started(p, id, v.member); break;
        case 'submit': Q.submit(p, id, v.member, v.evidence, v.url?.trim()); break;
        case 'approve': Q.approve(p, id, Object.fromEntries(p.members.map(m => [m.id, Number(v[`share-${m.id}`])])), v.reason, v.verified === 'on'); break;
        case 'penalty': Q.penalize(p, id, v.member, v.type, v.reason, v.unjustified === 'on'); break;
        case 'dates': Q.setDates(p, id, v.checkpoint, v.deadline, v.reason); break;
        case 'reassign': Q.reassign(p, id, p.members.filter(m => v[`assign-${m.id}`] === 'on').map(m => m.id), v.basis, v.reason); break;
        case 'wanted': Q.postWanted(p, id, v.reason, v.unjustified === 'on'); break;
        case 'cancel-wanted': Q.cancelWanted(p, id, v.reason); break;
        case 'claim': Q.claim(p, id, v.member); break;
        case 'penalty-correct': Q.correctPenalty(p, id, Number(v.amount), v.reason); break;
        case 'recovery': Q.requestRecovery(p, id, v.title, v.evidence); break;
        case 'recovery-approve': Q.approveRecovery(p, id, v.reason, v.verified === 'on'); break;
        case 'target': Q.adjustTarget(p, id, Number(v.target), v.reason, v.basis); break;
        case 'teacher': Q.teacherReview(p, id, v.comment, v.score === '' ? null : Number(v.score), v.reason); break;
        case 'close': Q.closeActivity(p, v.reason); break;
        case 'reopen': Q.reopen(p, v.reason); break;
        default: throw new Error('操作が見つかりません。');
      }
      for (const draft of Object.keys(p.drafts || {})) if (draft.startsWith(`${key}:`)) delete p.drafts[draft];
    };
    if (['claim', 'close'].includes(kind)) host.confirmAction(kind === 'claim' ? '残りの仕事を引き受けますか？' : '活動を終了しますか？', kind === 'claim' ? '元の担当者の確認済み貢献と目標EXPは残ります。現在の担当をあなたに変更します。' : '終了日時を記録し、通常の作業・EXP付与を停止します。必要なら理由を記録して再開できます。', () => transact(run), kind === 'claim' ? '引き受ける' : '活動を終了する');
    else transact(run);
    return true;
  }
  window.QuestUI = { init, nav, render, startPanel, ratingFields, handleClick, handleInput, handleChange, handleSubmit };
})();
