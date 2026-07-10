const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('DeepLink Control Server is running');
});

const wss = new WebSocket.Server({ server });

let phoneClient = null;
let aiClient = null;

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
                    } else if (data.role === 'ai') {
                        aiClient = ws;
                        console.log('AI已连接');
                        ws.send(JSON.stringify({ type: 'registered', status: 'ok' }));
                    }
                    break;

                case 'command':
                    if (phoneClient && phoneClient.readyState === WebSocket.OPEN) {
                        phoneClient.send(JSON.stringify(data.command));
                    }
                    break;

                case 'foreground_response':
                    if (aiClient && aiClient.readyState === WebSocket.OPEN) {
                        aiClient.send(JSON.stringify(data));
                    }
                    break;

                case 'pong':
                    if (aiClient && aiClient.readyState === WebSocket.OPEN) {
                        aiClient.send(JSON.stringify(data));
                    }
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
        } else if (ws === aiClient) {
            aiClient = null;
            console.log('AI断开连接');
        }
    });

    ws.on('error', (err) => {
        console.error('连接错误:', err.message);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`DeepLink Control 服务器已启动`);
    console.log(`监听端口: ${PORT}`);
});