
function setFullHeight() {  
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    document.getElementById('container').style.height = `${window.innerHeight}px`;
} 
 
function setCookie(name, value, days) {  
    const date = new Date();  
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000)); 
    const expires = "expires=" + date.toUTCString(); 
    document.cookie = `${name}=${value}; ${expires}; path=/`; 
}  

function getCookie(name) {  
    const cookieValue = document.cookie.split('; ').reduce((r, v) => {  
        const parts = v.split('=');  
        return parts[0] === name ? decodeURIComponent(parts[1]) : r;  
    }, '');  
    
    return cookieValue ? cookieValue : 0;
}  

window.addEventListener('resize', setFullHeight);
setFullHeight(); 

const message = {
	el: document.querySelector('.logger'),
	log (msg) {
		this.el.innerHTML += `<span>${new Date().toLocaleTimeString()}：${msg}</span><br/>`;
		this.el.scrollTop = this.el.scrollHeight;  
	},
	error (msg) {
		this.el.innerHTML += `<span class="error">${new Date().toLocaleTimeString()}：${msg}</span><br/>`;
		this.el.scrollTop = this.el.scrollHeight;  
	}
};

const localVideo = document.querySelector('#local-video');
const remoteVideo = document.querySelector('#remote-video');

const button_start = document.querySelector('.start-button');
const button_stop = document.querySelector('.stop-button'); 
const cameraSelect = document.getElementById('cameraSelect');  

localVideo.onloadeddata = () => {
	message.log('播放本地视频');
	localVideo.play();
}
remoteVideo.onloadeddata = () => {
	message.log('播放对方视频');
	remoteVideo.play();
}

function showTimeCounter(st){
	const tc = document.getElementById("time_counter");
	tc.innerHTML = `${showTimeFormat(((new Date())-st)/1000)}`;
}

function showTimeFormat(seconds){
	//console.log(seconds);
	const hour=Math.floor(seconds/(60*60)).toString().padStart(2,'0'); 
	const min=Math.floor(seconds%(60*60)/(60)).toString().padStart(2,'0'); 
	const sec=Math.floor(seconds%(60)).toString().padStart(2,'0'); 
	return `${hour}:${min}:${sec}`; 
}

