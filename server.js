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
  console.error('❌ 缺少 GITHUB_TOKEN 环境变量');
  process.exit(1);
}

// GitHub API 封装
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
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(`GitHub API: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

// 工具列表
const TOOLS = [
  {
    name: 'create_repo',
    description: '创建一个新的 GitHub 仓库',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '仓库名' },
        description: { type: 'string', description: '仓库描述' },
        is_private: { type: 'boolean', description: '是否私有', default: true },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_repos',
    description: '列出账号下所有仓库',
    inputSchema: {
      type: 'object',
      properties: {
        per_page: { type: 'number', default: 30 },
        page: { type: 'number', default: 1 },
      },
    },
  },
  {
    name: 'list_files',
    description: '查看仓库目录结构',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: '仓库名' },
        path: { type: 'string', description: '路径，默认根目录' },
        recursive: { type: 'boolean', description: '是否递归', default: false },
        branch: { type: 'string', description: '分支，默认 main' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'get_file',
    description: '读取仓库中某个文件的内容',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: '仓库名' },
        path: { type: 'string', description: '文件路径' },
        branch: { type: 'string', description: '分支，默认 main' },
      },
      required: ['repo', 'path'],
    },
  },
  {
    name: 'push_files',
    description: '批量推送文件到仓库',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: '仓库名' },
        message: { type: 'string', description: 'commit 信息' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '文件路径' },
              content: { type: 'string', description: '文件内容' },
            },
            required: ['path', 'content'],
          },
        },
        branch: { type: 'string', description: '分支，默认 main' },
      },
      required: ['repo', 'message', 'files'],
    },
  },
];

// MCP Server
const mcpServer = new Server(
  { name: 'deeplink-github', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    let result;
    switch (name) {
      case 'create_repo':
        result = await gh('POST', '/user/repos', {
          name: args.name,
          description: args.description || '',
          private: args.is_private !== false,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({
            name: result.name,
            url: result.html_url,
            private: result.private,
          }, null, 2) }],
        };

      case 'list_repos':
        result = await gh('GET', `/user/repos?per_page=${args.per_page || 30}&page=${args.page || 1}&sort=updated`);
        return {
          content: [{ type: 'text', text: JSON.stringify(
            result.map(r => ({
              name: r.name,
              private: r.private,
              url: r.html_url,
              updated: r.updated_at,
            })), null, 2
          ) }],
        };

      case 'list_files': {
        const branch = args.branch || 'main';
        const path = args.path || '';
        const recursive = args.recursive ? '&recursive=1' : '';
        result = await gh('GET', `/repos/${GITHUB_OWNER}/${args.repo}/git/trees/${branch}${recursive}`);
        return {
          content: [{ type: 'text', text: JSON.stringify(
            result.tree.filter(f => {
              if (path) return f.path.startsWith(path);
              return !f.path.includes('/');
            }).map(f => ({
              path: f.path,
              type: f.type,
              mode: f.mode,
            })), null, 2
          ) }],
        };
      }

      case 'get_file': {
        const branch = args.branch || 'main';
        result = await gh('GET', `/repos/${GITHUB_OWNER}/${args.repo}/contents/${args.path}?ref=${branch}`);
        const content = Buffer.from(result.content, 'base64').toString('utf-8');
        return {
          content: [{ type: 'text', text: content }],
        };
      }

      case 'push_files': {
        const branch = args.branch || 'main';
        // 获取最新 commit
        const ref = await gh('GET', `/repos/${GITHUB_OWNER}/${args.repo}/git/ref/heads/${branch}`);
        const latestCommit = await gh('GET', `/repos/${GITHUB_OWNER}/${args.repo}/git/commits/${ref.object.sha}`);
        
        // 为每个文件创建 blob
        const blobs = await Promise.all(args.files.map(f =>
          gh('POST', `/repos/${GITHUB_OWNER}/${args.repo}/git/blobs`, {
            content: f.content,
            encoding: 'utf-8',
          })
        ));
        
        // 创建新的 tree
        const newTree = await gh('POST', `/repos/${GITHUB_OWNER}/${args.repo}/git/trees`, {
          base_tree: latestCommit.tree.sha,
          tree: args.files.map((f, i) => ({
            path: f.path,
            mode: '100644',
            type: 'blob',
            sha: blobs[i].sha,
          })),
        });
        
        // 创建 commit
        const newCommit = await gh('POST', `/repos/${GITHUB_OWNER}/${args.repo}/git/commits`, {
          message: args.message,
          tree: newTree.sha,
          parents: [latestCommit.sha],
        });
        
        // 更新分支引用
        await gh('PATCH', `/repos/${GITHUB_OWNER}/${args.repo}/git/refs/heads/${branch}`, {
          sha: newCommit.sha,
        });
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            commit: newCommit.sha,
            files: args.files.length,
          }, null, 2) }],
        };
      }

      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `错误: ${error.message}` }],
      isError: true,
    };
  }
});

// Express 服务
const app = express();
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', owner: GITHUB_OWNER });
});

// MCP Streamable HTTP
app.all('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionId: req.headers['mcp-session-id'] || '',
  });
  await mcpServer.connect(transport);
  
  const body = req.method === 'GET' ? undefined : req.body;
  await transport.handleRequest(req, res, body);
});

// Supabase 配置（从环境变量读取）
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://notkmhfkdhpbfnwsgcwl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_1nU61MBGaBcJWB6sATWaxQ_cyalHUea';

// 记忆库操作封装
async function memoryGet(key) {
  const url = `${SUPABASE_URL}/rest/v1/memories?key=eq.${encodeURIComponent(key)}&select=value`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY } });
  const data = await res.json();
  return data.length > 0 ? data[0].value : null;
}

async function memorySet(key, value) {
  // 先检查是否存在
  const existing = await memoryGet(key);
  if (existing !== null) {
    // 更新
    const url = `${SUPABASE_URL}/rest/v1/memories?key=eq.${encodeURIComponent(key)}`;
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Prefer: 'return=minimal' },
      body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
    });
  } else {
    // 插入
    const url = `${SUPABASE_URL}/rest/v1/memories`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Prefer: 'return=minimal' },
      body: JSON.stringify({ key, value }),
    });
  }
  return true;
}

async function memoryDelete(key) {
  const url = `${SUPABASE_URL}/rest/v1/memories?key=eq.${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY },
  });
  return true;
}

