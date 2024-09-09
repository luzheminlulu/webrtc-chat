
function setFullHeight() {  
	const vh = window.innerHeight * 0.01; // 计算 1vh  
	document.documentElement.style.setProperty('--vh', `${vh}px`); // 设置 CSS 变量  
	document.getElementById('container').style.height = `${window.innerHeight}px`; // 设置元素高度  
} 
 
function setCookie(name, value, days) {  
	const date = new Date();  
	date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000)); // 计算过期时间  
	const expires = "expires=" + date.toUTCString(); // 转换为UTC字符串  
	document.cookie = `${name}=${value}; ${expires}; path=/`; // 设置cookie  
}  

// 读取cookie，若不存在则返回默认值0  
function getCookie(name) {  
	const cookieValue = document.cookie.split('; ').reduce((r, v) => {  
		const parts = v.split('=');  
		return parts[0] === name ? decodeURIComponent(parts[1]) : r;  
	}, '');  
	
	return cookieValue ? cookieValue : 0; // 如果cookie不存在，返回0  
}  

window.addEventListener('resize', setFullHeight); // 监听窗口大小变化  
setFullHeight(); // 初始化  

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
const button_strat = document.querySelector('.start-button');
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



//message.log('信令通道（WebSocket）创建中......');

const currentUrl = window.location.href;
const wsUrl = currentUrl.replace(/^https?:\/\//, 'wss://');
//console.log(wsUrl);

const socket = new WebSocket(wsUrl);

socket.onopen = () => {
	//message.log('信令通道创建成功！');
	button_strat.style.display = 'block';
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
			button_strat.style.display = 'none';
			button_stop.style.display = 'none';
			//window.open("/", '_self');
		} else if (type === 'cmd_stop') {
			stopPeerConnection(1);
		}
	}
}  


const PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
!PeerConnection && message.error('浏览器不支持WebRTC！');


var peer;

async function newPeer(){
	//if(peer) peer = null;
	
	peer = new PeerConnection();

	peer.ontrack = e => {
		if (e && e.streams) {
			//message.log('收到对方音频/视频流数据...');
			remoteVideo.srcObject = e.streams[0];
			//message.log('set对方音频/视频流数据...');
			
		}
	};
	
	peer.onicecandidate = e => {
		if (e.candidate) {
			//message.log('搜集并发送候选人');
			socket.send(JSON.stringify({
				type: `ice`,
				iceCandidate: e.candidate
			}));
		} else {
			;//message.log('候选人收集完成！');
		}
	};
}

newPeer();
var stream;

var cameraID,audioID;

async function startLive (offerSdp) {

	button_strat.style.display = 'none';
	button_stop.style.display  = 'block';
	
		
	await startCamera(cameraID,audioID);
	stream.getTracks().forEach(track => {  
		peer.addTrack(track, stream);  
	});

	if (!offerSdp) {
					
		message.log('发起通话');
		
		const offer = await peer.createOffer();
		//console.log(offer);
		await peer.setLocalDescription(offer);
		
		//message.log(`传输发起方本地SDP`);
		socket.send(JSON.stringify(offer));
		
	} else {
		message.log('接收通话');
		
		await peer.setRemoteDescription(offerSdp);

		//message.log('创建接收方（应答）SDP');
		const answer = await peer.createAnswer();
		//console.log(answer);
		//message.log(`传输接收方（应答）SDP`);
		await peer.setLocalDescription(answer);
		socket.send(JSON.stringify(answer));
	}
}


async function stopPeerConnection(mine) {  

	button_strat.style.display = 'block';
	button_stop.style.display = 'none';
	
	

	if(!mine){
		socket.send(JSON.stringify({
			type: `cmd_stop`,
		}));
		message.log('关闭通话');  
	}
	else{
		message.log('对方关闭通话'); 
	}
	
	
	if(stream){
	//	peer.getSenders().forEach(sender => {  
	//		sender.track.stop(); // 停止当前轨道  
	//		peer.removeTrack(sender); // 从对等连接中移除  
	//	});  
	//
		stream.getTracks().forEach(track => {  
			track.stop(); // 停止每个轨道  
		});  
	}

	
	await peer.close();
	
	await newPeer();

}