const currentUrl = window.location.href;
const wsUrl = currentUrl.replace(/^https?:\/\//, 'wss://');
const socket = new WebSocket(wsUrl);

socket.onopen = () => {
	//message.log('信令通道创建成功！');
	button_start.style.display = 'block';
	button_stop.style.display = 'none';
}

socket.onerror = () => message.error('服务器连接失败！');


const messageQueue = []; // 消息队列
let isProcessing = false; // 用于跟踪是否正在处理  

socket.onmessage = async(e) => {
    messageQueue.push(e.data); // 将消息添加到队列
    if (!isProcessing) {  
        isProcessing = true; // 设置为正在处理  
        processQueue().then(() => {  
            isProcessing = false; // 处理完成，重置状态  
        });  
    }  
};

async function processQueue() {  
    while (messageQueue.length > 0) {  
        const onemessage = messageQueue.shift(); // 从队列中取出消息  
		//console.log(e.data) ;
		const { type, sdp, iceCandidate, data } = JSON.parse(onemessage);
		//console.log(type, sdp, iceCandidate, data) ;
		if (type === 'answer') {
			await peer.setRemoteDescription(new RTCSessionDescription({ type, sdp }));
		} else if (type === 'offer') {
			await startLive(new RTCSessionDescription({ type, sdp }));
		} else if (type === 'ice') {
			await peer.addIceCandidate(iceCandidate);
		} else if (type === 'info') {
			message.log(data);
		} else if (type === 'info_full') {
			message.log(data);
			button_start.style.display = 'none';
			button_stop.style.display = 'none';
			//window.open("/", '_self');
		} else if (type === 'cmd_stop') {
			stopPeerConnection(1);
		} else if (type === 'cmd_update') {
			console.log("5s后刷新...");
			window.setTimeout( function() {
				location.reload();
			}, 5000);
		}
    }
}  
// ...（前面保留你的 setFullHeight, cookie操作, message对象, socket初始化, processQueue 等逻辑）...

const PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
!PeerConnection && message.error('浏览器不支持WebRTC！');

var peer;
var stream = null;
var cameraID, audioID;
var time_count_id;

async function newPeer(){
    peer = new PeerConnection();
    
    peer.ontrack = e => {
        if (e && e.streams) {
            remoteVideo.srcObject = e.streams[0];
        }
    };
    
    peer.onicecandidate = e => {
        if (e.candidate) {
            socket.send(JSON.stringify({
                type: `ice`,
                iceCandidate: e.candidate
            }));
        }
    };

    // 新增：监听 ICE 连接状态变化
    peer.oniceconnectionstatechange = async () => {
        if (!peer) return;
        const state = peer.iceConnectionState;
        console.log(`[WebRTC] ICE 状态变更为: ${state}`);

        if (state === 'disconnected') {
            message.error('网络波动，连接暂时断开...');
        } else if (state === 'failed') {
            message.error('连接断开，正在尝试静默重连 (ICE Restart)...');
            try {
                // 核心重连逻辑：触发 ICE Restart
                const offer = await peer.createOffer({ iceRestart: true });
                await peer.setLocalDescription(offer);
                socket.send(JSON.stringify(offer));
            } catch (err) {
                console.error('ICE 重连失败:', err);
                message.error('重连失败，请尝试刷新页面。');
                stopPeerConnection(1);
            }
        } else if (state === 'connected' || state === 'completed') {
            message.log('音视频连接已建立/恢复正常');
        }
    };
}

newPeer();

async function startLive (offerSdp) {
    button_start.style.display = 'none';
    button_stop.style.display  = 'block';

    try {  
        // 统一由 startCamera 获取流并赋值给全局 stream
        await startCamera(cameraID, audioID);
        
        if (stream) {
            stream.getTracks().forEach(track => {  
                peer.addTrack(track, stream);  
            });
        }

        if (!offerSdp) {
            message.log('发起通话');
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            socket.send(JSON.stringify(offer));
        } else {
            message.log('接收通话');
            await peer.setRemoteDescription(offerSdp);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socket.send(JSON.stringify(answer));
        }
    } catch (err) {       
        console.error(err);
        message.error('摄像头/麦克风获取失败或信令错误！');
        // 发生错误时恢复UI状态
        stopPeerConnection(1);
        return;
    }

    const st = new Date();
    if(time_count_id) clearInterval(time_count_id);
    time_count_id = setInterval(() => { showTimeCounter(st); }, 1000);
    startNetworkMonitoring(); // 开始监控网络状态
}

async function stopPeerConnection(isRemoteAction) {  
    if(time_count_id) clearInterval(time_count_id);
    button_start.style.display = 'block';
    button_stop.style.display = 'none';
    stopNetworkMonitoring(); 

    // 修正日志逻辑
    if(!isRemoteAction){
        // 如果是我主动挂断，发消息通知对方
        socket.send(JSON.stringify({ type: `cmd_stop` }));
        message.log('你已关闭通话');  
    } else {
        message.log('对方已挂断通话'); 
    }
    
    // 释放媒体流
    if(stream){
        stream.getTracks().forEach(track => {
            track.stop();
        });
    }

    // 清空画面并重置 Video 标签
    [localVideo, remoteVideo].forEach(v => {
        v.pause();
        v.srcObject = null;
        try { v.load(); } catch(e) {} 
    });

    stream = null;
    if (peer) {
        // 重要：关闭前移除所有事件监听，防止闭包导致的内存泄露或重复触发
        peer.onicecandidate = null;
        peer.ontrack = null;
        peer.oniceconnectionstatechange = null;
        peer.onconnectionstatechange = null; 
        peer.close();
        peer = null;
    }
    
    // 重新初始化 Peer 以备下次呼叫
    await newPeer();
}


window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
});

