#!/usr/bin/env node
/* ============================================================
 * gh-api-push.js —— 当 git push 走不通时，改用 GitHub API 提交
 * ------------------------------------------------------------
 * 适用场景：本机访问 github.com 被代理拦截（CONNECT tunnel failed 502），
 *          但 api.github.com 可以直连。
 *
 * 用法：
 *   node tools/gh-api-push.js <token> <owner> <repo>
 *   例：node tools/gh-api-push.js ghp_xxx dlhou666 miemie-learn
 *
 * 前提：
 *   1. 当前目录是一个 git 仓库，且改动已 `git add` 进索引
 *      （脚本读取的是 git 对象库，不是工作区文件）
 *   2. Node 14+
 *   3. 令牌需含 repo 权限；要提交 .github/workflows/ 还需 workflow 权限
 *
 * 原理：
 *   git ls-files -s  →  取索引清单
 *   git cat-file blob → 取内容（已是 .gitattributes 规范化后的 LF）
 *   POST /git/blobs → POST /git/trees → POST /git/commits → PATCH ref
 * ============================================================ */
const https = require('https');
const { spawnSync } = require('child_process');

const TOKEN = process.argv[2];
const OWNER = process.argv[3];
const REPO = process.argv[4];

if (!TOKEN || !OWNER || !REPO) {
  console.log('用法: node tools/gh-api-push.js <token> <owner> <repo>');
  process.exit(1);
}

const UA = {
  'Authorization': 'token ' + TOKEN,
  'User-Agent': 'gh-api-push',
  'Accept': 'application/vnd.github+json',
  'Content-Type': 'application/json'
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function raw(method, path, body) {
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname: 'api.github.com', path, method, headers: UA };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request(opts, res => {
      let buf = ''; res.on('data', d => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', e => resolve({ status: 0, body: 'ERR ' + e.message }));
    if (data) req.write(data);
    req.end();
  });
}

// 代理会间歇返回 HTML 错误页，非 JSON 一律退避重试
async function api(method, path, body, tries) {
  tries = tries || 4;
  let last = '';
  for (let i = 0; i < tries; i++) {
    const res = await raw(method, path, body);
    let j = null;
    try { j = JSON.parse(res.body); } catch (e) {}
    if (j !== null) return { status: res.status, body: res.body, json: j };
    last = (res.body || '').slice(0, 100).replace(/\s+/g, ' ');
    await sleep(800 * Math.pow(2, i));
  }
  return { status: 0, body: 'NON_JSON: ' + last, json: null };
}

const git = args => spawnSync('git', args, { maxBuffer: 1024 * 1024 * 200 });

(async () => {
  let r = await api('GET', `/repos/${OWNER}/${REPO}`);
  if (!r.json || !r.json.full_name) { console.log('✗ 仓库不可读: ' + r.body.slice(0, 200)); return; }
  console.log('[1] 仓库 ' + r.json.full_name + ' 默认分支=' + r.json.default_branch);

  // 空仓库的 blobs API 会 409，先用 Contents API 播种
  let baseSha = null;
  r = await api('GET', `/repos/${OWNER}/${REPO}/git/refs/heads/main`);
  if (r.json && r.json.object && r.json.object.sha) {
    baseSha = r.json.object.sha;
    console.log('[2] 基线提交 ' + baseSha.slice(0, 7));
  } else {
    const seed = await api('PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, {
      message: 'chore: 初始化仓库',
      content: Buffer.from('# ' + REPO + '\n').toString('base64'),
      branch: 'main'
    });
    if (seed.json && seed.json.commit) {
      baseSha = seed.json.commit.sha;
      console.log('[2] 已播种初始提交 ' + baseSha.slice(0, 7));
    } else { console.log('✗ 播种失败: ' + seed.body.slice(0, 200)); return; }
  }

  // 关 quotepath，否则中文文件名会被转义成八进制
  const lsOut = git(['-c', 'core.quotepath=false', 'ls-files', '-s']).stdout.toString('utf8');
  const all = lsOut.split('\n').filter(Boolean).map(line => {
    const t = line.indexOf('\t');
    const meta = line.slice(0, t), path = line.slice(t + 1);
    const p = meta.split(' ');
    return { mode: p[0], sha: p[1], path };
  });
  // 无 workflow 权限时 .github/workflows/* 会被 404 拒绝
  const skipped = all.filter(f => f.path.startsWith('.github/workflows/'));
  const files = all.filter(f => !f.path.startsWith('.github/workflows/'));
  console.log('[3] 待提交 ' + files.length + ' 个' + (skipped.length ? '（跳过 workflow ' + skipped.length + ' 个：令牌无 workflow 权限）' : ''));

  const tree = [];
  let failed = 0;
  const CONC = 5;
  for (let i = 0; i < files.length; i += CONC) {
    const batch = files.slice(i, i + CONC);
    const results = await Promise.all(batch.map(async f => {
      const blob = git(['cat-file', 'blob', f.sha]).stdout;
      if (!blob || !blob.length) return { f, ok: false, err: 'empty' };
      const res = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
        content: blob.toString('base64'), encoding: 'base64'
      }, 3);
      return (res.json && res.json.sha) ? { f, ok: true, sha: res.json.sha } : { f, ok: false, err: res.status + ' ' + res.body.slice(0, 70) };
    }));
    for (const x of results) {
      if (x.ok) tree.push({ path: x.f.path, mode: x.f.mode, type: 'blob', sha: x.sha });
      else { failed++; console.log('  ! ' + x.f.path + ' → ' + x.err); }
    }
    process.stdout.write('  上传 ' + tree.length + '/' + files.length + '\r');
  }
  console.log('[4] blob 成功=' + tree.length + ' 失败=' + failed);
  if (failed) { console.log('✗ 有文件未上传，中止'); return; }

  r = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree });
  if (!r.json || !r.json.sha) { console.log('✗ 建 tree 失败: ' + r.body.slice(0, 200)); return; }
  const treeSha = r.json.sha;

  r = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: 'chore: 通过 API 更新',
    tree: treeSha,
    parents: [baseSha]
  });
  if (!r.json || !r.json.sha) { console.log('✗ 建 commit 失败: ' + r.body.slice(0, 200)); return; }
  console.log('[5] commit=' + r.json.sha.slice(0, 7));

  r = await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: r.json.sha, force: true });
  console.log(r.status === 200 ? '[6] main 已更新' : '✗ 更新 main 失败 ' + r.status);
  console.log('\n✓ 完成 https://github.com/' + OWNER + '/' + REPO);
})().catch(e => console.log('ERR=' + e.message));
