#!/usr/bin/env node
/* ============================================================
 * gh-api-push.js —— 当 git push 走不通时，改用 GitHub API 提交
 * ------------------------------------------------------------
 * 适用场景：本机访问 github.com 被代理拦截（CONNECT tunnel failed 502），
 *          但 api.github.com 可以直连。
 *
 * 用法：
 *   node tools/gh-api-push.js <token> <owner> <repo> [--prune] [--force]
 *   例：node tools/gh-api-push.js ghp_xxx dlhou666 miemie-learn
 *   令牌也可走环境变量 GH_TOKEN / GITHUB_TOKEN（更安全，不进 shell 历史）：
 *   PowerShell: $env:GH_TOKEN='ghp_xxx'; node tools/gh-api-push.js dlhou666 miemie-learn
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
 *   POST /git/blobs → POST /git/trees(带 base_tree) → POST /git/commits → PATCH ref
 *
 * ⚠️ 安全约束（曾经踩过的坑，勿改回）：
 *   - 建 tree 必须带 base_tree：不带时 GitHub 会用新 tree 整体替换仓库快照，
 *     本地索引里没有的文件（例如网页上手工建的 .github/workflows/ios-build.yml）
 *     会被静默删除。
 *   - 索引为空时必须中止：否则等于把整个仓库清空。
 *   - 默认不做 force push：远端若已前进，宁可失败也不覆盖。
 * ============================================================ */
const https = require('https');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2).filter(a => !a.startsWith('--'));
const FLAGS = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const ENV_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
/* 两种调用形式都支持：
 *   node gh-api-push.js <token> <owner> <repo>
 *   GH_TOKEN=xxx node gh-api-push.js <owner> <repo>       ← 令牌不进 shell 历史 */
const TOKEN = ENV_TOKEN && argv.length === 2 ? ENV_TOKEN : argv[0];
const OWNER = ENV_TOKEN && argv.length === 2 ? argv[0] : argv[1];
const REPO = ENV_TOKEN && argv.length === 2 ? argv[1] : argv[2];
const PRUNE = FLAGS.has('--prune');    // 删除远端独有文件（默认只保留不删）
const FORCE = FLAGS.has('--force');    // 允许非快进更新（默认拒绝）

