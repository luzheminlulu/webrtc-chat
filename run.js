const app = require('express')();
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');

const options = {
    key: fs.readFileSync('./ssl/private-key.pem'),
    cert: fs.readFileSync('./ssl/certificate.pem')
};
const PORT = 8887;

const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });

// 辅助函数：向同房间的其他客户端发送消息
function client_equal_send(ws, message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN && client.url_info === ws.url_info) {
            client.send(payload);
        }
    });
}

// --- 自动踢出逻辑：心跳检测 ---
// 每 30 秒探测一次，如果客户端没响应则强制断开
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log(`设备超时离线: ${ws.url_base}`);
            return ws.terminate(); // 强制关闭连接，触发 'close' 事件
        }
        ws.isAlive = false;
        ws.ping(); // 向客户端发送 ping
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws, req) => {
    ws.url_info = req.url;
    ws.url_base = req.socket.remoteAddress;
    ws.isAlive = true;

    // 响应客户端的 pong (证明设备还在线)
    ws.on('pong', () => { ws.isAlive = true; });

    let existing_clients = [];
    wss.clients.forEach((client) => {
        if (client !== ws && client.url_info === ws.url_info && client.readyState === WebSocket.OPEN) {
            existing_clients.push(client.url_base);
        }
    });

    if (existing_clients.length >= 2) { // 限制房间人数（原逻辑为大于1即拒绝加入第3人）
        ws.send(JSON.stringify({
            "type": "info_full",
            "data": "此房间已被占用，请更换房间"
        }));
        
        client_equal_send(ws, {
            "type": "info",
            "data": `${ws.url_base}尝试加入房间，已拒绝`
        });
        
        ws.close();
        return;
    }

    // 成功加入房间逻辑
    const info_msg = existing_clients.length > 0 
        ? `${existing_clients.join(',')} 已经在房间中` 
        : `房间暂时只有你一人`;

    ws.send(JSON.stringify({ "type": "info", "data": info_msg }));

    client_equal_send(ws, {
        "type": "info",
        "data": `${ws.url_base}加入房间`
    });

    // 消息转发
    ws.on('message', (data) => {
        // 保持原样转发原始数据（Buffer/String），提高视频流处理效率
        client_equal_send(ws, data);
    });

    // 异常处理：防止报错导致程序崩溃
    ws.on('error', (err) => {
        console.error(`Socket 错误 (${ws.url_base}):`, err.message);
    });

    // 离开/离线处理
    ws.on('close', () => {
        client_equal_send(ws, {
            "type": "info",
            "data": `${ws.url_base}离开房间`
        });
    });
});

// --- 路由配置保持不变 ---
app.get('/', (req, res) => res.sendFile('./web/index.html', { root: __dirname }));
app.get('/p2p.js', (req, res) => res.sendFile('./web/p2p.js', { root: __dirname }));
app.get('/p2p.css', (req, res) => res.sendFile('./web/p2p.css', { root: __dirname }));
app.get('/favicon.png', (req, res) => res.sendFile('./web/favicon.png', { root: __dirname }));
app.get('/room/*', (req, res) => res.sendFile('./web/p2p.html', { root: __dirname }));

app.get('/update_all', (req, res) => {
    let update_cnt = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: `cmd_update` }));
            update_cnt++;
        }
    });
    res.send(`<h1>已发送${update_cnt}个更新请求</h1>`);
    setTimeout(() => { process.exit(0); }, 1000);
});

server.listen(PORT, () => {
    console.log(`HTTPS Server is running on https://localhost:${PORT}`);
});
