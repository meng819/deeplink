const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;

    if (req.method === 'GET' && path === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'running', phoneConnected: phoneClient !== null }));
        return;
    }

    if (req.method === 'POST' && path === '/command') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                
                if (!phoneClient || phoneClient.readyState !== WebSocket.OPEN) {
                    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, error: '手机未连接' }));
                    return;
                }

                const command = {
                    type: 'command',
                    command: data
                };

                phoneClient.send(JSON.stringify(command));
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, message: '指令已发送' }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

const wss = new WebSocket.Server({ server });

let phoneClient = null;

wss.on('connection', (ws, req) => {
    console.log('新连接来自:', req.socket.remoteAddress);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('收到消息:', data.type);

            switch (data.type) {
                case 'register':
                    if (data.package === 'com.deeplink.control') {
                        phoneClient = ws;
                        console.log('手机已连接');
                        ws.send(JSON.stringify({ type: 'registered', status: 'ok' }));
                    }
                    break;

                case 'foreground_response':
                    console.log('前台应用:', data.package);
                    break;

                case 'pong':
                    break;

                default:
                    console.log('未知消息类型:', data.type);
            }
        } catch (e) {
            console.error('消息解析失败:', e.message);
        }
    });

    ws.on('close', () => {
        if (ws === phoneClient) {
            phoneClient = null;
            console.log('手机断开连接');
        }
    });

    ws.on('error', (err) => {
        console.error('连接错误:', err.message);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`DeepLink Control 服务器 v2 已启动`);
    console.log(`监听端口: ${PORT}`);
    console.log(`HTTP API: http://0.0.0.0:${PORT}/command (POST)`);
});