async function getCameraList() {  
    try {
        const devices = await navigator.mediaDevices.enumerateDevices(); 
        
        cameraSelect.innerHTML = '';  
        const cameras = devices.filter(device => device.kind === 'videoinput');  
        cameras.forEach(camera => {  
            const option = document.createElement('option');  
            option.value = camera.deviceId;  
            option.text = camera.label || `Camera ${camera.deviceId.substring(0, 5)}...`;  
            cameraSelect.appendChild(option);  
        }); 

        const optionShare = document.createElement('option');  
        optionShare.value = "DISPLAYSHARE";  
        optionShare.text = "屏幕共享";  
        cameraSelect.appendChild(optionShare);  

        const optionNoCam = document.createElement('option');  
        optionNoCam.value = "NOCAMERA";  
        optionNoCam.text = "关闭摄像头";  
        cameraSelect.appendChild(optionNoCam);  

        let cameraID_cookie = getCookie("cameraID");
        if(cameraID_cookie){
            cameraSelect.value = cameraID_cookie;  
            cameraID = cameraID_cookie;  
        } else if (cameras.length > 0) {  
            cameraSelect.value = cameras[0].deviceId;  
            cameraID = cameras[0].deviceId;  
        }  
    } catch (e) {
        console.error("枚举摄像头失败", e);
    }
}

async function getAudioInputList() {  
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();  
        const audioInputSelect = document.getElementById('audioInputSelect');  

        audioInputSelect.innerHTML = '';  
        const audioInputs = devices.filter(device => device.kind === 'audioinput');  
        audioInputs.forEach(input => {  
            const option = document.createElement('option');  
            option.value = input.deviceId;  
            option.text = input.label || `Microphone ${input.deviceId.substring(0, 5)}...`;  
            audioInputSelect.appendChild(option);  
        });

        const optionNoMic = document.createElement('option');  
        optionNoMic.value = "NOMICROPHONE";  
        optionNoMic.text = "关闭麦克风";  
        audioInputSelect.appendChild(optionNoMic);  

        let audioID_cookie = getCookie("audioID");
        if(audioID_cookie){
            audioInputSelect.value = audioID_cookie;  
            audioID = audioID_cookie;  
        } else if (audioInputs.length > 0) {  
            audioInputSelect.value = audioInputs[0].deviceId;
            audioID = audioInputs[0].deviceId;
        }  
    } catch (e) {
        console.error("枚举麦克风失败", e);
    }
}  

getCameraList();
getAudioInputList(); 

async function startCamera(camID, audID) {
    // 灵活处理音频约束
    let audioConstraints = false;
    if (audID !== "NOMICROPHONE") {
        audioConstraints = {
            echoCancellation: true,  
            noiseSuppression: true,  
            sampleRate: 44100,
        };
        if (audID && audID !== "default") {
            audioConstraints.deviceId = { exact: audID };
        }
    }
    
    if (camID === "DISPLAYSHARE") {
        stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },   
            audio: audioConstraints !== false     
        });
        message.log('打开屏幕共享');
    } else {
        // 灵活处理视频约束
        let videoConstraints = false;
        if (camID !== "NOCAMERA") {
            videoConstraints = { facingMode: 'user' };
            if (camID && camID !== "default") {
                videoConstraints.deviceId = { exact: camID };
            }
        }

        // 如果音视频都关闭，不请求 getUserMedia
        if (!videoConstraints && !audioConstraints) {
            stream = new MediaStream(); // 创建一个空流，防止报错
            message.log('音视频已关闭');
        } else {
            stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints, 
                audio: audioConstraints,    
            });
            message.log('打开摄像头/麦克风');
        }
    }
    
    localVideo.srcObject = stream;
    return stream;
}

