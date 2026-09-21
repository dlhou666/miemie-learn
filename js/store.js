/* 咩咩学 · 数据层：状态、持久化、多账户、打卡与结算 */

(function () {
  var KEY = 'miemie.state.v2';
  var S = {};
  MM.S = S;

  /* ---------- 持久化 ---------- */
  S.state = null;

  S.load = function () {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) {
      try {
        S.state = JSON.parse(raw);
        S.migrate();
        return S.state;
      } catch (e) { /* 解析失败则重建 */ }
    }
    S.state = S.seed();
    S.save();
    return S.state;
  };

  var saveTimer = null;
  S.quotaBlocked = false;   // localStorage 配额已满，写入失败
  S.save = function () {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(S.flush, 120);
  };
  /* 立即落盘：切后台 / 关闭页面前必须调用，
   * 否则防抖窗口（120ms）内的最后一次操作会随进程一起丢失。 */
  S.flush = function () {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try {
      localStorage.setItem(KEY, JSON.stringify(S.state));
      if (S.quotaBlocked) {
        S.quotaBlocked = false;
        if (MM.onStorageRecovered) MM.onStorageRecovered();
      }
    } catch (e) {
      /* 配额满 / 隐私模式：绝不能静默吞掉，必须让用户知道 */
      S.quotaBlocked = true;
      console.warn('保存失败', e);
      if (MM.onStorageError) MM.onStorageError(e);
    }
    S.pushNative();
  };

  /* 原生壳同步桥（ViewController 接收后写入 iCloud KV）。
   * ⚠️ NSUbiquitousKeyValueStore 单键硬上限 1MB：
   *    快照先剥离所有图片 dataURL，仍超 900KB 则放弃上传，
   *    避免超限写入静默失败造成「以为已同步」的假象。 */
  S.pushNative = function () {
    try {
      if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.icloud)) return;
      var lite = JSON.parse(JSON.stringify(S.state));
      if (lite.settings) lite.settings.logoImg = null;
      (lite.profiles || []).forEach(function (p) {
        p.avatarImg = null;
        (p.rewards || []).forEach(function (r) { r.img = null; });
      });
      var payload = JSON.stringify(lite);
      if (payload.length > 900 * 1024) {
        console.warn('iCloud 快照超过 900KB，已跳过本次上传');
        return;
      }
      window.webkit.messageHandlers.icloud.postMessage({ op: 'save', payload: payload });
    } catch (e) {}
  };

  S.migrate = function () {
    var st = S.state;
    if (!st) return;
    st.v = st.v || 2;
    if (!st.settings) st.settings = {};
    var s = st.settings;
    if (!s.appName) s.appName = '咩咩学';
    if (s.logo === undefined) s.logo = '🌸';
    if (!s.theme) s.theme = 'sky';
    if (s.pin === undefined) s.pin = '';
    if (s.requireApproval === undefined) s.requireApproval = false;
    if (!s.currency) s.currency = '小红花';
    if (!Array.isArray(st.profiles) || !st.profiles.length) {
      st.profiles = [S.newProfile('小咩', '🐑')];
    }
    st.profiles.forEach(function (p) { S.ensureProfile(p); });
    if (!st.activeId || !S.byId(st.activeId)) st.activeId = st.profiles[0].id;
  };

  /* ---------- 档案 ---------- */
  S.newProfile = function (name, avatar) {
    var p = {
      id: MM.uid('p'),
      name: name || '小朋友',
      avatar: avatar || '🐑',
      avatarImg: null,
      flowers: 0,
      earned: 0,
      days: {},
      templates: [],
      categories: MM.DEFAULT_CATEGORIES.map(function (c) { return { id: c.id, name: c.name, emoji: c.emoji, preset: true }; }),
      diffs: MM.DEFAULT_DIFFS.map(function (d) { return { id: d.id, name: d.name, flowers: d.flowers, emoji: d.emoji, preset: true }; }),
      rewards: MM.DEFAULT_REWARDS.map(function (r) { return { id: r.id, name: r.name, emoji: r.emoji, price: r.price, stock: r.stock, preset: true }; }),
      goals: [],
      badges: {},
      honoredWeeks: [],
      honors: [],
      log: [],
      metrics: { challengeDone: 0, redeemCount: 0, goalDone: 0, bestStreak: 0 }
    };
    return p;
  };

  S.ensureProfile = function (p) {
    if (!p.days) p.days = {};
    if (!p.templates) p.templates = [];
    if (!p.categories) p.categories = [];
    if (!p.diffs) p.diffs = [];
    if (!p.rewards) p.rewards = [];
    if (!p.goals) p.goals = [];
    if (!p.badges) p.badges = {};
    if (!p.honoredWeeks) p.honoredWeeks = [];
    if (!p.honors) p.honors = [];
    if (!p.log) p.log = [];
    if (!p.metrics) p.metrics = { challengeDone: 0, redeemCount: 0, goalDone: 0, bestStreak: 0 };
    /* 兜底预设与 newProfile 保持同构：带 preset 标记，避免「预设」角标显示不一致 */
    if (!p.categories.length) p.categories = MM.DEFAULT_CATEGORIES.map(function (c) { return { id: c.id, name: c.name, emoji: c.emoji, preset: true }; });
    if (!p.diffs.length) p.diffs = MM.DEFAULT_DIFFS.map(function (d) { return { id: d.id, name: d.name, flowers: d.flowers, emoji: d.emoji, preset: true }; });
    if (!p.rewards.length) p.rewards = MM.DEFAULT_REWARDS.map(function (r) { return { id: r.id, name: r.name, emoji: r.emoji, price: r.price, stock: r.stock, preset: true }; });
  };

  S.p = function () {
    S.load0();
    return S.byId(S.state.activeId) || S.state.profiles[0];
  };
  S.load0 = function () { if (!S.state) S.load(); };

  S.byId = function (id) {
    S.load0();
    for (var i = 0; i < S.state.profiles.length; i++) {
      if (S.state.profiles[i].id === id) return S.state.profiles[i];
    }
    return null;
  };

  S.addProfile = function (name, avatar) {
    var p = S.newProfile(name, avatar);
    S.load0();
    S.state.profiles.push(p);
    S.state.activeId = p.id;
    S.save();
    return p;
  };

  S.switchProfile = function (id) {
    if (!S.byId(id)) return;
    S.state.activeId = id;
    S.save();
  };

  S.removeProfile = function (id) {
    S.load0();
    if (S.state.profiles.length <= 1) return false;
    S.state.profiles = S.state.profiles.filter(function (p) { return p.id !== id; });
    if (S.state.activeId === id) S.state.activeId = S.state.profiles[0].id;
    S.save();
    return true;
  };

  /* ---------- 任务（按天） ---------- */
  S.dayTasks = function (key) {
    var p = S.p();
    if (!p.days[key]) p.days[key] = [];
    return p.days[key];
  };

  S.addTask = function (key, data) {
    var list = S.dayTasks(key);
    var t = {
      id: MM.uid('t'),
      name: data.name,
      cat: data.cat,
      diffId: data.diffId,
      flowers: data.flowers,
      count: data.count || 1,
      unit: data.unit || '',
      note: data.note || '',
      done: false,
      pending: false,
      ts: 0
    };
    list.push(t);
    // 同步到常用任务库，便于下次快速排计划
    var p = S.p();
    var exist = p.templates.some(function (x) { return x.name === t.name && x.count === t.count; });
    if (!exist) p.templates.push({ id: MM.uid('tm'), name: t.name, cat: t.cat, diffId: t.diffId, flowers: t.flowers, count: t.count, unit: t.unit });
    S.save();
    return t;
  };

  S.updateTask = function (key, id, patch) {
    var list = S.dayTasks(key);
    var t = list.filter(function (x) { return x.id === id; })[0];
    if (!t) return null;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    S.save();
    return t;
  };

  S.removeTask = function (key, id) {
    var p = S.p();
    p.days[key] = (p.days[key] || []).filter(function (x) { return x.id !== id; });
    S.save();
  };

  S.copyDay = function (fromKey, toKey) {
    var p = S.p();
    var src = p.days[fromKey] || [];
    src.forEach(function (t) {
      S.dayTasks(toKey).push({
        id: MM.uid('t'), name: t.name, cat: t.cat, diffId: t.diffId, flowers: t.flowers,
        count: t.count, unit: t.unit, note: '', done: false, pending: false, ts: 0
      });
    });
    S.save();
    return src.length;
  };

  S.clearDay = function (key) {
    var p = S.p();
    delete p.days[key];
    S.save();
  };

  /* 打卡：立即发放或进入待家长确认 */
  S.checkin = function (key, id) {
    var p = S.p();
    var list = S.dayTasks(key);
    var t = list.filter(function (x) { return x.id === id; })[0];
    if (!t || t.done) return false;
    if (S.state.settings.requireApproval) {
      t.pending = true;
      S.save();
      return 'pending';
    }
    return S.approve(key, id);
  };

  S.approve = function (key, id) {
    var p = S.p();
    var list = S.dayTasks(key);
    var t = list.filter(function (x) { return x.id === id; })[0];
    if (!t || t.done) return false;
    t.done = true; t.pending = false; t.ts = Date.now();
    S.grant(t.flowers, t.name, 'checkin', key);
    // 标记本次计入过「挑战数」，撤销时对称回退，堵住反复打卡/撤销刷勋章的口子
    if (t.flowers >= S.maxDiffFlowers()) {
      p.metrics.challengeDone++;
      t.countedChallenge = true;
    }
    S.afterChange(key);
    S.save();
    return true;
  };

  S.uncheck = function (key, id) {
    var p = S.p();
    var list = S.dayTasks(key);
    var t = list.filter(function (x) { return x.id === id; })[0];
    if (!t || !t.done) return false;
    t.done = false; t.pending = false;
    p.flowers -= t.flowers;
    p.earned -= t.flowers;
    if (t.countedChallenge) {
      p.metrics.challengeDone = Math.max(0, p.metrics.challengeDone - 1);
      t.countedChallenge = false;
    }
    p.log.push({ id: MM.uid('l'), date: key, amount: -t.flowers, reason: '撤销打卡：' + t.name, kind: 'undo' });
    S.save();
    return true;
  };

  /* ---------- 小红花账本 ---------- */
  S.grant = function (amount, reason, kind, key) {
    var p = S.p();
    amount = +amount || 0;
    p.flowers += amount;
    if (amount > 0) p.earned += amount;
    p.log.push({ id: MM.uid('l'), date: key || MM.todayKey(), amount: amount, reason: reason, kind: kind || 'parent' });
    if (p.log.length > 400) p.log = p.log.slice(-400);
    return p.flowers;
  };

  S.maxDiffFlowers = function () {
    var p = S.p();
    return p.diffs.reduce(function (m, d) { return Math.max(m, d.flowers || 0); }, 0);
  };

  /* ---------- 商城 ---------- */
  S.redeem = function (rewardId) {
    var p = S.p();
    var r = p.rewards.filter(function (x) { return x.id === rewardId; })[0];
    if (!r) return { ok: false, msg: '奖励不存在' };
    if (p.flowers < r.price) {
      var gap = r.price - p.flowers;
      return { ok: false, msg: '还差 ' + gap + ' 朵小红花' };
    }
    if (r.stock === 0) return { ok: false, msg: '这件奖励已经没有啦' };
    p.flowers -= r.price;
    if (r.stock > 0) r.stock -= 1;
    p.metrics.redeemCount++;
    p.log.push({ id: MM.uid('l'), date: MM.todayKey(), amount: -r.price, reason: '兑换：' + r.name, kind: 'redeem' });
    S.addHonor('redeem', '🎁', '兑换成功', '用 ' + r.price + ' 朵小红花兑换了「' + r.name + '」');
    if (p.goals.indexOf(rewardId) > -1) {
      p.metrics.goalDone++;
      p.goals = p.goals.filter(function (g) { return g !== rewardId; });
      S.addHonor('goal', '💖', '心愿达成', '完成了心愿目标「' + r.name + '」');
    }
    S.afterChange(MM.todayKey());
    S.save();
    return { ok: true, name: r.name };
  };

  S.reorderReward = function (id, dir) {
    var p = S.p();
    var i = p.rewards.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    var j = dir < 0 ? i - 1 : i + 1;
    if (j < 0 || j >= p.rewards.length) return;
    var tmp = p.rewards[i];
    p.rewards[i] = p.rewards[j];
    p.rewards[j] = tmp;
    S.save();
  };

  S.toggleGoal = function (id) {
    var p = S.p();
    var i = p.goals.indexOf(id);
    if (i > -1) { p.goals.splice(i, 1); S.save(); return 'removed'; }
    if (p.goals.length >= 3) return 'full';
    p.goals.push(id);
    S.save();
    return 'added';
  };

  /* ---------- 自定义：分类 / 难度 / 奖励 ---------- */
  S.addCategory = function (name, emoji) {
    var p = S.p();
    var c = { id: MM.uid('c'), name: name, emoji: emoji || '⭐' };
    p.categories.push(c); S.save(); return c;
  };
  S.removeCategory = function (id) {
    var p = S.p();
    if (p.categories.length <= 1) return false;
    p.categories = p.categories.filter(function (c) { return c.id !== id; });
    S.save(); return true;
  };
  S.addDiff = function (name, flowers, emoji) {
    var p = S.p();
    var d = { id: MM.uid('d'), name: name, flowers: +flowers || 10, emoji: emoji || '🌱' };
    p.diffs.push(d); S.save(); return d;
  };
  S.updateDiff = function (id, patch) {
    var p = S.p();
    var d = p.diffs.filter(function (x) { return x.id === id; })[0];
    if (d) { Object.keys(patch).forEach(function (k) { d[k] = patch[k]; }); S.save(); }
    return d;
  };
  S.removeDiff = function (id) {
    var p = S.p();
    if (p.diffs.length <= 1) return false;
    p.diffs = p.diffs.filter(function (d) { return d.id !== id; });
    S.save(); return true;
  };
  S.addReward = function (data) {
    var p = S.p();
    var r = { id: MM.uid('r'), name: data.name, emoji: data.emoji || '🎁', price: +data.price || 100, stock: data.stock === undefined ? -1 : +data.stock, img: data.img || null };
    p.rewards.push(r); S.save(); return r;
  };
  S.updateReward = function (id, patch) {
    var p = S.p();
    var r = p.rewards.filter(function (x) { return x.id === id; })[0];
    if (r) { Object.keys(patch).forEach(function (k) { r[k] = patch[k]; }); S.save(); }
    return r;
  };
  S.removeReward = function (id) {
    var p = S.p();
    p.rewards = p.rewards.filter(function (r) { return r.id !== id; });
    p.goals = p.goals.filter(function (g) { return g !== id; });
    S.save();
  };

  /* ---------- 荣誉 / 勋章 ---------- */
  S.addHonor = function (type, emoji, title, detail) {
    var p = S.p();
    p.honors.unshift({ id: MM.uid('h'), type: type, emoji: emoji, title: title, detail: detail, date: MM.todayKey() });
    if (p.honors.length > 200) p.honors = p.honors.slice(0, 200);
  };

  S.streak = function () {
    var p = S.p();
    var d = new Date();
    var n = 0;
    // 今天没完成时不算断签，从昨天开始回溯
    if (!p.days[MM.dateKey(d)] || !p.days[MM.dateKey(d)].some(function (t) { return t.done; })) {
      d.setDate(d.getDate() - 1);
    }
    for (var i = 0; i < 400; i++) {
      var k = MM.dateKey(d);
      var list = p.days[k] || [];
      var anyDone = list.some(function (t) { return t.done; });
      if (anyDone) { n++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  };

  S.weekKey = function (k) {
    var d = MM.parseKey(k);
    var day = (d.getDay() + 6) % 7;            // 周一为起点
    d.setDate(d.getDate() - day + 3);          // 取周四判定归属周
    var first = new Date(d.getFullYear(), 0, 4);
    var diff = d - first;
    var week = 1 + Math.round(((diff / 86400000) - 3 + ((first.getDay() + 6) % 7)) / 7);
    return d.getFullYear() + '-W' + week;
  };

  /* 单周全勤统计：返回 { count, newWeeks } */
  S.weeklyPerfect = function () {
    var p = S.p();
    var groups = {};
    Object.keys(p.days).forEach(function (k) {
      var list = p.days[k];
      if (!list.length) return;
      var wk = S.weekKey(k);
      if (!groups[wk]) groups[wk] = { total: 0, done: 0 };
      groups[wk].total += list.length;
      groups[wk].done += list.filter(function (t) { return t.done; }).length;
    });
    var perfect = Object.keys(groups).filter(function (wk) { return groups[wk].total > 0 && groups[wk].done === groups[wk].total; });
    var fresh = perfect.filter(function (wk) { return p.honoredWeeks.indexOf(wk) < 0; });
    return { count: perfect.length, newWeeks: fresh };
  };

  S.badgeProgress = function (b) {
    var p = S.p();
    var cur = 0;
    if (b.type === 'total') cur = p.earned;
    else if (b.type === 'streak') cur = S.streak();
    else if (b.type === 'challenge') cur = p.metrics.challengeDone;
    else if (b.type === 'redeem') cur = p.metrics.redeemCount;
    else if (b.type === 'weekly') cur = S.weeklyPerfect().count;
    else if (b.type === 'goal') cur = p.metrics.goalDone;
    return Math.min(cur, b.target);
  };

  /* 结算：解锁勋章 + 新的全勤周荣誉 */
  S.afterChange = function (key) {
    var p = S.p();
    var unlocked = [];
    MM.BADGES.forEach(function (b) {
      if (p.badges[b.id]) return;
      if (S.badgeProgress(b) >= b.target) {
        p.badges[b.id] = MM.todayKey();
        S.addHonor('badge', b.emoji, '解锁勋章 · ' + b.name, b.desc);
        unlocked.push(b);
      }
    });
    var wp = S.weeklyPerfect();
    wp.newWeeks.forEach(function (wk) {
      p.honoredWeeks.push(wk);
      S.addHonor('weekly', '🏆', '全勤周冠军', wk + ' 当周计划全部完成');
    });
    var st = S.streak();
    if (st > p.metrics.bestStreak) p.metrics.bestStreak = st;
    return unlocked;
  };

  /* ---------- 统计 ---------- */
  S.weekStats = function () {
    var p = S.p();
    var d = new Date();
    var day = (d.getDay() + 6) % 7;
    var monday = new Date(d); monday.setDate(d.getDate() - day);
    var target = 0, done = 0, flowers = 0;
    for (var i = 0; i < 7; i++) {
      var k = MM.dateKey(monday);
      var list = p.days[k] || [];
      list.forEach(function (t) {
        target += t.flowers;
        if (t.done) { done += t.flowers; }
      });
      monday.setDate(monday.getDate() + 1);
    }
    /* target 为 0 表示本周没排计划——如实返回 0，由界面走空态文案，
     * 不再伪造 280 朵的默认目标误导新用户。 */
    return { target: target, done: done, flowers: done };
  };

  /* ---------- 备份与恢复 ---------- */
  /* 导出的备份不含家长密码（明文外泄风险）；
   * 导入时若备份里没有密码，保留本机已设置的密码。 */
  S.serialize = function () {
    var clone = JSON.parse(JSON.stringify(S.state));
    if (clone.settings) clone.settings.pin = '';
    return JSON.stringify(clone, null, 2);
  };

  /* 同名档案合并：days 按任务 id 求并集（不再按日期整段覆盖，避免丢任务），
   * 荣誉/勋章/常用任务取并集，累计类计数取较大值。 */
  S.mergeProfile = function (old, p) {
    old.flowers = Math.max(old.flowers, p.flowers);
    old.earned = Math.max(old.earned, p.earned);
    Object.keys(p.days || {}).forEach(function (k) {
      var remote = p.days[k] || [];
      var local = old.days[k] = old.days[k] || [];
      var byId = {};
      local.forEach(function (t) { byId[t.id] = true; });
      remote.forEach(function (t) { if (!byId[t.id]) local.push(t); });
    });
    var hIds = {};
    old.honors.forEach(function (h) { hIds[h.id] = true; });
    (p.honors || []).forEach(function (h) { if (!hIds[h.id]) { old.honors.push(h); hIds[h.id] = true; } });
    Object.keys(p.badges || {}).forEach(function (b) { old.badges[b] = old.badges[b] || p.badges[b]; });
    old.metrics = old.metrics || { challengeDone: 0, redeemCount: 0, goalDone: 0, bestStreak: 0 };
    ['challengeDone', 'redeemCount', 'goalDone', 'bestStreak'].forEach(function (k) {
      old.metrics[k] = Math.max(old.metrics[k] || 0, (p.metrics || {})[k] || 0);
    });
    var wIds = {};
    old.honoredWeeks.forEach(function (w) { wIds[w] = true; });
    (p.honoredWeeks || []).forEach(function (w) { if (!wIds[w]) { old.honoredWeeks.push(w); wIds[w] = true; } });
    var tIds = {};
    old.templates.forEach(function (t) { tIds[t.id] = true; });
    (p.templates || []).forEach(function (t) { if (!tIds[t.id]) { old.templates.push(t); tIds[t.id] = true; } });
  };

  S.restore = function (text, mode) {
    var obj = JSON.parse(text);
    if (!obj || !obj.profiles) throw new Error('文件格式不正确');
    var prevPin = S.state && S.state.settings ? (S.state.settings.pin || '') : '';
    if (mode === 'replace') {
      S.state = obj;
    } else {
      var names = {};
      S.state.profiles.forEach(function (p) { names[p.name] = p; });
      obj.profiles.forEach(function (p) {
        var old = names[p.name];
        if (old) S.mergeProfile(old, p);
        else {
          S.ensureProfile(p);
          S.state.profiles.push(p);
        }
      });
    }
    S.migrate();
    /* 备份不含 PIN：不要让导入把本机已设密码清空 */
    if (S.state.settings && !S.state.settings.pin && prevPin) S.state.settings.pin = prevPin;
    S.save();
    return true;
  };

  /* ---------- 初始示例数据 ---------- */
  S.seed = function () {
    var st = {
      v: 2,
      settings: { appName: '咩咩学', logo: '🌸', logoImg: null, theme: 'sky', pin: '', requireApproval: false, currency: '小红花' },
      profiles: [],
      activeId: null
    };
    var p = S.newProfile('小咩', '🐑');
    p.flowers = 320; p.earned = 420;

    // 近三天已完成，制造连续打卡
    var base = new Date();
    for (var i = 3; i >= 1; i--) {
      var d = new Date(base); d.setDate(base.getDate() - i);
      var k = MM.dateKey(d);
      p.days[k] = [
        { id: MM.uid('t'), name: '口算练习', cat: 'c_math', diffId: 'd_easy', flowers: 10, count: 50, unit: '题', note: '', done: true, pending: false, ts: d.getTime() },
        { id: MM.uid('t'), name: '读课外书', cat: 'c_read', diffId: 'd_medium', flowers: 20, count: 30, unit: '分钟', note: '', done: true, pending: false, ts: d.getTime() }
      ];
      p.log.push({ id: MM.uid('l'), date: k, amount: 10, reason: '口算练习', kind: 'checkin' });
      p.log.push({ id: MM.uid('l'), date: k, amount: 20, reason: '读课外书', kind: 'checkin' });
    }

    // 今日待办
    var today = MM.todayKey();
    p.days[today] = [
      { id: MM.uid('t'), name: '数学口算', cat: 'c_math', diffId: 'd_easy', flowers: 10, count: 50, unit: '题', note: '', done: true, pending: false, ts: Date.now() },
      { id: MM.uid('t'), name: '背诵英语单词', cat: 'c_english', diffId: 'd_medium', flowers: 20, count: 20, unit: '个', note: '', done: false, pending: false, ts: 0 },
      { id: MM.uid('t'), name: '阅读《城南旧事》', cat: 'c_read', diffId: 'd_medium', flowers: 20, count: 30, unit: '分钟', note: '', done: false, pending: false, ts: 0 },
      { id: MM.uid('t'), name: '练习毛笔字', cat: 'c_art', diffId: 'd_hard', flowers: 30, count: 1, unit: '页', note: '', done: false, pending: false, ts: 0 }
    ];
    p.templates = [
      { id: MM.uid('tm'), name: '数学口算', cat: 'c_math', diffId: 'd_easy', flowers: 10, count: 50, unit: '题' },
      { id: MM.uid('tm'), name: '背诵英语单词', cat: 'c_english', diffId: 'd_medium', flowers: 20, count: 20, unit: '个' },
      { id: MM.uid('tm'), name: '阅读《城南旧事》', cat: 'c_read', diffId: 'd_medium', flowers: 20, count: 30, unit: '分钟' }
    ];
    p.log.push({ id: MM.uid('l'), date: today, amount: 10, reason: '数学口算', kind: 'checkin' });
    p.metrics.bestStreak = 3;

    st.profiles.push(p);
    st.activeId = p.id;
    return st;
  };
})();