if (!TOKEN || !OWNER || !REPO) {
  console.log('用法: node tools/gh-api-push.js <token> <owner> <repo> [--prune] [--force]');
  console.log('   或: GH_TOKEN=xxx node tools/gh-api-push.js <owner> <repo>');
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

// 令牌缺 workflow 权限时，workflow 文件的建 blob 会被拒绝；
// 只有确认是权限问题才跳过，其它错误一律算失败，避免静默漏文件。
function isWorkflowScopeError(res) {
  if (res.status !== 403 && res.status !== 404 && res.status !== 422) return false;
  return /workflow/i.test(res.body || '');
}

(async () => {
  let r = await api('GET', `/repos/${OWNER}/${REPO}`);
  if (!r.json || !r.json.full_name) { console.log('✗ 仓库不可读: ' + r.body.slice(0, 200)); return; }
  const BRANCH = r.json.default_branch || 'main';
  console.log('[1] 仓库 ' + r.json.full_name + ' 默认分支=' + BRANCH);

  // 空仓库的 blobs API 会 409，先用 Contents API 播种
  let baseSha = null;
  r = await api('GET', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
  if (r.json && r.json.object && r.json.object.sha) {
    baseSha = r.json.object.sha;
    console.log('[2] 基线提交 ' + baseSha.slice(0, 7));
  } else {
    const seed = await api('PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, {
      message: 'chore: 初始化仓库',
      content: Buffer.from('# ' + REPO + '\n').toString('base64'),
      branch: BRANCH
    });
    if (seed.json && seed.json.commit) {
      baseSha = seed.json.commit.sha;
      console.log('[2] 已播种初始提交 ' + baseSha.slice(0, 7));
    } else { console.log('✗ 播种失败: ' + seed.body.slice(0, 200)); return; }
  }

  // 取基线 tree：新 tree 以它为 base_tree，未列出的文件原样保留
  let baseTree = null, remotePaths = null;
  r = await api('GET', `/repos/${OWNER}/${REPO}/git/commits/${baseSha}`);
  if (r.json && r.json.tree && r.json.tree.sha) {
    baseTree = r.json.tree.sha;
  } else {
    console.log('✗ 读不到基线 tree: ' + r.body.slice(0, 200));
    return;
  }
  r = await api('GET', `/repos/${OWNER}/${REPO}/git/trees/${baseTree}?recursive=1`);
  if (r.json && Array.isArray(r.json.tree)) {
    remotePaths = new Set(r.json.tree.filter(x => x.type === 'blob').map(x => x.path));
    console.log('[3] 基线 tree=' + baseTree.slice(0, 7) + ' 远端文件 ' + remotePaths.size + ' 个');
  }

  // 关 quotepath，否则中文文件名会被转义成八进制
  const lsOut = git(['-c', 'core.quotepath=false', 'ls-files', '-s']).stdout.toString('utf8');
  const files = lsOut.split('\n').filter(Boolean).map(line => {
    const t = line.indexOf('\t');
    const meta = line.slice(0, t), path = line.slice(t + 1);
    const p = meta.split(' ');
    return { mode: p[0], sha: p[1], path };
  });

  // 索引为空 = 会把仓库推成空的，这是事故不是正常操作
  if (!files.length) {
    console.log('✗ git 索引为空（改动没 git add，或误跑在空仓库上）。');
    console.log('  继续会把远端 ' + (remotePaths ? remotePaths.size + ' 个文件' : '全部内容') + ' 清空，已中止。');
    return;
  }
  console.log('[4] 待提交 ' + files.length + ' 个');

  const tree = [];
  const skipped = [];
  let failed = 0;
  const CONC = 5;
  for (let i = 0; i < files.length; i += CONC) {
    const batch = files.slice(i, i + CONC);
    const results = await Promise.all(batch.map(async f => {
      const blob = git(['cat-file', 'blob', f.sha]).stdout;
      if (!blob || !blob.length) return { f, ok: false, res: { status: 0, body: 'empty' } };
      const res = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
        content: blob.toString('base64'), encoding: 'base64'
      }, 3);
      return (res.json && res.json.sha) ? { f, ok: true, sha: res.json.sha } : { f, ok: false, res };
    }));
    for (const x of results) {
      if (x.ok) { tree.push({ path: x.f.path, mode: x.f.mode, type: 'blob', sha: x.sha }); continue; }
      if (isWorkflowScopeError(x.res)) { skipped.push(x.f.path); continue; }
      failed++;
      console.log('  ! ' + x.f.path + ' → ' + x.res.status + ' ' + String(x.res.body).slice(0, 70));
    }
    process.stdout.write('  上传 ' + tree.length + '/' + files.length + '\r');
  }
  console.log('[5] blob 成功=' + tree.length + ' 失败=' + failed +
    (skipped.length ? ' 跳过=' + skipped.length + '（令牌无 workflow 权限：' + skipped.join(', ') + '）' : ''));
  if (failed) { console.log('✗ 有文件未上传，已中止（远端未改动）'); return; }

  // 远端独有文件：默认保留（不删），只有显式 --prune 才删除
  let onlyRemote = [];
  if (remotePaths) {
    const local = new Set(files.map(f => f.path));
    onlyRemote = [...remotePaths].filter(p => !local.has(p));
  }
  if (onlyRemote.length) {
    if (PRUNE) {
      onlyRemote.forEach(p => tree.push({ path: p, mode: '100644', type: 'blob', sha: null }));
      console.log('[6] --prune 将删除远端独有 ' + onlyRemote.length + ' 个文件');
    } else {
      console.log('[6] 远端独有 ' + onlyRemote.length + ' 个文件将原样保留（需要删除请加 --prune）：');
      onlyRemote.slice(0, 10).forEach(p => console.log('     ' + p));
      if (onlyRemote.length > 10) console.log('     … 其余 ' + (onlyRemote.length - 10) + ' 个');
    }
  }

  r = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree, base_tree: baseTree });
  if (!r.json || !r.json.sha) { console.log('✗ 建 tree 失败: ' + r.body.slice(0, 200)); return; }
  const treeSha = r.json.sha;

  r = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: 'chore: 通过 API 更新',
    tree: treeSha,
    parents: [baseSha]
  });
  if (!r.json || !r.json.sha) { console.log('✗ 建 commit 失败: ' + r.body.slice(0, 200)); return; }
  const newSha = r.json.sha;
  console.log('[7] commit=' + newSha.slice(0, 7));

  // 快进检查：远端 HEAD 若已前进，默认不覆盖（force push 会丢别人的提交）
  r = await api('GET', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
  const headSha = r.json && r.json.object ? r.json.object.sha : null;
  if (headSha && headSha !== baseSha && !FORCE) {
    console.log('✗ 远端已前进到 ' + headSha.slice(0, 7) + '，与基线 ' + baseSha.slice(0, 7) + ' 不一致。');
    console.log('  已中止，避免覆盖他人提交。确认要覆盖请加 --force。');
    return;
  }

  r = await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`,
    { sha: newSha, force: !!FORCE });
  console.log(r.status === 200
    ? '[8] ' + BRANCH + ' 已更新'
    : '✗ 更新 ' + BRANCH + ' 失败 ' + r.status + ' ' + r.body.slice(0, 120));
  console.log('\n✓ 完成 https://github.com/' + OWNER + '/' + REPO);
})().catch(e => console.log('ERR=' + e.message));