async function memoryList() {
  const url = `${SUPABASE_URL}/rest/v1/memories?select=key,value,updated_at&order=updated_at.desc`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY } });
  return await res.json();
}

// 记忆库 HTTP 接口（GET，AI 通过 web_fetch 可调用）
app.get('/memory', async (req, res) => {
  const { key, value, action } = req.query;
  try {
    if (action === 'list') {
      const data = await memoryList();
      return res.json({ success: true, data });
    }
    if (action === 'delete') {
      if (!key) return res.status(400).json({ error: '需要 key' });
      await memoryDelete(key);
      return res.json({ success: true });
    }
    if (value) {
      await memorySet(key, value);
      return res.json({ success: true, action: 'saved', key, value });
    }
    if (key) {
      const val = await memoryGet(key);
      return res.json({ success: true, key, value: val });
    }
    res.status(400).json({ error: '需要 key 或 action 参数' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI 写代码接口
app.post('/write', express.json(), async (req, res) => {
  const { files, message } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: '需要 files 数组' });
  }
  try {
    const branch = 'main';
    const ref = await gh('GET', `/repos/${GITHUB_OWNER}/deeplink/git/ref/heads/${branch}`);
    const latestCommit = await gh('GET', `/repos/${GITHUB_OWNER}/deeplink/git/commits/${ref.object.sha}`);
    const blobs = await Promise.all(files.map(f =>
      gh('POST', `/repos/${GITHUB_OWNER}/deeplink/git/blobs`, {
        content: f.content,
        encoding: 'utf-8',
      })
    ));
    const newTree = await gh('POST', `/repos/${GITHUB_OWNER}/deeplink/git/trees`, {
      base_tree: latestCommit.tree.sha,
      tree: files.map((f, i) => ({
        path: f.path,
        mode: '100644',
        type: 'blob',
        sha: blobs[i].sha,
      })),
    });
    const newCommit = await gh('POST', `/repos/${GITHUB_OWNER}/deeplink/git/commits`, {
      message: message || 'DeepSeek 自动提交',
      tree: newTree.sha,
      parents: [latestCommit.sha],
    });
    await gh('PATCH', `/repos/${GITHUB_OWNER}/deeplink/git/refs/heads/${branch}`, {
      sha: newCommit.sha,
    });
    res.json({ success: true, commit: newCommit.sha, files: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ DeepSeek-GitHub MCP running on port ${PORT}`);
});