async function getCameraList() {  


	const devices = await navigator.mediaDevices.enumerateDevices(); 
	
	// 清空选择框  
	cameraSelect.innerHTML = '';  

	// 过滤出摄像头设备  
	const cameras = devices.filter(device => device.kind === 'videoinput');  

	// 添加摄像头选项到选择框  
	cameras.forEach(camera => {  
		const option = document.createElement('option');  
		option.value = camera.deviceId;  
		option.text = camera.label || `Camera ${camera.deviceId}`;  
		cameraSelect.appendChild(option);  
	}); 
	const option = document.createElement('option');  
	option.value = "DISPLAYSHARE";  
	option.text = "屏幕共享";  
	cameraSelect.appendChild(option);  


	let cameraID_cookie = getCookie("cameraID");
	if(cameraID_cookie){
		cameraSelect.value = cameraID_cookie;  
		cameraID = cameraID_cookie;  
	}
	else if (cameras.length > 0) {  
		cameraSelect.value = cameras[0].deviceId;  
		cameraID = cameras[0].deviceId;  
		//startCamera(cameras[0].deviceId);  
	}  
}

async function getAudioInputList() {  
	const devices = await navigator.mediaDevices.enumerateDevices();  
	const audioInputSelect = document.getElementById('audioInputSelect');  

	// 清空选择框  
	audioInputSelect.innerHTML = '';  

	// 过滤出音频输入设备  
	const audioInputs = devices.filter(device => device.kind === 'audioinput');  

	// 添加音频输入选项到选择框  
	audioInputs.forEach(input => {  
		const option = document.createElement('option');  
		option.value = input.deviceId;  
		option.text = input.label || `Microphone ${input.deviceId}`;  
		audioInputSelect.appendChild(option);  
	});
	const option = document.createElement('option');  
	option.value = "NOMICROPHONE";  
	option.text = "关闭麦克风";  
	audioInputSelect.appendChild(option);  

	// 选择第一个音频输入设备  
	let audioID_cookie = getCookie("audioID");
	if(audioID_cookie){
		audioInputSelect.value = audioID_cookie;  
		audioID = audioID_cookie;  
	}
	else if (audioInputs.length > 0) {  
		audioInputSelect.value = audioInputs[0].deviceId;
		audioID = audioInputs[0].deviceId;
		//startAudio(audioInputs[0].deviceId);  
	}  
}  



 

// 初始化音频输入列表  
getCameraList();
getAudioInputList(); 

async function startCamera(cameraID,audioID) {
	
	//console.log(cameraID,audioID);
	
	try {
		
		let audioen = audioID==="NOMICROPHONE" ? false : 
											{
												echoCancellation: true, // 启用回声消除  
												noiseSuppression: true, // 启用噪声抑制  
												sampleRate: 44100, // 采样率  
												deviceId: { exact: audioID },
												
											};
		
		 if( cameraID==="DISPLAYSHARE"){

			stream = await navigator.mediaDevices.getDisplayMedia({
				video: {  
							cursor: "always", // 选项：'always', 'motion', 'never'，控制光标的显示  
						},   
				audio: audioID==="NOMICROPHONE" ? false : true ,    
			});
			message.log('打开屏幕共享');
		 } else {
			 
			stream = await navigator.mediaDevices.getUserMedia({
				video: {			
					facingMode: 'user', // 'user' 表示前置摄像头，'environment' 表示后置摄像头  
					width: { ideal: 1920 }, // 理想宽度  
					height: { ideal: 1080 }, // 理想高度  
					frameRate: { ideal: 30 }, // 理想帧率  
					deviceId: { exact: cameraID },
					} , 
				audio: audioen ,    
			});
			message.log('打开摄像头/麦克风');
		};
	
		localVideo.srcObject = stream;
		
		
		
	} catch {
		message.error('摄像头/麦克风获取失败！');
		return;
	}


	
}

document.getElementById('cameraSelect').addEventListener('change', async(event) => {
	cameraID = event.target.value ;
	setCookie("cameraID",cameraID,60);
	if(stream) {
		await stopPeerConnection();
		await startLive();
	}
});  

document.getElementById('audioInputSelect').addEventListener('change', async(event) => {  
	
	audioID = event.target.value;
	setCookie("audioID",audioID,60);
	if(stream) {
		await stopPeerConnection();
		await startLive();
	}
}); 


