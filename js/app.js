/* 咩咩学 · 交互层：视图渲染、弹层、PIN、自定义与同步 */

(function () {
  var S = MM.S;
  S.load();

  var current = 'today';
  var selectedDate = MM.todayKey();
  var calCursor = new Date();
  var ui = { parentUnlocked: false, honorFilter: 'all' };
  /* 运行于 iOS 原生壳内（ViewController 注入）：隐藏 PWA 专属提示 */
  var NATIVE = !!window.__NATIVE_SHELL__;

  /* ================= 基础工具 ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function haptic() {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.haptic) {
        window.webkit.messageHandlers.haptic.postMessage({ style: 'light' });
      } else if (navigator.vibrate) navigator.vibrate(8);
    } catch (e) {}
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }
  function diff(id) {
    var p = S.p();
    return p.diffs.filter(function (d) { return d.id === id; })[0] || { name: '自定义', flowers: 0, emoji: '🌱' };
  }
  function cat(id) {
    var p = S.p();
    return p.categories.filter(function (c) { return c.id === id; })[0] || { name: '其他', emoji: '📌' };
  }
  function diffPill(d) {
    var cls = 'pill';
    if (d.flowers >= S.maxDiffFlowers() && S.p().diffs.length > 1) cls += ' red';
    else if (d.flowers >= 20) cls += ' flower';
    else cls += ' green';
    return '<span class="' + cls + '">' + esc(d.name) + '</span>';
  }
  function coverHtml(type, emoji, img) {
    if (img) return '<img src="' + img + '" alt="">';
    return emoji || '⭐';
  }

  /* ================= 弹层（栈式） =================
   * openSheet   打开新弹层；若当前已有弹层，先把旧 DOM 压栈，
   *             关闭时回到上一层（表单内容不丢）。
   * replaceSheet 在当前弹层内原地重绘（列表刷新等），不压栈。
   * opts.render 返回本层时的刷新钩子（如刷新选项行 / 重绘列表）。 */
  var sheetStack = [];
  var sheetRender = null;

  function sheetHtml(title, html) {
    return '<div class="close-row"><button class="icon-btn" data-act="close" aria-label="关闭">✕</button></div>' +
      (title ? '<h3>' + esc(title) + '</h3>' : '') + html;
  }
  function openSheet(title, html, after, opts) {
    opts = opts || {};
    var root = $('#modalRoot'), body = $('#sheetBody');
    if (!root.hidden && body.firstChild) {
      var frag = document.createDocumentFragment();
      while (body.firstChild) frag.appendChild(body.firstChild);
      sheetStack.push({ node: frag, scroll: body.scrollTop, render: sheetRender });
    }
    sheetRender = opts.render || null;
    body.innerHTML = sheetHtml(title, html);
    body.scrollTop = 0;
    root.hidden = false;
    if (after) after(root);
    body.setAttribute('tabindex', '-1');
    body.focus({ preventScroll: true });
  }
  function replaceSheet(title, html, after) {
    var root = $('#modalRoot'), body = $('#sheetBody');
    body.innerHTML = sheetHtml(title, html);
    body.scrollTop = 0;
    root.hidden = false;
    if (after) after(root);
    body.setAttribute('tabindex', '-1');
    body.focus({ preventScroll: true });
  }
  function closeSheet() {
    var root = $('#modalRoot'), body = $('#sheetBody');
    if (sheetStack.length) {
      var prev = sheetStack.pop();
      sheetRender = prev.render;
      body.innerHTML = '';
      body.appendChild(prev.node);            // 恢复原 DOM：已填的表单值原样保留
      body.scrollTop = prev.scroll || 0;
      if (prev.render) prev.render();         // 可选：用最新数据刷新本层
      return;
    }
    sheetRender = null;
    root.hidden = true;
    body.innerHTML = '';
  }
  function closeAllSheets() {
    sheetStack.length = 0;
    sheetRender = null;
    $('#modalRoot').hidden = true;
    $('#sheetBody').innerHTML = '';
  }

  /* ================= 主题与品牌 ================= */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', S.state.settings.theme || 'sky');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#EDF5FC');
  }
  function applyBrand() {
    var s = S.state.settings;
    document.title = s.appName || '咩咩学';
    $('#brandName').textContent = s.appName;
    $('#brandLogo').innerHTML = s.logoImg
      ? '<img src="' + s.logoImg + '" alt="">'
      : (s.logo || '🌸');
    var titleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (titleMeta) titleMeta.setAttribute('content', s.appName);
  }
  function applyHeader() {
    var p = S.p();
    $('#profileName').textContent = p.name;
    $('#topAvatar').innerHTML = p.avatarImg ? '<img src="' + p.avatarImg + '" alt="">' : (p.avatar || '🐑');
    $('#flowerCount').textContent = p.flowers;
  }

  /* ================= 视图切换 ================= */
  var scrollPos = {};   // 各视图滚动位置：切 Tab 后回到原处
  function viewEl(v) { return $('#v' + v.charAt(0).toUpperCase() + v.slice(1)); }

  function go(view) {
    if (view === 'parent' && !ui.parentUnlocked) {
      requireParent(function () {
        ui.parentUnlocked = true;
        go('parent');
      });
      return;
    }
    /* 离开家长中心立即锁定：家长密码不能一次解锁、整场会话免检 */
    if (current === 'parent' && view !== 'parent') ui.parentUnlocked = false;
    if (current !== view) {
      var prevEl = viewEl(current);
      if (prevEl) scrollPos[current] = prevEl.scrollTop;
    }
    current = view;
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === view); });
    $$('.tab').forEach(function (t) { t.classList.toggle('is-active', t.dataset.go === view); });
    renderView(view);
    var el = viewEl(view);
    if (el) el.scrollTop = scrollPos[view] || 0;
  }

  function renderView(v) {
    applyHeader();
    if (v === 'today') renderToday();
    else if (v === 'plan') renderPlan();
    else if (v === 'shop') renderShop();
    else if (v === 'honor') renderHonor();
    else if (v === 'parent') renderParent();
  }
  function renderAll() { renderView(current); }

  /* ================= 今日 ================= */
  function renderToday() {
    var p = S.p();
    var key = MM.todayKey();
    var tasks = p.days[key] || [];
    var ws = S.weekStats();
    var pct = ws.target ? Math.min(100, Math.round(ws.done / ws.target * 100)) : 0;
    var streak = S.streak();

    var html = '';

    html += '<div class="hero">' +
      '<div class="mascot"><img src="assets/sheep-wave.png" alt=""></div>' +
      '<div class="hero-body">' +
        '<div class="hero-label">本周目标 · 连续打卡 ' + streak + ' 天</div>' +
        '<div class="hero-num"><b>' + ws.done + '</b><span>/ ' + (ws.target || '—') + ' 朵</span></div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="hero-cap">' + (!ws.target
          ? '本周还没排计划，去「计划」页安排吧'
          : (ws.target - ws.done > 0
            ? '本周还差 ' + (ws.target - ws.done) + ' 朵达成目标'
            : '本周目标已达成，太棒啦！')) + '</div>' +
      '</div></div>';

    // 心愿目标
    html += goalStripHtml();

    html += goalGapSummary(tasks);

    html += '<div class="sec-title">今日任务 <span class="sub">' +
      (MM.dateLabel(key)) + ' · 共 ' + tasks.length + ' 项</span></div>';

    if (!tasks.length) {
      html += '<div class="empty"><span class="em">🌤️</span><p>今天还没有安排任务<br>去「计划」页添加吧</p>' +
        '<div style="margin-top:14px"><button class="btn" data-act="goto" data-view="plan">去排计划</button></div></div>';
    } else {
      html += tasks.map(function (t) { return taskCard(t, key, false); }).join('');
    }

    $('#vToday').innerHTML = html;
  }

  function goalStripHtml() {
    var p = S.p();
    if (!p.goals.length) {
      return '<div class="card flat" style="display:flex;align-items:center;gap:12px">' +
        '<div style="font-size:26px">🎯</div>' +
        '<div style="flex:1"><div style="font-size:14px;font-weight:600">还没有设定心愿目标</div>' +
        '<div class="muted" style="margin-top:3px">最多可同时设 3 个，随时能看到还差多少朵</div></div>' +
        '<button class="btn sm" data-act="goto" data-view="shop">去设定</button></div>';
    }
    var html = '<div class="goal-strip">';
    p.goals.forEach(function (gid) {
      var r = p.rewards.filter(function (x) { return x.id === gid; })[0];
      if (!r) return;
      var have = Math.min(p.flowers, r.price);
      var gap = Math.max(0, r.price - p.flowers);
      html += '<div class="goal-item">' +
        '<div class="g-ico">' + coverHtml('reward', r.emoji, r.img) + '</div>' +
        '<div class="g-body"><div class="g-name">🎯 ' + esc(r.name) + '</div>' +
        '<div class="g-bar"><i style="width:' + (r.price ? Math.round(have / r.price * 100) : 0) + '%"></i></div></div>' +
        '<div class="g-gap">' + (gap > 0 ? '还差 ' + gap + ' 朵' : '可兑换 🎉') + '</div></div>';
    });
    return html + '</div>';
  }

  function goalGapSummary(tasks) {
    var p = S.p();
    var todayRemain = tasks.filter(function (t) { return !t.done; })
      .reduce(function (s, t) { return s + t.flowers; }, 0);
    var targets = p.goals.map(function (gid) {
      return p.rewards.filter(function (x) { return x.id === gid; })[0];
    }).filter(Boolean);
    if (!targets.length) return '';
    var nearest = targets.slice().sort(function (a, b) { return a.price - b.price; })[0];
    var gap = Math.max(0, nearest.price - p.flowers);
    var html = '<div class="card flat" style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
      '<span style="font-size:20px">🌸</span>' +
      '<div style="flex:1;font-size:13px;line-height:1.6">' +
      (gap === 0
        ? '<b>' + esc(nearest.name) + '</b> 已经攒够啦，可以去兑换'
        : '今天完成全部任务可得 <b>' + todayRemain + '</b> 朵，距离「' + esc(nearest.name) + '」还差 <b style="color:var(--flower)">' + gap + '</b> 朵') +
      '</div></div>';
    return html;
  }

  function taskCard(t, key, editable) {
    var d = diff(t.diffId), c = cat(t.cat);
    var amt = t.count > 1 ? ' <span class="muted">' + t.count + (t.unit || '') + '</span>' : '';
    var right;
    if (t.done) {
      right = '<button class="btn sm ghost" data-act="uncheck" data-key="' + key + '" data-id="' + t.id + '">撤销</button>';
    } else if (t.pending) {
      right = '<span class="pill gold">待家长确认</span>';
    } else {
      right = '<button class="btn sm" data-act="checkin" data-key="' + key + '" data-id="' + t.id + '">打卡</button>';
    }
    return '<div class="task' + (t.done ? ' done' : '') + '">' +
      '<div class="task-cover">' + coverHtml('task', c.emoji) + '</div>' +
      '<div class="task-body">' +
        '<div class="task-name">' + esc(t.name) + amt + '</div>' +
        '<div class="task-meta">' +
          '<span class="pill">' + esc(c.name) + '</span>' +
          diffPill(d) +
          '<span class="pill flower">+' + t.flowers + ' 朵</span>' +
        '</div>' +
      '</div>' +
      (editable
        ? '<div class="row" style="gap:6px">' +
            '<button class="icon-btn" data-act="task-edit" data-key="' + key + '" data-id="' + t.id + '">✏️</button>' +
            '<button class="icon-btn" data-act="task-del" data-key="' + key + '" data-id="' + t.id + '">🗑</button>' +
          '</div>'
        : right) +
      '</div>';
  }

  /* ================= 计划 · 日历 ================= */
  function renderPlan() {
    var p = S.p();
    var html = '';

    // 左栏：日期概览 + 月历；右栏：当日任务（宽屏双栏，窄屏自动堆叠）
    html += '<div class="plan-wrap"><div class="plan-side">';

    html += '<div class="hero compact">' +
      '<div class="mascot"><img src="assets/sheep-read.png" alt=""></div>' +
      '<div class="hero-body"><div class="hero-label">按天排计划</div>' +
      '<div class="hero-num"><b>' + MM.dateLabel(selectedDate) + '</b></div>' +
      '<div class="hero-cap">点日历上的日期，安排那一天的小任务</div></div></div>';

    html += calendarHtml();

    html += '</div><div class="plan-main">';

    html += '<div class="row-between" style="margin:2px 2px 10px">' +
      '<div style="font-size:15px;font-weight:700">当日任务</div>' +
      '<div class="row" style="gap:8px">' +
        '<button class="btn sm ghost" data-act="copy-yesterday">复制前一天</button>' +
        '<button class="btn sm ghost" data-act="clear-day">清空</button>' +
        '<button class="btn sm" data-act="add-task">＋ 添加</button>' +
      '</div></div>';

    var list = p.days[selectedDate] || [];
    if (!list.length) {
      html += '<div class="empty"><span class="em">📅</span><p>这一天还没有任务</p></div>';
    } else {
      html += list.map(function (t) { return taskCard(t, selectedDate, true); }).join('');
    }

    // 常用任务快速添加
    if (p.templates.length) {
      html += '<div class="sec-title">常用任务快速添加</div><div class="chips-row">';
      p.templates.slice(0, 12).forEach(function (t) {
        html += '<button class="chip-sel" data-act="quick-add" data-id="' + t.id + '">' +
          esc(cat(t.cat).emoji + ' ' + t.name) + '</button>';
      });
      html += '</div>';
    }

    html += '</div></div>';

    $('#vPlan').innerHTML = html;
  }

  /* 翻月：保持选中日期始终落在日历可见月份内 */
  function shiftMonth(delta) {
    calCursor.setMonth(calCursor.getMonth() + delta);
    var y = calCursor.getFullYear(), m = calCursor.getMonth();
    var d = MM.parseKey(selectedDate);
    if (d.getFullYear() !== y || d.getMonth() !== m) {
      var maxDay = new Date(y, m + 1, 0).getDate();
      var day = Math.min(d.getDate(), maxDay);
      selectedDate = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }
    renderView('plan');
  }

  function calendarHtml() {
    var p = S.p();
    var y = calCursor.getFullYear(), m = calCursor.getMonth();
    var first = new Date(y, m, 1);
    var startPad = (first.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var prevDays = new Date(y, m, 0).getDate();
    var todayKey = MM.todayKey();

    var html = '<div class="cal"><div class="cal-head">' +
      '<div><b>' + y + ' 年 ' + (m + 1) + ' 月</b></div>' +
      '<div class="cal-nav">' +
        '<button data-act="cal-prev">‹</button>' +
        '<button data-act="cal-today">今天</button>' +
        '<button data-act="cal-next">›</button>' +
      '</div></div>' +
      '<div class="cal-week">' +
      ['一','二','三','四','五','六','日'].map(function (w) { return '<span>' + w + '</span>'; }).join('') +
      '</div><div class="cal-grid">';

    for (var i = startPad - 1; i >= 0; i--) {
      html += '<div class="cal-day other">' + (prevDays - i) + '</div>';
    }
    for (var d = 1; d <= days; d++) {
      var key = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var list = p.days[key] || [];
      var doneN = list.filter(function (t) { return t.done; }).length;
      var cls = 'cal-day';
      if (key === todayKey) cls += ' today';
      if (key === selectedDate) cls += ' sel';
      if (list.length) cls += ' has';
      var dots = '';
      for (var k = 0; k < Math.min(list.length, 4); k++) {
        dots += '<i class="' + (k < doneN ? 'done' : '') + '"></i>';
      }
      html += '<div class="' + cls + '" data-act="cal-day" data-key="' + key + '">' +
        '<span>' + d + '</span><span class="dots">' + dots + '</span></div>';
    }
    var tail = (7 - ((startPad + days) % 7)) % 7;
    for (var t = 1; t <= tail; t++) html += '<div class="cal-day other">' + t + '</div>';

    return html + '</div></div>';
  }

  /* ================= 商城 ================= */
  function renderShop() {
    var p = S.p();
    var html = '';

    html += '<div class="card" style="display:flex;align-items:center;gap:14px">' +
      '<div style="width:64px;height:64px;flex:none"><img src="assets/sheep-gift.png" style="width:100%;height:100%;object-fit:contain"></div>' +
      '<div style="flex:1"><div class="muted">我的小红花</div>' +
      '<div style="font-size:28px;font-weight:700;color:var(--flower)">' + p.flowers + ' 朵</div></div>' +
      '<div style="text-align:right"><div class="muted">累计获得</div>' +
      '<div style="font-size:16px;font-weight:600">' + p.earned + ' 朵</div></div></div>';

    if (p.goals.length) {
      html += '<div class="sec-title">我的心愿目标 <span class="sub">' + p.goals.length + '/3</span></div>';
      html += goalStripHtml();
    }

    html += '<div class="row-between" style="margin:14px 2px 10px">' +
      '<div style="font-size:15px;font-weight:700">奖励清单</div>' +
      '<div class="row" style="gap:8px">' +
        '<button class="btn sm ghost" data-act="open" data-sheet="diffs">难度设置</button>' +
        '<button class="btn sm" data-act="reward-add">＋ 新奖励</button>' +
      '</div></div>';

    html += '<div class="shop-grid">';
    p.rewards.forEach(function (r, i) {
      var can = p.flowers >= r.price && r.stock !== 0;
      var isGoal = p.goals.indexOf(r.id) > -1;
      var gap = r.price - p.flowers;
      html += '<div class="gift">' +
        '<div class="rank">' +
          '<button class="icon-btn" data-act="r-up" data-id="' + r.id + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="icon-btn" data-act="r-down" data-id="' + r.id + '"' + (i === p.rewards.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '</div>' +
        '<div class="g-top"><div class="cover">' + coverHtml('reward', r.emoji, r.img) + '</div>' +
          '<div style="flex:1;min-width:0"><div class="name">' + esc(r.name) + '</div>' +
          '<div class="muted">' + (r.stock > 0 ? '剩余 ' + r.stock + ' 份' : (r.stock === 0 ? '已兑完' : '长期供应')) + '</div></div>' +
        '</div>' +
        '<div class="foot">' +
          '<div class="price">' + MM.flowerSVG(14, 'var(--flower)') + ' ' + r.price + '</div>' +
          '<div class="row" style="gap:6px">' +
            '<button class="star' + (isGoal ? ' on' : '') + '" data-act="goal" data-id="' + r.id + '">🎯</button>' +
            '<button class="btn sm ghost" data-act="reward-edit" data-id="' + r.id + '">✏️</button>' +
          '</div>' +
        '</div>' +
        '<button class="btn sm ' + (can ? '' : 'ghost') + ' block" data-act="redeem" data-id="' + r.id + '"' + (can ? '' : ' disabled') + '>' +
          (p.flowers >= r.price ? (r.stock === 0 ? '已兑完' : '兑换') : '还差 ' + gap + ' 朵') + '</button>' +
        '</div>';
    });
    html += '</div>';

    $('#vShop').innerHTML = html;
  }

  /* ================= 荣誉墙 ================= */
  function renderHonor() {
    var p = S.p();
    var html = '';

    html += '<div class="hero" style="padding:16px">' +
      '<div class="mascot" style="width:64px;height:64px"><img src="assets/sheep-parent.png" alt=""></div>' +
      '<div class="hero-body"><div class="hero-label">荣誉墙</div>' +
      '<div class="hero-num" style="margin:2px 0 0"><b style="font-size:24px">' + Object.keys(p.badges).length + ' / ' + MM.BADGES.length + ' 枚勋章</b></div>' +
      '<div class="hero-cap">最长连续打卡 ' + p.metrics.bestStreak + ' 天 · 兑换 ' + p.metrics.redeemCount + ' 次</div></div></div>';

    html += '<div class="sec-title">勋章墙</div><div class="badge-grid">';
    MM.BADGES.forEach(function (b) {
      var got = !!p.badges[b.id];
      var cur = S.badgeProgress(b);
      var pct = Math.min(100, Math.round(cur / b.target * 100));
      html += '<div class="badge-item' + (got ? ' got' : '') + '">' +
        '<div class="ic">' + b.emoji + '</div>' +
        '<div class="nm">' + esc(b.name) + '</div>' +
        (got
          ? '<div class="tip" style="color:var(--gold-ink)">' + p.badges[b.id].slice(5) + ' 获得</div>'
          : '<div class="pg"><i style="width:' + pct + '%"></i></div><div class="tip">' + cur + '/' + b.target + '</div>') +
        '</div>';
    });
    html += '</div>';

    var filters = [['all','全部'],['badge','勋章'],['weekly','全勤'],['redeem','兑换'],['goal','心愿']];
    html += '<div class="sec-title">荣誉记录 <span class="sub">共 ' + p.honors.length + ' 条</span></div>';
    html += '<div class="chips-row">';
    filters.forEach(function (f) {
      html += '<button class="chip-sel' + (ui.honorFilter === f[0] ? ' on' : '') + '" data-act="honor-filter" data-v="' + f[0] + '">' + f[1] + '</button>';
    });
    html += '</div>';

    var list = p.honors.filter(function (h) { return ui.honorFilter === 'all' || h.type === ui.honorFilter; });
    if (!list.length) {
      html += '<div class="empty"><span class="em">🏅</span><p>还没有荣誉记录<br>完成任务、坚持打卡就能点亮</p></div>';
    } else {
      html += '<div class="honor-list">' + list.slice(0, 60).map(function (h) {
        return '<div class="honor-item"><div class="h-ic">' + (h.emoji || '🎉') + '</div>' +
          '<div class="h-bd"><div class="h-t">' + esc(h.title) + '</div>' +
          '<div class="h-s">' + esc(h.detail || '') + '</div></div>' +
          '<div class="h-d">' + h.date.slice(5) + '</div></div>';
      }).join('') + '</div>';
    }

    $('#vHonor').innerHTML = html;
  }

  /* ================= 家长中心 ================= */
  function renderParent() {
    var p = S.p();
    var ws = S.weekStats();
    var pct = ws.target ? Math.round(ws.done / ws.target * 100) : 0;
    var pend = [];
    Object.keys(p.days).forEach(function (k) {
      (p.days[k] || []).forEach(function (t) {
        if (t.pending && !t.done) pend.push({ key: k, t: t });
      });
    });

    var html = '<div class="hero" style="padding:16px">' +
      '<div class="mascot" style="width:64px;height:64px"><img src="assets/sheep-parent.png" alt=""></div>' +
      '<div class="hero-body"><div class="hero-label">家长中心 · ' + esc(p.name) + '</div>' +
      '<div class="hero-num" style="margin:2px 0 0"><b style="font-size:20px">' + (S.state.settings.pin ? '🔒 密码已启用' : '⚠️ 尚未设置密码') + '</b></div>' +
      '<div class="hero-cap">管理计划、分类、难度、奖励与数据同步</div></div></div>';

    html += '<div class="stat-grid">' +
      '<div class="stat"><b style="color:var(--accent-deep)">' + (ws.target ? pct + '%' : '—') + '</b><span>本周完成率</span></div>' +
      '<div class="stat"><b style="color:var(--gold)">' + ws.done + '</b><span>本周获得(朵)</span></div>' +
      '<div class="stat"><b style="color:var(--green)">' + S.streak() + '</b><span>连续打卡(天)</span></div>' +
      '</div>';

    html += '<div class="entry-grid">' +
      entry('➕', '手动加/减花', 'adjust') +
      entry('🏷️', '分类管理', 'categories') +
      entry('🔥', '难度与花数', 'diffs') +
      entry('🔐', '密码设置', 'pin') +
      entry('🎨', '外观与名称', 'settings') +
      entry('👨‍👩‍👧', '账户管理', 'profiles') +
      entry('☁️', '备份与同步', 'backup') +
      entry('🗂️', '其余任务管理', 'gotoplan') +
      '</div>';

    if (pend.length) {
      html += '<div class="sec-title">待确认打卡 <span class="sub">' + pend.length + ' 项</span></div>';
      html += pend.map(function (x) {
        return '<div class="card" style="display:flex;align-items:center;gap:10px;padding:12px">' +
          '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">' + esc(x.t.name) + '</div>' +
          '<div class="muted">' + x.key.slice(5) + ' · +' + x.t.flowers + ' 朵</div></div>' +
          '<button class="btn sm ok" data-act="approve" data-key="' + x.key + '" data-id="' + x.t.id + '">通过</button>' +
          '<button class="btn sm ghost" data-act="reject" data-key="' + x.key + '" data-id="' + x.t.id + '">退回</button>' +
          '</div>';
      }).join('');
    }

    html += '<div class="sec-title">近期记录</div><div class="card">';
    var logs = p.log.slice(-12).reverse();
    if (!logs.length) html += '<div class="muted" style="text-align:center">暂无记录</div>';
    logs.forEach(function (l) {
      html += '<div class="log-item">' +
        '<span class="amt ' + (l.amount >= 0 ? 'plus' : 'minus') + '">' + (l.amount >= 0 ? '+' : '') + l.amount + '</span>' +
        '<span class="r">' + esc(l.reason) + '</span>' +
        '<span class="d">' + l.date.slice(5) + '</span></div>';
    });
    html += '</div>';

    $('#vParent').innerHTML = html;
  }
  function entry(emoji, name, sheet) {
    return '<button class="entry" data-act="open" data-sheet="' + sheet + '">' +
      '<div class="e-ic">' + emoji + '</div><div class="e-n">' + name + '</div></button>';
  }

  /* ================= PIN ================= */
  function openPin(title, onOk, isSet) {
    var buf = '';

    function dotsHtml() {
      var filled = buf.length;
      var total = isSet ? Math.max(4, filled) : Math.max(4, (S.state.settings.pin || '').length || 4);
      var html = '';
      for (var i = 0; i < total; i++) html += '<i' + (i < filled ? ' class="on"' : '') + '></i>';
      return html;
    }

    function draw(redraw) {
      (redraw ? replaceSheet : openSheet)(title, pinHtml(), bind);
    }

    function pinHtml() {
      return '<div class="pin-wrap"><div class="pin-dots">' + dotsHtml() + '</div>' +
        '<div class="keypad">' +
          [1,2,3,4,5,6,7,8,9].map(function (n) { return '<button data-pin="' + n + '">' + n + '</button>'; }).join('') +
          '<button class="fn" data-pin="clear">清空</button>' +
          '<button data-pin="0" aria-label="数字 0">0</button>' +
          '<button class="fn" data-pin="del">删除</button>' +
        '</div>' +
        '<button class="btn block lg" data-act="pin-done" style="margin-top:16px">' +
          (isSet ? '确认使用' : '确定') + '</button>' +
        '<button class="btn block lg ghost" data-act="close" style="margin-top:10px">取消</button></div>';
    }

    function bind(root) {
      $$('[data-pin]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          haptic();
          var v = b.dataset.pin;
          if (v === 'del') buf = buf.slice(0, -1);
          else if (v === 'clear') buf = '';
          else if (buf.length < 6) buf += v;
          draw(true);
        });
      });
      $('[data-act="pin-done"]', root).addEventListener('click', function () {
        if (isSet) {
          if (buf.length < 4) { toast('至少 4 位'); return; }
          closeSheet(); onOk(buf);
        } else {
          if (buf === S.state.settings.pin) { closeAllSheets(); onOk(); }
          else { toast('密码不正确'); buf = ''; draw(true); }
        }
      });
    }

    draw();
  }

  function requireParent(cb) {
    var s = S.state.settings;
    if (!s.pin) {
      sheetConfirmSet(cb);
      return;
    }
    openPin('请输入家长密码', cb);
  }

  function sheetConfirmSet(cb) {
    openSheet('进入家长中心',
      '<div class="hint">还没有设置家长密码。<br>建议先设置一个 4-6 位密码，避免孩子自行修改小红花与奖励。</div>' +
      '<button class="btn block lg" data-act="pin-new" style="margin-bottom:10px">设置密码后进入</button>' +
      '<button class="btn block lg ghost" data-act="pin-skip">暂不设置，直接进入</button>',
      function (root) {
        $('[data-act="pin-new"]', root).addEventListener('click', function () {
          openPin('设置新密码', function (code) {
            S.state.settings.pin = code;
            S.save();
            toast('密码已启用');
            cb();
          }, true);
        });
        $('[data-act="pin-skip"]', root).addEventListener('click', function () { closeAllSheets(); cb(); });
      });
  }

  function openPinSettings() {
    var s = S.state.settings;
    if (!s.pin) {
      openPin('设置新密码', function (code) {
        s.pin = code; S.save(); toast('家长密码已启用'); renderView('parent');
      }, true);
      return;
    }
    openPin('验证当前密码', function () {
      openPin('设置新密码', function (code) {
        s.pin = code; S.save(); toast('密码已更新'); renderView('parent');
      }, true);
    });
  }

  /* ================= 各管理面板 ================= */
  function sheetTaskEditor(key, taskId) {
    var p = S.p();
    var list = p.days[key] || [];
    var t = taskId ? list.filter(function (x) { return x.id === taskId; })[0] : null;
    var form = t ? {
      name: t.name, cat: t.cat, diffId: t.diffId, count: t.count, unit: t.unit, flowers: t.flowers
    } : { name: '', cat: p.categories[0].id, diffId: p.diffs[0].id, count: 1, unit: '', flowers: p.diffs[0].flowers };

    /* 表单状态提升到本层作用域：从子弹层返回后仍可读取/刷新 */
    var cnt = form.count, fl = form.flowers;
    var pickCat = form.cat, pickDiff = form.diffId;
    var flDirty = false;   // 用户手动调过花数后，选难度不再覆盖花数

    function catChipsHtml() {
      return p.categories.map(function (c) {
        return '<button class="chip-sel' + (c.id === pickCat ? ' on' : '') + '" data-cat="' + c.id + '">' + c.emoji + ' ' + esc(c.name) + '</button>';
      }).join('') +
        '<button class="chip-sel" data-act="open" data-sheet="categories">＋ 管理</button>';
    }
    function diffChipsHtml() {
      return p.diffs.map(function (d) {
        return '<button class="chip-sel' + (d.id === pickDiff ? ' on' : '') + '" data-diff="' + d.id + '">' +
          d.emoji + ' ' + esc(d.name) + ' · ' + d.flowers + ' 朵</button>';
      }).join('') +
        '<button class="chip-sel" data-act="open" data-sheet="diffs">＋ 管理</button>';
    }
    function bindChips(root) {
      $$('#catRow [data-cat]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          pickCat = b.dataset.cat;
          $$('#catRow .chip-sel', root).forEach(function (x) { x.classList.toggle('on', x.dataset.cat === pickCat); });
        });
      });
      $$('#diffRow [data-diff]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          pickDiff = b.dataset.diff;
          /* 难度 ↔ 花数联动：没手动改过花数时，跟随所选难度的默认花数 */
          if (!flDirty) {
            var d = p.diffs.filter(function (x) { return x.id === pickDiff; })[0];
            if (d) { fl = d.flowers; $('#flVal', root).textContent = fl; }
          }
          $$('#diffRow .chip-sel', root).forEach(function (x) { x.classList.toggle('on', x.dataset.diff === pickDiff); });
        });
      });
    }

    var html =
      '<div class="field"><label>名称</label><input id="fName" placeholder="例如：口算练习" value="' + esc(form.name) + '"></div>' +
      '<div class="field"><label>数量</label>' +
        '<div class="stepper"><button type="button" id="cntDown">−</button><span class="val" id="cntVal">' + form.count + '</span><button type="button" id="cntUp">＋</button></div>' +
      '</div>' +
      '<div class="field"><label>单位</label><input id="fUnit" placeholder="题 / 页 / 分钟" value="' + esc(form.unit) + '"></div>' +
      '<div class="sec-title" style="margin:14px 0 8px">分类</div><div class="chips-row" id="catRow">' + catChipsHtml() + '</div>' +
      '<div class="sec-title" style="margin:14px 0 8px">难度（对应小红花）</div><div class="chips-row" id="diffRow">' + diffChipsHtml() + '</div>' +
      '<div class="hint">花朵数也可单独调整：</div>' +
      '<div class="field"><label>花数</label>' +
        '<div class="stepper"><button type="button" id="flDown">−</button><span class="val" id="flVal">' + form.flowers + '</span><button type="button" id="flUp">＋</button></div>' +
        '<span class="muted" style="flex:none">朵</span></div>' +
      '<button class="btn block lg" data-act="task-save" style="margin-top:14px">' + (t ? '保存修改' : '添加到这一天') + '</button>' +
      (t ? '<button class="btn block lg ghost" data-act="task-del" data-key="' + key + '" data-id="' + t.id + '" style="margin-top:10px">删除任务</button>' : '');

    openSheet(t ? '编辑任务' : '添加任务', html, function (root) {
      $('#cntVal', root).textContent = cnt;
      $('#flVal', root).textContent = fl;

      $('#cntDown', root).addEventListener('click', function () { cnt = Math.max(0, cnt - 1); $('#cntVal', root).textContent = cnt; });
      $('#cntUp', root).addEventListener('click', function () { cnt += 1; $('#cntVal', root).textContent = cnt; });
      $('#flDown', root).addEventListener('click', function () { fl = Math.max(0, fl - 1); flDirty = true; $('#flVal', root).textContent = fl; });
      $('#flUp', root).addEventListener('click', function () { fl += 1; flDirty = true; $('#flVal', root).textContent = fl; });

      bindChips(root);

      $('[data-act="task-save"]', root).addEventListener('click', function () {
        var name = $('#fName', root).value.trim();
        if (!name) { toast('请填写任务名称'); return; }
        var data = { name: name, cat: pickCat, diffId: pickDiff, flowers: fl, count: cnt, unit: $('#fUnit', root).value.trim() };
        if (t) S.updateTask(key, t.id, data);
        else S.addTask(key, data);
        closeAllSheets();
        toast(t ? '已保存' : '已添加');
        renderView(current);
      });
    }, {
      /* 从「＋管理」返回本层：只刷新分类/难度选项行，已填内容原样保留 */
      render: function () {
        var root = $('#sheetBody');
        var catRow = $('#catRow', root), diffRow = $('#diffRow', root);
        if (catRow) catRow.innerHTML = catChipsHtml();
        if (diffRow) diffRow.innerHTML = diffChipsHtml();
        bindChips(root);
      }
    });
  }

  function sheetCategories(redraw) {
    var p = S.p();
    (redraw ? replaceSheet : openSheet)('任务分类',
      '<div class="hint">孩子常用的科目或活动分类，可自由增加与删除。</div>' +
      '<div class="preset-grid">' + p.categories.map(function (c) {
        return '<div class="preset"><div class="p-title">' + c.emoji + ' ' + esc(c.name) +
          (c.preset ? '<span class="pill grey" style="font-size:10px">预设</span>' : '') + '</div>' +
          '<div class="p-sub">点右侧图标可删除</div>' +
          '<button class="del" data-del-cat="' + c.id + '">✕</button></div>';
      }).join('') + '</div>' +
      '<div class="sec-title" style="margin:16px 0 8px">新增分类</div>' +
      '<div class="field"><label>图标</label><input id="catEmoji" placeholder="emoji，如 🏊" maxlength="4" style="max-width:80px"></div>' +
      '<div class="field"><label>名称</label><input id="catName" placeholder="例如：游泳"></div>' +
      '<button class="btn block lg" data-act="cat-add" style="margin-top:10px">添加分类</button>',
      function (root) {
        $$('[data-del-cat]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            if (S.removeCategory(b.dataset.delCat)) { sheetCategories(true); }
            else toast('至少保留一个分类');
          });
        });
        $('[data-act="cat-add"]', root).addEventListener('click', function () {
          var n = $('#catName', root).value.trim();
          if (!n) { toast('请填写名称'); return; }
          var e = $('#catEmoji', root).value.trim() || '⭐';
          S.addCategory(n, e);
          sheetCategories(true);
        });
      });
  }

  function sheetDiffs(redraw) {
    var p = S.p();
    (redraw ? replaceSheet : openSheet)('难度与小红花',
      '<div class="hint">难度对应每完成一项任务可得的小红花数量，可自由增加、修改与删除。</div>' +
      '<div class="preset-grid">' + p.diffs.map(function (d) {
        return '<div class="preset"><div class="p-title">' + (d.emoji || '🌱') + ' ' + esc(d.name) + '</div>' +
          '<div class="p-sub"><span class="stepper" style="margin-top:6px">' +
            '<button data-df-down="' + d.id + '">−</button><span class="val">' + d.flowers + '</span><button data-df-up="' + d.id + '">＋</button>' +
          '</span> 朵</div>' +
          '<button class="del" data-del-diff="' + d.id + '">✕</button></div>';
      }).join('') + '</div>' +
      '<div class="sec-title" style="margin:16px 0 8px">新增难度</div>' +
      '<div class="field"><label>名称</label><input id="dfName" placeholder="例如：小小任务的自定义名称"></div>' +
      '<div class="field"><label>花数</label><input id="dfFlowers" type="number" inputmode="numeric" value="15"></div>' +
      '<button class="btn block lg" data-act="df-add" style="margin-top:10px">添加难度</button>',
      function (root) {
        function bump(id, delta) {
          var d = p.diffs.filter(function (x) { return x.id === id; })[0];
          S.updateDiff(id, { flowers: Math.max(1, (d.flowers || 0) + delta) });
          sheetDiffs(true);
        }
        $$('[data-df-up]', root).forEach(function (b) { b.addEventListener('click', function () { bump(b.dataset.dfUp, 1); }); });
        $$('[data-df-down]', root).forEach(function (b) { b.addEventListener('click', function () { bump(b.dataset.dfDown, -1); }); });
        $$('[data-del-diff]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            if (S.removeDiff(b.dataset.delDiff)) sheetDiffs(true);
            else toast('至少保留一个难度');
          });
        });
        $('[data-act="df-add"]', root).addEventListener('click', function () {
          var n = $('#dfName', root).value.trim();
          if (!n) { toast('请填写名称'); return; }
          S.addDiff(n, +$('#dfFlowers', root).value || 10, '🌱');
          sheetDiffs(true);
        });
      });
  }

  function sheetRewardEditor(rid) {
    var p = S.p();
    var r = rid ? p.rewards.filter(function (x) { return x.id === rid; })[0] : null;
    openSheet(r ? '编辑奖励' : '新增奖励',
      '<div class="field"><label>名称</label><input id="rName" value="' + esc(r ? r.name : '') + '" placeholder="例如：周末看电影"></div>' +
      '<div class="field"><label>图标</label><input id="rEmoji" value="' + esc(r ? r.emoji : '🎁') + '" maxlength="4" style="max-width:90px">' +
        '<span class="muted">也可用照片：</span><button class="btn sm ghost" data-act="pick-img">选择图片</button></div>' +
      '<div id="rImgBox" style="margin-bottom:10px">' + (r && r.img ? '<img src="' + r.img + '" style="width:72px;height:72px;border-radius:16px;object-fit:cover">' : '') + '</div>' +
      '<div class="field"><label>花数</label><input id="rPrice" type="number" inputmode="numeric" value="' + (r ? r.price : 100) + '"></div>' +
      '<div class="field"><label>份数</label><input id="rStock" type="number" inputmode="numeric" value="' + (r && r.stock >= 0 ? r.stock : -1) + '"><span class="muted" style="flex:none">-1 = 不限</span></div>' +
      '<button class="btn block lg" data-act="r-save" style="margin-top:12px">保存</button>' +
      (r ? '<button class="btn block lg ghost" data-act="r-del" data-id="' + r.id + '" style="margin-top:10px">删除这件奖励</button>' : ''),
      function (root) {
        var imgData = r ? r.img : null;
        $('[data-act="pick-img"]', root).addEventListener('click', function () {
          pickImage(function (dataUrl) {
            imgData = dataUrl;
            $('#rImgBox', root).innerHTML = '<img src="' + dataUrl + '" style="width:72px;height:72px;border-radius:16px;object-fit:cover">';
          });
        });
        $('[data-act="r-save"]', root).addEventListener('click', function () {
          var name = $('#rName', root).value.trim();
          if (!name) { toast('请填写名称'); return; }
          var data = {
            name: name,
            emoji: $('#rEmoji', root).value.trim() || '🎁',
            price: Math.max(1, +$('#rPrice', root).value || 1),
            stock: +$('#rStock', root).value,
            img: imgData
          };
          if (r) S.updateReward(r.id, data);
          else S.addReward(data);
          closeSheet(); toast('已保存'); renderView('shop');
        });
      });
  }

  function sheetParentAdjust() {
    var p = S.p();
    var mode = 'plus';
    var opened = false;   // 模式切换时原地重绘，不往弹层栈里压新层
    sheetRender = null;
    function draw() {
      var emit = opened ? replaceSheet : openSheet; opened = true;
      var reasons = MM.REASONS[mode];
      var html =
        '<div class="chips-row" style="justify-content:center">' +
          '<button class="chip-sel' + (mode === 'plus' ? ' on' : '') + '" data-mode="plus">➕ 奖励花朵</button>' +
          '<button class="chip-sel' + (mode === 'minus' ? ' on' : '') + '" data-mode="minus">➖ 扣除花朵</button>' +
        '</div>' +
        '<div class="field"><label>数量</label>' +
          '<div class="stepper" style="margin:0 auto">' +
            '<button id="amDown">−</button><span class="val" id="amVal">5</span><button id="amUp">＋</button>' +
          '</div><span class="muted" style="flex:none">朵</span></div>' +
        '<div class="sec-title" style="margin:14px 0 8px">理由（可快速选择）</div>' +
        '<div class="chips-row">' + reasons.map(function (r) {
          return '<button class="chip-sel" data-reason="' + esc(r) + '">' + esc(r) + '</button>';
        }).join('') + '</div>' +
        '<div class="field"><label>备注</label><input id="ajNote" placeholder="可选，写点鼓励的话"></div>' +
        '<button class="btn block lg" data-act="aj-apply" style="margin-top:12px">确认' + (mode === 'plus' ? '奖励' : '扣除') + '</button>';
      emit('手动调整小红花', html, bind);
    }
    var amount = 5, note = '', reasonText = '';
    function bind(root) {
      $$('[data-mode]', root).forEach(function (b) {
        b.addEventListener('click', function () { mode = b.dataset.mode; amount = 5; draw(); });
      });
      $('#amDown', root).addEventListener('click', function () { amount = Math.max(1, amount - 1); $('#amVal', root).textContent = amount; });
      $('#amUp', root).addEventListener('click', function () { amount += 1; $('#amVal', root).textContent = amount; });
      $$('[data-reason]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          reasonText = b.dataset.reason;
          $$('[data-reason]', root).forEach(function (x) { x.classList.toggle('on', x === b); });
        });
      });
      $('[data-act="aj-apply"]', root).addEventListener('click', function () {
        note = $('#ajNote', root).value.trim();
        var delta = mode === 'plus' ? amount : -amount;
        var reason = (mode === 'plus' ? '家长奖励：' : '家长扣除：') + (reasonText || '手动调整') + (note ? ' · ' + note : '');
        S.grant(delta, reason, 'parent');
        S.afterChange(MM.todayKey());
        S.save();
        closeSheet();
        toast((delta > 0 ? '已奖励 ' : '已扣除 ') + Math.abs(delta) + ' 朵');
        renderView('parent');
        applyHeader();
      });
    }
    draw();
  }

  function sheetProfiles(redraw) {
    var html = '<div class="hint">家里有多个孩子？为每个孩子建立独立档案，小红花、计划与荣誉互不干扰。</div>';
    S.state.profiles.forEach(function (p) {
      var active = p.id === S.state.activeId;
      html += '<div class="card flat" style="display:flex;align-items:center;gap:12px;padding:12px">' +
        '<div class="task-cover" style="width:44px;height:44px">' + (p.avatarImg ? '<img src="' + p.avatarImg + '">' : p.avatar) + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600">' + esc(p.name) + '</div>' +
        '<div class="muted">' + p.flowers + ' 朵 · 勋章 ' + Object.keys(p.badges).length + ' 枚</div></div>' +
        (active ? '<span class="pill green">当前</span>' : '<button class="btn sm ghost" data-switch="' + p.id + '">切换</button>') +
        '<button class="icon-btn" data-edit-profile="' + p.id + '">✏️</button>' +
        '</div>';
    });
    html += '<button class="btn block lg" data-act="profile-add" style="margin-top:12px">＋ 添加孩子档案</button>';

    (redraw ? replaceSheet : openSheet)('账户管理', html, function (root) {
      $$('[data-switch]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          S.switchProfile(b.dataset.switch);
          ui.parentUnlocked = false;
          closeSheet(); applyHeader(); renderView(current);
          toast('已切换到 ' + S.p().name);
        });
      });
      $$('[data-edit-profile]', root).forEach(function (b) {
        b.addEventListener('click', function () { sheetProfileEditor(b.dataset.editProfile); });
      });
      $('[data-act="profile-add"]', root).addEventListener('click', sheetProfileAdd);
    }, { render: function () { sheetProfiles(true); } });   // 编辑/新增档案返回后刷新列表
  }

  function sheetProfileAdd() { sheetProfileEditor(null); }

  function sheetProfileEditor(pid) {
    var p = pid ? S.byId(pid) : null;
    var av = p ? p.avatar : '🐑';
    var img = p ? p.avatarImg : null;
    openSheet(p ? '编辑档案' : '新增孩子档案',
      '<div class="field"><label>名字</label><input id="pfName" value="' + esc(p ? p.name : '') + '" placeholder="例如：小咩"></div>' +
      '<div class="sec-title" style="margin:14px 0 8px">头像</div>' +
      '<div class="chips-row" id="avRow">' + MM.AVATARS.map(function (a) {
        return '<button class="chip-sel' + (!img && a === av ? ' on' : '') + '" data-av="' + a + '" style="font-size:20px">' + a + '</button>';
      }).join('') + '</div>' +
      '<div class="row" style="gap:8px;margin-bottom:12px">' +
        '<button class="btn sm ghost" data-act="pick-avatar-img">从相册选头像</button>' +
        (img ? '<button class="btn sm ghost" data-act="clear-avatar-img">清除照片</button>' : '') +
      '</div>' +
      '<div id="avPrev" style="margin-bottom:10px">' + (img ? '<img src="' + img + '" style="width:72px;height:72px;border-radius:36px;object-fit:cover">' : '') + '</div>' +
      '<button class="btn block lg" data-act="pf-save" style="margin-top:8px">保存</button>' +
      (p && S.state.profiles.length > 1 ? '<button class="btn block lg ghost" data-act="pf-del" data-id="' + p.id + '" style="margin-top:10px">删除这个档案</button>' : ''),
      function (root) {
        var pickAv = av, pickImg = img;
        $$('[data-av]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            pickAv = b.dataset.av; pickImg = null;
            $$('[data-av]', root).forEach(function (x) { x.classList.toggle('on', x === b); });
            $('#avPrev', root).innerHTML = '';
          });
        });
        $('[data-act="pick-avatar-img"]', root).addEventListener('click', function () {
          pickImage(function (d) {
            pickImg = d;
            $('#avPrev', root).innerHTML = '<img src="' + d + '" style="width:72px;height:72px;border-radius:36px;object-fit:cover">';
          });
        });
        var clearAv = $('[data-act="clear-avatar-img"]', root);
        if (clearAv) clearAv.addEventListener('click', function () {
          pickImg = null; $('#avPrev', root).innerHTML = '';
          clearAv.hidden = true;   // 就地隐藏，避免重绘丢掉已填的名字
        });
        $('[data-act="pf-save"]', root).addEventListener('click', function () {
          var n = $('#pfName', root).value.trim();
          if (!n) { toast('请填写名字'); return; }
          if (p) { p.name = n; p.avatar = pickAv; p.avatarImg = pickImg; }
          else {
            var np = S.addProfile(n, pickAv);
            np.avatarImg = pickImg;
          }
          S.save(); closeSheet();      // closeSheet 会回到「账户管理」并触发其刷新钩子
          applyHeader(); renderView(current);
        });
        var del = $('[data-act="pf-del"]', root);
        if (del) del.addEventListener('click', function () {
          if (confirm('确定删除「' + p.name + '」的全部数据吗？')) {
            S.removeProfile(p.id);
            closeSheet(); applyHeader(); renderView(current);
          }
        });
      });
  }

  function sheetSettings(redraw) {
    var s = S.state.settings;
    (redraw ? replaceSheet : openSheet)('外观与名称',
      '<div class="sec-title" style="margin:6px 0 8px">App 主题</div>' +
      '<div class="preset-grid">' + MM.THEMES.map(function (t) {
        return '<button class="preset" data-theme-pick="' + t.id + '" style="text-align:center;border:2px solid ' +
          (s.theme === t.id ? t.accent : 'transparent') + '">' +
          '<div style="font-size:22px">' + t.emoji + '</div>' +
          '<div class="p-title" style="justify-content:center;margin-top:4px">' + t.name + '</div></button>';
      }).join('') + '</div>' +
      '<div class="sec-title" style="margin:16px 0 8px">显示名称</div>' +
      '<div class="field"><label>名称</label><input id="stName" value="' + esc(s.appName) + '" maxlength="12"></div>' +
      '<div class="sec-title" style="margin:14px 0 8px">Logo</div>' +
      '<div class="chips-row">' + MM.LOGOS.map(function (l) {
        return '<button class="chip-sel' + (!s.logoImg && s.logo === l ? ' on' : '') + '" data-logo="' + l + '" style="font-size:18px">' + l + '</button>';
      }).join('') + '</div>' +
      '<div class="row" style="gap:8px;margin:10px 0">' +
        '<button class="btn sm ghost" data-act="pick-logo-img">上传自定义 Logo</button>' +
        (s.logoImg ? '<button class="btn sm ghost" data-act="clear-logo">恢复默认</button>' : '') +
      '</div>' +
      '<div id="logoPrev" style="margin-bottom:10px">' + (s.logoImg ? '<img src="' + s.logoImg + '" style="width:64px;height:64px;border-radius:16px;object-fit:cover">' : '') + '</div>' +
      '<div class="hint">' + (NATIVE
        ? '提示：名称与 Logo 会立即在应用内生效。'
        : '提示：名称与 Logo 会立即在应用内生效；主屏幕图标需要在 iPad 上删除后重新「添加到主屏幕」才会更新。') + '</div>',
      function (root) {
        $$('[data-theme-pick]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            s.theme = b.dataset.themePick; S.save(); applyTheme(); sheetSettings(true); renderAll();
          });
        });
        $$('[data-logo]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            s.logo = b.dataset.logo; s.logoImg = null; S.save(); applyBrand(); sheetSettings(true);
          });
        });
        $('#stName', root).addEventListener('change', function () {
          s.appName = $('#stName', root).value.trim() || '咩咩学';
          S.save(); applyBrand();
        });
        $('[data-act="pick-logo-img"]', root).addEventListener('click', function () {
          pickImage(function (d) { s.logoImg = d; S.save(); applyBrand(); sheetSettings(true); });
        });
        var clear = $('[data-act="clear-logo"]', root);
        if (clear) clear.addEventListener('click', function () { s.logoImg = null; S.save(); applyBrand(); sheetSettings(true); });
      });
  }

  function sheetBackup() {
    openSheet('备份与同步',
      '<div class="hint">因为没有登录账号，换设备靠「导出备份文件」迁移：<br>' +
      '1. 点导出，把文件存到 <b>iCloud 云盘 / 隔空投送 / 微信</b>；<br>' +
      '2. 新设备打开应用后点导入，选择同一个文件即可完整还原。<br>' +
      '（若已装入原生 App，数据会额外通过 iCloud 键值同步通道自动写入。）</div>' +
      '<button class="btn block lg" data-act="export" style="margin-bottom:10px">⬇️ 导出备份文件</button>' +
      '<button class="btn block lg ghost" data-act="import" style="margin-bottom:10px">⬆️ 从文件导入恢复</button>' +
      '<input type="file" id="importFile" accept="application/json" hidden>' +
      '<div class="card flat" style="margin-top:6px">' +
        '<div style="font-size:13px;font-weight:600;margin-bottom:6px">数据概况</div>' +
        '<div class="muted">档案 ' + S.state.profiles.length + ' 个 · 荣誉 ' +
        S.state.profiles.reduce(function (n, p) { return n + p.honors.length; }, 0) + ' 条</div>' +
      '</div>',
      function (root) {
        $('[data-act="export"]', root).addEventListener('click', function () {
          var blob = new Blob([S.serialize()], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = '咩咩学备份-' + MM.todayKey() + '.json';
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
          toast('已导出，请存到 iCloud 云盘');
        });
        $('[data-act="import"]', root).addEventListener('click', function () { $('#importFile', root).click(); });
        $('#importFile', root).addEventListener('change', function (e) {
          var f = e.target.files[0];
          if (!f) return;
          var reader = new FileReader();
          reader.onload = function () {
            var mode = confirm('点「确定」= 合并保留现有数据\n点「取消」= 用备份完全替换') ? 'merge' : 'replace';
            try {
              S.restore(reader.result, mode);
              applyTheme(); applyBrand(); applyHeader();
              closeSheet(); renderView(current);
              toast('导入成功');
            } catch (err) {
              toast('文件解析失败：' + err.message);
            }
          };
          reader.readAsText(f);
        });
      });
  }

  /* ================= 图片选择（压缩后存储） ================= */
  function pickImage(cb) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 320;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d');
          /* 先铺白底：PNG 透明区转 JPEG 会变黑 */
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          cb(cv.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = function () { toast('图片读取失败，换一张试试'); };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
    input.click();
  }

  /* ================= 打卡庆祝 ================= */
  function celebrate(amount, name) {
    var html = '<div style="text-align:center;padding:6px 0 12px">' +
      '<img src="assets/sheep-jump.png" style="width:180px;height:180px;object-fit:contain;margin:0 auto">' +
      '<div style="font-size:26px;font-weight:700;margin-top:4px">+' + amount + ' 朵小红花！</div>' +
      '<div class="muted" style="margin-top:6px">完成「' + esc(name) + '」</div>' +
      '<div style="margin-top:16px;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--flower);font-weight:700">' +
      MM.flowerSVG(18, 'var(--flower)') + ' 当前 ' + S.p().flowers + ' 朵</div>' +
      '</div>' +
      '<button class="btn block lg" data-act="close" style="margin-top:14px">继续加油</button>';
    openSheet('打卡成功', html);
  }

  /* ================= 事件委托 ================= */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el) {
      var act = el.dataset.act;
      haptic();
      switch (act) {
        case 'close': closeSheet(); return;
        case 'goto': go(el.dataset.view); return;
        case 'gotoplan': closeSheet(); selectedDate = MM.todayKey(); go('plan'); return;
        case 'checkin': {
          var res = S.checkin(el.dataset.key, el.dataset.id);
          if (res === 'pending') { toast('已提交，等待家长确认'); renderAll(); }
          else if (res) {
            var t = S.p().days[el.dataset.key].filter(function (x) { return x.id === el.dataset.id; })[0];
            celebrate(t.flowers, t.name);
            applyHeader(); renderAll();
          }
          return;
        }
        case 'uncheck':
          S.uncheck(el.dataset.key, el.dataset.id);
          applyHeader(); renderAll(); toast('已撤销打卡');
          return;
        case 'approve':
          S.approve(el.dataset.key, el.dataset.id);
          applyHeader(); renderView('parent'); toast('已通过并发放小红花');
          return;
        case 'reject':
          S.updateTask(el.dataset.key, el.dataset.id, { pending: false });
          renderView('parent'); toast('已退回');
          return;
        case 'task-edit':
          if (current === 'plan') sheetTaskEditor(selectedDate, el.dataset.id);
          return;
        case 'task-del':
          S.removeTask(current === 'plan' ? selectedDate : el.dataset.key, el.dataset.id);
          closeSheet(); renderAll(); toast('已删除');
          return;
        case 'add-task':
          sheetTaskEditor(selectedDate, null);
          return;
        case 'quick-add': {
          var p = S.p();
          var tm = p.templates.filter(function (x) { return x.id === el.dataset.id; })[0];
          if (tm) {
            S.addTask(selectedDate, { name: tm.name, cat: tm.cat, diffId: tm.diffId, flowers: tm.flowers, count: tm.count, unit: tm.unit });
            renderView('plan'); toast('已添加');
          }
          return;
        }
        case 'copy-yesterday': {
          var d = MM.parseKey(selectedDate); d.setDate(d.getDate() - 1);
          var n = S.copyDay(MM.dateKey(d), selectedDate);
          renderView('plan'); toast(n ? '已复制 ' + n + ' 项' : '前一天没有任务');
          return;
        }
        case 'clear-day':
          if (confirm('清空 ' + MM.shortDate(selectedDate) + ' 的全部任务？')) {
            S.clearDay(selectedDate); renderView('plan');
          }
          return;
        /* 翻月后把选中日期钳到本月：否则日历高亮消失、下方列表显示的还是别的月份 */
        case 'cal-prev': shiftMonth(-1); return;
        case 'cal-next': shiftMonth(1); return;
        case 'cal-today':
          calCursor = new Date(); selectedDate = MM.todayKey(); renderView('plan');
          return;
        case 'cal-day':
          selectedDate = el.dataset.key; renderView('plan');
          return;
        case 'r-up': S.reorderReward(el.dataset.id, -1); renderView('shop'); return;
        case 'r-down': S.reorderReward(el.dataset.id, 1); renderView('shop'); return;
        case 'goal': {
          var r = S.toggleGoal(el.dataset.id);
          if (r === 'full') toast('心愿目标最多同时设 3 个');
          else toast(r === 'added' ? '已设为心愿目标' : '已取消目标');
          renderView(current); return;
        }
        case 'redeem': {
          var res2 = S.redeem(el.dataset.id);
          if (res2.ok) {
            toast('兑换成功：' + res2.name);
            applyHeader(); renderView('shop');
            celebrateRedeem(res2.name);
          } else toast(res2.msg);
          return;
        }
        case 'reward-add': sheetRewardEditor(null); return;
        case 'reward-edit': sheetRewardEditor(el.dataset.id); return;
        case 'honor-filter': ui.honorFilter = el.dataset.v; renderView('honor'); return;
        case 'open': return handleOpen(el.dataset.sheet);
        case 'reward-del': case 'r-del':
          S.removeReward(el.dataset.id); closeSheet(); renderView('shop'); toast('已删除');
          return;
      }
    }

    var tab = e.target.closest('.tab');
    if (tab) { go(tab.dataset.go); return; }
    if (e.target.id === 'mask') { closeSheet(); return; }
    if (e.target.closest('#btnProfile')) { sheetProfiles(); return; }
    if (e.target.closest('#btnBrand')) { sheetSettings(); return; }
    if (e.target.closest('#btnFlowers')) { sheetAccountDetail(); return; }
  });

  function celebrateRedeem(name) {
    openSheet('兑换成功',
      '<div style="text-align:center;padding:8px 0 14px">' +
      '<img src="assets/sheep-gift.png" style="width:170px;height:170px;object-fit:contain;margin:0 auto">' +
      '<div style="font-size:22px;font-weight:700;margin-top:6px">「' + esc(name) + '」已兑换</div>' +
      '<div class="muted" style="margin-top:6px">记得请爸爸妈妈一起兑现这份约定 🌸</div></div>' +
      '<button class="btn block lg" data-act="close">好的</button>');
  }

  function sheetAccountDetail() {
    var p = S.p();
    openSheet('小红花账户',
      '<div style="text-align:center;padding:8px 0 12px">' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--flower)">' +
      MM.flowerSVG(22, 'var(--flower)') + '<span style="font-size:34px;font-weight:700">' + p.flowers + '</span></div>' +
      '<div class="muted">可用余额（朵）</div>' +
      '<div class="row-between" style="margin-top:16px"><span class="muted">累计获得</span><b>' + p.earned + ' 朵</b></div>' +
      '<div class="row-between" style="margin-top:8px"><span class="muted">累计兑换</span><b>' + Math.max(0, p.earned - p.flowers) + ' 朵</b></div>' +
      '</div>' +
      '<button class="btn block lg ghost" data-act="open" data-sheet="backup">备份我的数据</button>');
  }

  function handleOpen(name) {
    switch (name) {
      case 'adjust': sheetParentAdjust(); break;
      case 'categories': sheetCategories(); break;
      case 'diffs': sheetDiffs(); break;
      case 'pin': openPinSettings(); break;
      case 'settings': sheetSettings(); break;
      case 'profiles': sheetProfiles(); break;
      case 'backup': sheetBackup(); break;
    }
  }

  /* ================= 初始化 ================= */
  /* 原生壳：iCloud 快照合并入口（由 ViewController 调用） */
  window.MMCloudRestore = function (text) {
    try {
      S.restore(text, 'merge');
      applyTheme(); applyBrand(); applyHeader(); renderView(current);
    } catch (e) { console.warn('云端数据合并失败', e); }
  };

  /* 存储写满：不再静默失败——弹横幅 + 引导导出备份 */
  var quotaWarned = false;
  MM.onStorageError = function () {
    if (quotaWarned) return;
    quotaWarned = true;
    toast('存储空间已满，改动无法保存');
    var el = document.createElement('div');
    el.id = 'quotaBanner';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:120;background:#FFE9E9;color:#B3261E;' +
      'padding:10px 14px;font-size:13px;text-align:center;border-top:1px solid #F3C6C2';
    el.textContent = '⚠️ 存储空间已满，新的打卡/兑换不会被保存。请先导出备份，再删除一些奖励照片。';
    document.body.appendChild(el);
  };
  MM.onStorageRecovered = function () {
    quotaWarned = false;
    var el = document.getElementById('quotaBanner');
    if (el) el.remove();
    toast('存储已恢复正常');
  };

  applyTheme();
  applyBrand();
  applyHeader();
  renderView('today');

  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ESC / iPad 键盘退出：关闭当前弹层 */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#modalRoot').hidden) { closeSheet(); e.preventDefault(); }
  });

  /* 切后台 / 上滑关闭前，把防抖队列里的改动立刻落盘 */
  function flushNow() { if (S.flush) S.flush(); }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushNow();
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', flushNow);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      if (!reg) return;
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          // 已有旧 SW 时才提示，避免首次安装误报
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('已装好新版本，重新打开后生效');
          }
        });
      });
    }).catch(function () {});
  }
})();
