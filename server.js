const express = require('express');
const cors = require('cors');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'meng819';

if (!GITHUB_TOKEN) {
  console.error('Missing GITHUB_TOKEN');
  process.exit(1);
}

async function gh(method, path, body) {
  const url = `https://api.github.com${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'deeplink-mcp/1.0',
    },
  };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
  return data;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', owner: GITHUB_OWNER }));

// GitHub 写文件 + 删除
app.get('/gh', async (req, res) => {
  const { path, content, message, action } = req.query;
  
  // 删除文件
  if (action === 'delete') {
    if (!path) return res.status(400).json({ error: '需要 path' });
    try {
      const dp = decodeURIComponent(path);
      const dm = decodeURIComponent(message || 'DeepSeek 删除');
      const info = await gh('GET', `/repos/${GITHUB_OWNER}/deeplink/contents/${dp}?ref=main`);
      await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/deeplink/contents/${dp}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'deeplink/1.0' },
        body: JSON.stringify({ message: dm, sha: info.sha, branch: 'main' }),
      });
      return res.json({ success: true, path: dp });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
  
  if (!path || !content) return res.status(400).json({ error: '需要 path 和 content' });
  try {
    const branch = 'main';
    const ref = await gh('GET', `/repos/${GITHUB_OWNER}/deeplink/git/ref/heads/${branch}`);
    const lc = await gh('GET', `/repos/${GITHUB_OWNER}/deeplink/git/commits/${ref.object.sha}`);
    const blob = await gh('POST', `/repos/${GITHUB_OWNER}/deeplink/git/blobs`, { content: decodeURIComponent(content), encoding: 'utf-8' });
    const nt = await gh('POST', `/repos/${GITHUB_OWNER}/deeplink/git/trees`, { base_tree: lc.tree.sha, tree: [{ path: decodeURIComponent(path), mode: '100644', type: 'blob', sha: blob.sha }] });
    const nc = await gh('POST', `/repos/${GITHUB_OWNER}/deeplink/git/commits`, { message: decodeURIComponent(message || 'DeepSeek 自动提交'), tree: nt.sha, parents: [lc.sha] });
    await gh('PATCH', `/repos/${GITHUB_OWNER}/deeplink/git/refs/heads/${branch}`, { sha: nc.sha });
    res.json({ success: true, commit: nc.sha, path: decodeURIComponent(path) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Supabase 记忆库
const SU = process.env.SUPABASE_URL || 'https://notkmhfkdhpbfnwsgcwl.supabase.co';
const SK = process.env.SUPABASE_KEY || 'sb_publishable_1nU61MBGaBcJWB6sATWaxQ_cyalHUea';

async function mGet(key) {
  const r = await fetch(`${SU}/rest/v1/memories?key=eq.${encodeURIComponent(key)}&select=value`, { headers: { apikey: SK } });
  const d = await r.json(); return d.length > 0 ? d[0].value : null;
}
async function mSet(key, value) {
  const e = await mGet(key);
  if (e !== null) {
    await fetch(`${SU}/rest/v1/memories?key=eq.${encodeURIComponent(key)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', apikey: SK, Prefer: 'return=minimal' }, body: JSON.stringify({ value, updated_at: new Date().toISOString() }) });
  } else {
    await fetch(`${SU}/rest/v1/memories`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SK, Prefer: 'return=minimal' }, body: JSON.stringify({ key, value }) });
  }
}
async function mDel(key) {
  await fetch(`${SU}/rest/v1/memories?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', headers: { apikey: SK } });
}
async function mList() {
  const r = await fetch(`${SU}/rest/v1/memories?select=key,value,updated_at&order=updated_at.desc`, { headers: { apikey: SK } });
  return r.json();
}

app.get('/memory', async (req, res) => {
  const { key, value, action, level } = req.query;
  try {
    if (action === 'list') {
      const data = await mList();
      if (req.query.all !== 'true') return res.json({ success: true, count: data.filter(d => d.key.startsWith('core_')).length, data: data.filter(d => d.key.startsWith('core_')) });
      return res.json({ success: true, count: data.length, data });
    }
    if (action === 'delete') { if (!key) return res.status(400).json({ error: '需要 key' }); await mDel(key); return res.json({ success: true }); }
    if (action === 'compress') {
      const all = await mList();
      const n = all.filter(d => d.key.startsWith('norm_'));
      if (n.length === 0) return res.json({ success: true, message: '无需压缩' });
      const s = n.map(d => `${d.key.replace('norm_','')}: ${d.value}`).join(' | ');
      for (const x of n) await mDel(x.key);
      await mSet('core_压缩摘要_' + new Date().toISOString().slice(0,10), s);
      return res.json({ success: true, compressed: n.length, summary: s });
    }
    if (action === 'cleanup') {
      const all = await mList();
      const t = all.filter(d => d.key.startsWith('temp_'));
      for (const x of t) await mDel(x.key);
      return res.json({ success: true, deleted: t.length });
    }
    if (value) {
      const p = level === 'core' ? 'core_' : level === 'norm' ? 'norm_' : level === 'temp' ? 'temp_' : '';
      const fk = p + key; await mSet(fk, value);
      return res.json({ success: true, key: fk, value, level: level || 'default' });
    }
    if (key) { const v = await mGet(key); return res.json({ success: true, key, value: v }); }
    res.status(400).json({ error: '需要 key 或 action' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

require('./xhs-route.js');
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DeepSeek running on port ${PORT}`));
