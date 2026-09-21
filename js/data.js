/* 咩咩学 · 预设数据：主题、头像、分类、难度、奖励、勋章 */

window.MM = window.MM || {};

/* ---- 主题 ---- */
MM.THEMES = [
  { id:'sky',    name:'天空蓝', emoji:'☁️', accent:'#3F97E3' },
  { id:'mint',   name:'薄荷绿', emoji:'🌿', accent:'#34B98A' },
  { id:'grape',  name:'甜梦紫', emoji:'🍇', accent:'#8B72D9' },
  { id:'sunset', name:'暖阳橙', emoji:'🌇', accent:'#F2854C' },
  { id:'sakura', name:'樱花粉', emoji:'🌸', accent:'#E8617B' },
  { id:'night',  name:'夜间模式', emoji:'🌙', accent:'#6FA8DC' }
];

/* ---- 头像预设 ---- */
MM.AVATARS = ['🐑','🐰','🐱','🐯','🦊','🐼','🦁','🐨','🐸','🦄','🐧','🐵'];

/* ---- Logo 预设 ---- */
MM.LOGOS = ['🌸','🐑','⭐','🏆','📚','🎈'];

/* ---- 任务分类预设（可自定义、可删除） ---- */
MM.DEFAULT_CATEGORIES = [
  { id:'c_chinese', name:'语文', emoji:'📖' },
  { id:'c_math',    name:'数学', emoji:'🔢' },
  { id:'c_english', name:'英语', emoji:'🔤' },
  { id:'c_read',    name:'阅读', emoji:'📚' },
  { id:'c_sport',   name:'运动', emoji:'⚽' },
  { id:'c_art',     name:'才艺', emoji:'🎨' }
];

/* ---- 难度预设（含对应小红花数，可自定义、可删除） ---- */
MM.DEFAULT_DIFFS = [
  { id:'d_easy',   name:'简单', flowers:10, emoji:'🌱' },
  { id:'d_medium', name:'中等', flowers:20, emoji:'🌿' },
  { id:'d_hard',   name:'挑战', flowers:30, emoji:'🔥' }
];

/* ---- 奖励预设 ---- */
MM.DEFAULT_REWARDS = [
  { id:'r_icecream', name:'冰淇淋一个',   emoji:'🍦', price:50,   stock:-1 },
  { id:'r_cartoon',  name:'看一集动画片', emoji:'📺', price:100,  stock:-1 },
  { id:'r_story',    name:'睡前多听故事', emoji:'🌙', price:80,   stock:-1 },
  { id:'r_comic',    name:'新漫画书一本', emoji:'📚', price:300,  stock:-1 },
  { id:'r_zoo',      name:'周末去动物园', emoji:'🦁', price:500,  stock:-1 },
  { id:'r_park',     name:'游乐园一日游', emoji:'🎡', price:1000, stock:-1 }
];

/* ---- 勋章体系 ----
   type: total(累计获得花) / streak(连续打卡) / challenge(挑战难度完成数)
         redeem(兑换次数) / weekly(单周全勤) / goal(完成心愿目标)
*/
MM.BADGES = [
  { id:'b_first',  name:'第一朵花', emoji:'🌱', type:'total',     target:1,    desc:'获得第一朵小红花' },
  { id:'b_total1', name:'小花坛',   emoji:'🌷', type:'total',     target:100,  desc:'累计获得 100 朵小红花' },
  { id:'b_total2', name:'花开满园', emoji:'🌺', type:'total',     target:500,  desc:'累计获得 500 朵小红花' },
  { id:'b_total3', name:'花团锦簇', emoji:'🏵️', type:'total',     target:2000, desc:'累计获得 2000 朵小红花' },
  { id:'b_s3',     name:'三日之约', emoji:'✨', type:'streak',    target:3,    desc:'连续打卡 3 天' },
  { id:'b_s7',     name:'一周不断', emoji:'🔥', type:'streak',    target:7,    desc:'连续打卡 7 天' },
  { id:'b_s21',    name:'廿一习惯', emoji:'💪', type:'streak',    target:21,   desc:'连续打卡 21 天' },
  { id:'b_s100',   name:'百日坚持', emoji:'👑', type:'streak',    target:100,  desc:'连续打卡 100 天' },
  { id:'b_chal',   name:'勇敢挑战', emoji:'🚀', type:'challenge', target:10,   desc:'完成 10 个「挑战」难度任务' },
  { id:'b_week',   name:'全勤周冠军',emoji:'🏆', type:'weekly',   target:1,    desc:'有一周计划全部完成' },
  { id:'b_redeem', name:'兑换达人', emoji:'🎁', type:'redeem',    target:5,    desc:'成功兑换 5 次奖励' },
  { id:'b_goal',   name:'心愿达成', emoji:'💖', type:'goal',      target:1,    desc:'完成 1 个心愿目标' }
];

/* ---- 家长手动加/减花的常用理由 ---- */
MM.REASONS = {
  plus: ['主动帮忙做家务','学习态度认真','照顾弟弟妹妹','坚持运动','考试有进步','乐于助人','按时起床'],
  minus:['未完成计划就玩','撒谎隐瞒','乱发脾气','损坏物品','沉迷电子产品','拖延作业']
};

/* ---- 工具 ---- */
MM.uid = function (prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
};

MM.flowerSVG = function (size, color) {
  size = size || 16;
  color = color || 'currentColor';
  var cacheKey = size + '|' + color;
  if (MM._svgCache && MM._svgCache[cacheKey]) return MM._svgCache[cacheKey];
  var svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 20 20" fill="none">' +
    '<g fill="' + color + '">' +
    '<circle cx="10" cy="5" r="3.1"/><circle cx="15.2" cy="8.4" r="3.1"/>' +
    '<circle cx="12.9" cy="15" r="3.1"/><circle cx="7.1" cy="15" r="3.1"/>' +
    '<circle cx="4.8" cy="8.4" r="3.1"/></g>' +
    '<circle cx="10" cy="10" r="3.2" fill="#FFD451"/></svg>';
  MM._svgCache = MM._svgCache || {};
  MM._svgCache[cacheKey] = svg;
  return svg;
};

MM.todayKey = function () { return MM.dateKey(new Date()); };

MM.dateKey = function (d) {
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
};

MM.parseKey = function (k) {
  var p = String(k).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
};

MM.dateLabel = function (k) {
  var d = MM.parseKey(k);
  var w = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + w[d.getDay()];
};

MM.shortDate = function (k) {
  var d = MM.parseKey(k);
  return (d.getMonth() + 1) + '/' + d.getDate();
};
