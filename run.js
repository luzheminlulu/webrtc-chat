const app = require('express')();
const WebSocket = require('ws');  

const https = require('https');  
const fs = require('fs');  


// 读取 SSL/TLS 证书和私钥  
const options = {  
    key : fs.readFileSync('./ssl/private-key.pem'),  
    cert: fs.readFileSync('./ssl/certificate.pem')  
};
PORT = 8887;

const server = https.createServer(options, app);  
wss = new  WebSocket.Server({ server });  

function client_equal_send(ws,message){
	wss.clients.forEach((client) => {  
		if (client !== ws && client.url_info === ws.url_info) {  
			client.send( JSON.stringify(message) );  
		}
	});
};

wss.on('connection', (ws, req) => { 
	ws.url_info = req.url;  
	ws.url_base = req.socket.remoteAddress ;
	console.log(`Client connected: ${ws.url_info}`);  
	
	let this_ws_info = "" ;
	let this_ws_cnt  = 0  ;
	
	wss.clients.forEach((client) => {  
        if (client !== ws && client.url_info === ws.url_info) {
			if(this_ws_info) this_ws_info  += `,${client.url_base}`;
			else this_ws_info  += `${client.url_base}`;
			this_ws_cnt++;
        }
    });
	
	let message_info;
	if(this_ws_cnt>1){
		message_info = {
			"type" : "info_full" ,
			"data" : `此房间已被${this_ws_info}占用，请更换房间` ,
		} ;
		ws.send( JSON.stringify(message_info) );
		
		message_info = {
			"type" : "info" ,
			"data" : `${ws.url_base}尝试加入房间，已拒绝` ,
		} ;
		client_equal_send(ws,message_info);
		
		ws.close();
	}
	else{
		
		message_info = {
			"type" : "info" ,
			"data" : this_ws_cnt ? `${this_ws_info}已经在房间中` : `房间暂时只有你一人`,
		} ;
		ws.send( JSON.stringify(message_info) );  

		message_info = {
			"type" : "info" ,
			"data" : `${ws.url_base}加入房间` ,
		} ;
		client_equal_send(ws,message_info);
		
		
		ws.on('message', (message) => {
			
			wss.clients.forEach((client) => {
				if (client !== ws && client.url_info === ws.url_info) {
					//console.log(client.url_info,message);
					client.send( message );  
				}
			});
		});  
		
		ws.on('close', (code, reason) => {
			message_info = {
				"type" : "info" ,
				"data" : `${ws.url_base}离开房间` ,
			} ;
			client_equal_send(ws,message_info);
		});
	}

});


app.get('/', (req, res) => {
	res.sendFile('./web/index.html', { root: __dirname });
});
app.get('/p2p.js', (req, res) => {
	res.sendFile('./web/p2p.js', { root: __dirname });
});
app.get('/p2p.css', (req, res) => {
	res.sendFile('./web/p2p.css', { root: __dirname });
});
app.get('/room/*', (req, res) => {
	res.sendFile('./web/p2p.html', { root: __dirname });
});


server.listen(PORT, () => {  
    console.log(`HTTPS Server is running on https://:::${PORT}`);  
});  