async function change_camera() {
    const oldStream = stream; // 暂存旧流，用于稍后关闭硬件灯

    try {
        // startCamera 会获取新流并自动覆盖全局变量 stream 和 localVideo.srcObject
        await startCamera(cameraID, audioID);
        
        // 如果正在通话中（Peer已建立且有发送器），则无缝替换轨道
        if (peer && peer.signalingState !== "closed") {
            const senders = peer.getSenders();
            const videoSender = senders.find(s => s.track?.kind === 'video');
            const audioSender = senders.find(s => s.track?.kind === 'audio');
            
            const newVideoTrack = stream.getVideoTracks()[0];
            const newAudioTrack = stream.getAudioTracks()[0];

            if (videoSender && newVideoTrack) {
                // 使用 replaceTrack 无缝替换轨道，无需重新发起 SDP 协商
                await videoSender.replaceTrack(newVideoTrack);
            }
            if (audioSender && newAudioTrack) {
                await audioSender.replaceTrack(newAudioTrack);
            }
        }
    } catch (error) {
        message.error('切换设备失败！');
        console.error(error);
    } finally {
        // 核心步骤：彻底停止并销毁旧的媒体流，释放摄像头/麦克风的硬件占用灯
        if (oldStream) {
            oldStream.getTracks().forEach(track => track.stop());
        }
    }
}

document.getElementById('cameraSelect').addEventListener('change', async(event) => {
    cameraID = event.target.value;
    setCookie("cameraID", cameraID, 60);
    await change_camera();
});  

document.getElementById('audioInputSelect').addEventListener('change', async(event) => {  
    audioID = event.target.value;
    if(audioID !== "NOMICROPHONE") {
        setCookie("audioID", audioID, 60);
    }
    await change_camera();
});


let statsInterval = null;

// 动态创建或获取网络状态 UI
function getNetworkStatusUI() {
    let ns = document.getElementById('network-status');
    if (!ns) {
        ns = document.createElement('div');
        ns.id = 'network-status';
        // 绝对定位在右上角，不影响你现有的布局
        ns.style.cssText = 'position:fixed; top:10px; right:10px; padding:5px 10px; background:rgba(0,0,0,0.6); color:#fff; border-radius:4px; font-size:12px; z-index:9999; display:none; transition: background 0.3s;';
        document.body.appendChild(ns);
    }
    return ns;
}

// 开启网络监控
function startNetworkMonitoring() {
    if (statsInterval) clearInterval(statsInterval);
    const nsUI = getNetworkStatusUI();
    nsUI.style.display = 'block';

    statsInterval = setInterval(async () => {
        if (!peer || peer.signalingState === "closed") {
            stopNetworkMonitoring();
            return;
        }

        try {
            const stats = await peer.getStats(null);
            let rtt = 0;
            let packetLoss = 0;

            stats.forEach(report => {
                // 获取候选者对（获取延迟 RTT）
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    rtt = (report.currentRoundTripTime * 1000) || 0; 
                }
                // 获取入站 RTP 流（获取接收端的丢包率）
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    const received = report.packetsReceived || 0;
                    const lost = Math.max(0, report.packetsLost || 0); // 确保不为负
                    if (received + lost > 0) {
                        packetLoss = (lost / (received + lost)) * 100;
                    }
                }
            });

            // 渲染状态到 UI
            nsUI.innerHTML = `延迟: ${rtt.toFixed(0)}ms | 丢包: ${packetLoss.toFixed(1)}%`;

            // 根据阈值改变颜色反馈质量
            if (rtt > 300 || packetLoss > 8) {
                nsUI.style.background = 'rgba(220, 53, 69, 0.8)'; // 红色：网络差
            } else if (rtt > 150 || packetLoss > 2) {
                nsUI.style.background = 'rgba(255, 193, 7, 0.8)'; // 黄色：网络一般
            } else {
                nsUI.style.background = 'rgba(40, 167, 69, 0.8)'; // 绿色：网络良好
            }

        } catch (err) {
            console.error("获取统计数据失败:", err);
        }
    }, 2000); // 每 2 秒刷新一次
}

// 停止网络监控
function stopNetworkMonitoring() {
    if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
    }
    const nsUI = document.getElementById('network-status');
    if (nsUI) nsUI.style.display = 'none';
}


let isDragging = false;
let offsetX = 0;
let offsetY = 0;

localVideo.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = localVideo.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    localVideo.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const container = document.querySelector('.video-box');
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    
    // 边界检测
    const maxX = container.clientWidth - localVideo.offsetWidth;
    const maxY = container.clientHeight - localVideo.offsetHeight;
    
    localVideo.style.right = 'auto';
    localVideo.style.bottom = 'auto';
    localVideo.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    localVideo.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    localVideo.style.cursor = 'move';
});
