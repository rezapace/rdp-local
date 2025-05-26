// Remote Desktop Application
class RemoteDesktopApp {
    constructor() {
        this.ws = null;
        this.pc = null;
        this.localStream = null;
        this.remoteStream = null;
        this.role = null;
        this.clientId = null;
        this.connectedPeerId = null;
        this.isControlEnabled = false;
        this.statsInterval = null;
        this.reconnectInterval = null;
        this.debugEnabled = true;
        
        // Configuration
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10,
            reconnectDelay: 3000,
            statsUpdateInterval: 1000
        };
        
        // Quality presets
        this.qualityPresets = {
            high: { width: 1920, height: 1080, frameRate: 30 },
            medium: { width: 1280, height: 720, frameRate: 30 },
            low: { width: 854, height: 480, frameRate: 24 },
            auto: null
        };
        
        // Initialize DOM elements
        this.initializeDOMElements();
        
        // Initialize event listeners
        this.initializeEventListeners();
        
        // Initialize debug console
        this.debug('Application initialized');
    }
    
    initializeDOMElements() {
        // Status elements
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        
        // Panels
        this.roleSelection = document.getElementById('roleSelection');
        this.hostPanel = document.getElementById('hostPanel');
        this.clientPanel = document.getElementById('clientPanel');
        this.videoArea = document.getElementById('videoArea');
        
        // Video elements
        this.remoteVideo = document.getElementById('remoteVideo');
        this.localVideo = document.getElementById('localVideo');
        this.videoContainer = document.getElementById('videoContainer');
        this.videoWrapper = document.getElementById('videoWrapper');
        this.videoOverlay = document.getElementById('videoOverlay');
        this.overlayMessage = document.getElementById('overlayMessage');
        this.controlCanvas = document.getElementById('controlCanvas');
        
        // Control elements
        this.shareBtn = document.getElementById('shareBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.controlBtn = document.getElementById('controlBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        
        // Debug elements
        this.debugLog = document.getElementById('debugLog');
        this.debugConsole = document.getElementById('debugConsole');
        
        // Initialize canvas context
        this.canvasContext = this.controlCanvas.getContext('2d');
    }
    
    initializeEventListeners() {
        // Fullscreen change events
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
        
        // Window resize
        window.addEventListener('resize', () => this.handleResize());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Remote video events
        this.remoteVideo.addEventListener('loadedmetadata', () => this.handleVideoLoaded());
        
        // Control canvas events
        this.controlCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.controlCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.controlCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.controlCanvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        this.controlCanvas.addEventListener('wheel', (e) => this.handleWheel(e));
        
        // Touch events for mobile
        this.controlCanvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.controlCanvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.controlCanvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    }
    
    // Debug logging
    debug(message, type = 'info') {
        if (!this.debugEnabled) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        
        console.log(logEntry);
        
        if (this.debugLog) {
            const entry = document.createElement('div');
            entry.className = `log-entry log-${type}`;
            entry.textContent = logEntry;
            this.debugLog.appendChild(entry);
            this.debugLog.scrollTop = this.debugLog.scrollHeight;
        }
    }
    
    // Notification system
    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // Status management
    updateStatus(status, type = 'normal') {
        this.statusText.textContent = status;
        this.statusIndicator.className = 'status-indicator';
        
        if (type === 'connected') {
            this.statusIndicator.classList.add('connected');
        }
        
        this.debug(`Status: ${status}`, type);
    }
    
    // Role selection
    selectRole(role) {
        this.role = role;
        this.roleSelection.style.display = 'none';
        this.videoArea.style.display = 'flex';
        
        if (role === 'host') {
            this.hostPanel.style.display = 'block';
            this.debug('Selected role: Host');
        } else {
            this.clientPanel.style.display = 'block';
            this.debug('Selected role: Client');
        }
        
        this.connectWebSocket();
    }
    
    // WebSocket connection
    connectWebSocket() {
        const wsUrl = `ws://${window.location.hostname}:${window.location.port || '80'}`;
        this.debug(`Connecting to WebSocket: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => this.handleWebSocketOpen();
        this.ws.onclose = () => this.handleWebSocketClose();
        this.ws.onerror = (error) => this.handleWebSocketError(error);
        this.ws.onmessage = (event) => this.handleWebSocketMessage(event);
    }
    
    handleWebSocketOpen() {
        this.debug('WebSocket connected');
        this.updateStatus('Connected to server', 'connected');
        
        // Clear reconnect interval
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        
        // Send role registration
        this.sendMessage({
            type: 'register',
            role: this.role
        });
    }
    
    handleWebSocketClose() {
        this.debug('WebSocket disconnected');
        this.updateStatus('Disconnected from server', 'error');
        
        // Start reconnection attempts
        if (!this.reconnectInterval) {
            this.reconnectInterval = setInterval(() => {
                this.debug('Attempting to reconnect...');
                this.connectWebSocket();
            }, this.config.reconnectDelay);
        }
    }
    
    handleWebSocketError(error) {
        this.debug(`WebSocket error: ${error}`, 'error');
        this.showNotification('Connection error', 'error');
    }
    
    async handleWebSocketMessage(event) {
        const data = JSON.parse(event.data);
        this.debug(`Received: ${data.type}`);
        
        switch (data.type) {
            case 'registered':
                this.handleRegistered(data);
                break;
            case 'client-joined':
                this.handleClientJoined(data);
                break;
            case 'host-available':
                this.handleHostAvailable(data);
                break;
            case 'offer':
                await this.handleOffer(data);
                break;
            case 'answer':
                await this.handleAnswer(data);
                break;
            case 'ice-candidate':
                await this.handleIceCandidate(data);
                break;
            case 'control':
                this.handleRemoteControl(data);
                break;
            case 'host-disconnected':
                this.handleHostDisconnected();
                break;
            case 'server-shutdown':
                this.handleServerShutdown();
                break;
        }
    }
    
    sendMessage(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    
    // Registration handling
    handleRegistered(data) {
        this.clientId = data.clientId;
        this.debug(`Registered with ID: ${this.clientId}`);
        
        if (this.role === 'host') {
            document.getElementById('sessionId').textContent = this.clientId;
        }
    }
    
    // Host-specific methods
    async startScreenShare() {
        try {
            this.shareBtn.disabled = true;
            this.updateStatus('Starting screen capture...');
            
            const constraints = {
                video: {
                    cursor: document.getElementById('showCursor').checked ? 'always' : 'never',
                    displaySurface: 'monitor',
                    logicalSurface: true
                },
                audio: document.getElementById('captureAudio').checked
            };
            
            // Apply quality preset if selected
            const quality = document.getElementById('qualitySelect')?.value || 'auto';
            if (quality !== 'auto' && this.qualityPresets[quality]) {
                Object.assign(constraints.video, this.qualityPresets[quality]);
            }
            
            this.localStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            
            this.debug('Screen capture started');
            this.localVideo.srcObject = this.localStream;
            
            // Handle stream end
            this.localStream.getVideoTracks()[0].onended = () => {
                this.debug('Screen share ended by user');
                this.stopScreenShare();
            };
            
            this.updateStatus('Screen sharing active', 'connected');
            this.shareBtn.disabled = true;
            this.stopBtn.disabled = false;
            
            // Show video area
            this.videoOverlay.classList.add('hidden');
            
            // Notify server
            this.sendMessage({ type: 'host-ready' });
            
            // If already connected to a peer, create offer
            if (this.connectedPeerId) {
                this.createPeerConnection();
                await this.createAndSendOffer();
            }
            
            // Start stats monitoring
            this.startStatsMonitoring();
            
        } catch (error) {
            this.debug(`Error sharing screen: ${error}`, 'error');
            this.updateStatus('Failed to share screen', 'error');
            this.shareBtn.disabled = false;
            this.showNotification('Failed to start screen share', 'error');
        }
    }
    
    stopScreenShare() {
        this.debug('Stopping screen share');
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.cleanup();
        
        this.updateStatus('Screen sharing stopped');
        this.shareBtn.disabled = false;
        this.stopBtn.disabled = true;
        
        // Notify server
        this.sendMessage({ type: 'host-stopped' });
    }
    
    // Client-specific methods
    handleClientJoined(data) {
        if (this.role !== 'host') return;
        
        this.debug(`Client ${data.clientId} joined`);
        this.connectedPeerId = data.clientId;
        
        if (this.localStream) {
            this.createPeerConnection();
            this.createAndSendOffer();
        }
    }
    
    handleHostAvailable(data) {
        if (this.role !== 'client') return;
        
        this.debug(`Host ${data.hostId} is available`);
        this.connectedPeerId = data.hostId;
        document.getElementById('connectedHost').textContent = data.hostId;
        this.overlayMessage.textContent = 'Waiting for host stream...';
    }
    
    toggleRemoteControl() {
        this.isControlEnabled = !this.isControlEnabled;
        
        if (this.isControlEnabled) {
            this.controlBtn.textContent = 'Disable Control';
            this.videoContainer.classList.add('control-active');
            this.controlCanvas.style.pointerEvents = 'auto';
            this.controlCanvas.style.cursor = 'crosshair';
            this.updateStatus('Remote control enabled', 'connected');
            this.showNotification('Remote control enabled', 'success');
            this.debug('Remote control enabled');
            
            // Ensure canvas is properly sized and positioned
            this.resizeCanvas();
        } else {
            this.controlBtn.textContent = 'Enable Control';
            this.videoContainer.classList.remove('control-active');
            this.controlCanvas.style.pointerEvents = 'none';
            this.controlCanvas.style.cursor = 'default';
            this.updateStatus('Remote control disabled');
            this.debug('Remote control disabled');
        }
    }
    
    // WebRTC methods
    createPeerConnection() {
        this.debug('Creating peer connection');
        
        this.pc = new RTCPeerConnection({
            iceServers: this.config.iceServers,
            iceCandidatePoolSize: this.config.iceCandidatePoolSize
        });
        
        this.pc.onicecandidate = (event) => this.handleLocalIceCandidate(event);
        this.pc.oniceconnectionstatechange = () => this.handleIceConnectionStateChange();
        this.pc.ontrack = (event) => this.handleRemoteTrack(event);
        this.pc.onconnectionstatechange = () => this.handleConnectionStateChange();
        
        // Add local stream if host
        if (this.role === 'host' && this.localStream) {
            this.debug('Adding local stream to peer connection');
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
        }
    }
    
    async createAndSendOffer() {
        try {
            this.debug('Creating offer');
            const offer = await this.pc.createOffer({
                offerToReceiveVideo: this.role === 'client',
                offerToReceiveAudio: this.role === 'client'
            });
            
            await this.pc.setLocalDescription(offer);
            
            this.sendMessage({
                type: 'offer',
                offer: offer,
                targetId: this.connectedPeerId
            });
            
            this.debug('Offer sent');
        } catch (error) {
            this.debug(`Error creating offer: ${error}`, 'error');
        }
    }
    
    async handleOffer(data) {
        try {
            this.debug('Handling offer');
            this.connectedPeerId = data.fromId;
            
            if (!this.pc) {
                this.createPeerConnection();
            }
            
            await this.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            
            this.sendMessage({
                type: 'answer',
                answer: answer,
                targetId: this.connectedPeerId
            });
            
            this.debug('Answer sent');
        } catch (error) {
            this.debug(`Error handling offer: ${error}`, 'error');
        }
    }
    
    async handleAnswer(data) {
        try {
            this.debug('Handling answer');
            await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (error) {
            this.debug(`Error handling answer: ${error}`, 'error');
        }
    }
    
    handleLocalIceCandidate(event) {
        if (event.candidate) {
            this.debug('Sending ICE candidate');
            this.sendMessage({
                type: 'ice-candidate',
                candidate: event.candidate,
                targetId: this.connectedPeerId
            });
        }
    }
    
    async handleIceCandidate(data) {
        if (this.pc) {
            try {
                await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                this.debug('Added ICE candidate');
            } catch (error) {
                this.debug(`Error adding ICE candidate: ${error}`, 'error');
            }
        }
    }
    
    handleRemoteTrack(event) {
        this.debug(`Received remote track: ${event.track.kind}`);
        
        if (event.streams && event.streams[0]) {
            this.remoteStream = event.streams[0];
            this.remoteVideo.srcObject = this.remoteStream;
            
            // Ensure video plays
            this.remoteVideo.play().catch(e => {
                this.debug(`Error playing video: ${e}`, 'error');
            });
            
            if (this.role === 'client') {
                this.updateStatus('Receiving screen share', 'connected');
                this.controlBtn.disabled = false;
                this.fullscreenBtn.disabled = false;
                this.videoOverlay.classList.add('hidden');
                this.showNotification('Connected to host', 'success');
            }
        }
    }
    
    handleVideoLoaded() {
        this.debug('Remote video loaded');
        this.resizeCanvas();
        
        // Start stats monitoring
        this.startStatsMonitoring();
    }
    
    // Connection state handlers
    handleIceConnectionStateChange() {
        this.debug(`ICE connection state: ${this.pc.iceConnectionState}`);
        
        if (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed') {
            this.updateStatus('Peer connection established', 'connected');
        }
    }
    
    handleConnectionStateChange() {
        this.debug(`Connection state: ${this.pc.connectionState}`);
        
        if (this.pc.connectionState === 'connected') {
            this.updateStatus('Peer connection established', 'connected');
        } else if (this.pc.connectionState === 'failed') {
            this.updateStatus('Peer connection failed', 'error');
            this.showNotification('Connection failed', 'error');
            
            // Attempt reconnection
            setTimeout(() => {
                if (this.role === 'host' && this.localStream && this.connectedPeerId) {
                    this.pc.close();
                    this.createPeerConnection();
                    this.createAndSendOffer();
                }
            }, 2000);
        }
    }
    
    // Control handling
    handleMouseMove(event) {
        if (!this.isControlEnabled) return;
        
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        // Throttle mouse move events
        if (!this.lastMouseMove || Date.now() - this.lastMouseMove > 50) {
            this.sendControlCommand('mousemove', { x, y });
            this.lastMouseMove = Date.now();
        }
    }
    
    handleMouseDown(event) {
        if (!this.isControlEnabled) return;
        
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        this.debug(`Mouse down: ${x.toFixed(2)}, ${y.toFixed(2)}, button: ${event.button}`);
        this.sendControlCommand('mousedown', { x, y, button: event.button });
    }
    
    handleMouseUp(event) {
        if (!this.isControlEnabled) return;
        
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        this.debug(`Mouse up: ${x.toFixed(2)}, ${y.toFixed(2)}, button: ${event.button}`);
        this.sendControlCommand('mouseup', { x, y, button: event.button });
    }
    
    handleContextMenu(event) {
        event.preventDefault();
        
        if (!this.isControlEnabled) return;
        
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        this.sendControlCommand('rightclick', { x, y });
    }
    
    handleWheel(event) {
        if (!this.isControlEnabled) return;
        
        event.preventDefault();
        
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        this.sendControlCommand('wheel', { x, y, deltaY: event.deltaY });
    }
    
    handleTouchStart(event) {
        if (!this.isControlEnabled) return;
        
        event.preventDefault();
        const touch = event.touches[0];
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;
        
        this.sendControlCommand('touchstart', { x, y });
    }
    
    handleTouchMove(event) {
        if (!this.isControlEnabled) return;
        
        event.preventDefault();
        const touch = event.touches[0];
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;
        
        this.sendControlCommand('touchmove', { x, y });
    }
    
    handleTouchEnd(event) {
        if (!this.isControlEnabled) return;
        
        event.preventDefault();
        this.sendControlCommand('touchend', {});
    }
    
    sendControlCommand(action, data) {
        this.sendMessage({
            type: 'control',
            action: action,
            ...data
        });
    }
    
    handleRemoteControl(data) {
        if (this.role !== 'host') return;
        
        this.debug(`Remote control: ${data.action}`);
        
        // If robotjs is available, we can directly control the system
        try {
            // This part would typically be implemented in native code or via a backend
            // For demonstration, we'll just log the commands that would be executed
            const action = data.action;
            const x = data.x;
            const y = data.y;
            
            this.debug(`Would execute: ${action} at position ${x?.toFixed(2) || 'N/A'}, ${y?.toFixed(2) || 'N/A'}`);
            
            // For actual implementation, here we would use system APIs
            // to control the mouse and keyboard based on received commands
            
            // Example pseudocode:
            // if (action === 'mousemove') systemControlApi.moveMouse(x, y);
            // else if (action === 'mousedown') systemControlApi.mouseDown(x, y, data.button);
            // else if (action === 'mouseup') systemControlApi.mouseUp(x, y, data.button);
            // else if (action === 'wheel') systemControlApi.scroll(x, y, data.deltaY);
        } catch (error) {
            this.debug(`Remote control error: ${error}`, 'error');
        }
    }
    
    // Fullscreen handling
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.videoContainer.requestFullscreen().catch(err => {
                this.debug(`Error entering fullscreen: ${err}`, 'error');
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    handleFullscreenChange() {
        if (document.fullscreenElement) {
            this.videoContainer.classList.add('fullscreen');
            this.showNotification('Entered fullscreen mode', 'info');
        } else {
            this.videoContainer.classList.remove('fullscreen');
        }
        
        this.resizeCanvas();
    }
    
    // Picture-in-Picture
    async togglePictureInPicture() {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await this.remoteVideo.requestPictureInPicture();
            }
        } catch (error) {
            this.debug(`PiP error: ${error}`, 'error');
            this.showNotification('Picture-in-Picture not supported', 'error');
        }
    }
    
    // Stats monitoring
    startStatsMonitoring() {
        if (this.statsInterval) return;
        
        this.statsInterval = setInterval(() => {
            this.updateStats();
        }, this.config.statsUpdateInterval);
    }
    
    async updateStats() {
        if (!this.pc) return;
        
        try {
            const stats = await this.pc.getStats();
            const statsData = this.processStats(stats);
            this.displayStats(statsData);
        } catch (error) {
            this.debug(`Error getting stats: ${error}`, 'error');
        }
    }
    
    processStats(stats) {
        const processed = {
            video: { inbound: null, outbound: null },
            audio: { inbound: null, outbound: null },
            connection: null
        };
        
        stats.forEach(report => {
            if (report.type === 'inbound-rtp') {
                if (report.mediaType === 'video') {
                    processed.video.inbound = {
                        fps: report.framesPerSecond || 0,
                        resolution: `${report.frameWidth || 0}x${report.frameHeight || 0}`,
                        bitrate: this.calculateBitrate(report.bytesReceived, report.timestamp),
                        packetsLost: report.packetsLost || 0
                    };
                } else if (report.mediaType === 'audio') {
                    processed.audio.inbound = {
                        bitrate: this.calculateBitrate(report.bytesReceived, report.timestamp),
                        packetsLost: report.packetsLost || 0
                    };
                }
            } else if (report.type === 'outbound-rtp') {
                if (report.mediaType === 'video') {
                    processed.video.outbound = {
                        fps: report.framesPerSecond || 0,
                        resolution: `${report.frameWidth || 0}x${report.frameHeight || 0}`,
                        bitrate: this.calculateBitrate(report.bytesSent, report.timestamp),
                        packetsSent: report.packetsSent || 0
                    };
                }
            } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                processed.connection = {
                    rtt: report.currentRoundTripTime ? (report.currentRoundTripTime * 1000).toFixed(0) : 'N/A',
                    localAddress: report.local?.address || 'N/A',
                    remoteAddress: report.remote?.address || 'N/A'
                };
            }
        });
        
        return processed;
    }
    
    calculateBitrate(bytes, timestamp) {
        if (!this.lastStatsBytes) {
            this.lastStatsBytes = bytes;
            this.lastStatsTimestamp = timestamp;
            return 0;
        }
        
        const timeDiff = (timestamp - this.lastStatsTimestamp) / 1000;
        const bytesDiff = bytes - this.lastStatsBytes;
        const bitrate = (bytesDiff * 8) / timeDiff / 1000; // Kbps
        
        this.lastStatsBytes = bytes;
        this.lastStatsTimestamp = timestamp;
        
        return bitrate.toFixed(0);
    }
    
    displayStats(stats) {
        const statsGrid = document.getElementById(this.role === 'host' ? 'hostStatsGrid' : 'clientStatsGrid');
        const statsContainer = document.getElementById(this.role === 'host' ? 'hostStats' : 'clientStats');
        
        if (!statsGrid || !stats) return;
        
        statsContainer.style.display = 'block';
        
        let html = '';
        
        if (this.role === 'host' && stats.video.outbound) {
            html += `
                <div>FPS:</div><div>${stats.video.outbound.fps}</div>
                <div>Resolution:</div><div>${stats.video.outbound.resolution}</div>
                <div>Bitrate:</div><div>${stats.video.outbound.bitrate} Kbps</div>
                <div>Packets:</div><div>${stats.video.outbound.packetsSent}</div>
            `;
        } else if (this.role === 'client' && stats.video.inbound) {
            html += `
                <div>FPS:</div><div>${stats.video.inbound.fps}</div>
                <div>Resolution:</div><div>${stats.video.inbound.resolution}</div>
                <div>Bitrate:</div><div>${stats.video.inbound.bitrate} Kbps</div>
                <div>Lost:</div><div>${stats.video.inbound.packetsLost}</div>
            `;
        }
        
        if (stats.connection) {
            html += `
                <div>RTT:</div><div>${stats.connection.rtt} ms</div>
                <div>Type:</div><div>${stats.connection.localAddress.includes(':') ? 'IPv6' : 'IPv4'}</div>
            `;
        }
        
        statsGrid.innerHTML = html;
    }
    
    toggleStats() {
        const statsContainer = document.getElementById(this.role === 'host' ? 'hostStats' : 'clientStats');
        if (statsContainer) {
            statsContainer.style.display = statsContainer.style.display === 'none' ? 'block' : 'none';
        }
    }
    
    // Utility methods
    resizeCanvas() {
        const rect = this.remoteVideo.getBoundingClientRect();
        this.controlCanvas.width = rect.width;
        this.controlCanvas.height = rect.height;
    }
    
    handleResize() {
        this.resizeCanvas();
    }
    
    handleKeyboardShortcuts(event) {
        // F11 for fullscreen
        if (event.key === 'F11') {
            event.preventDefault();
            this.toggleFullscreen();
        }
        
        // Escape to exit fullscreen
        if (event.key === 'Escape' && document.fullscreenElement) {
            document.exitFullscreen();
        }
        
        // Ctrl+D for debug console
        if (event.ctrlKey && event.key === 'd') {
            event.preventDefault();
            this.toggleDebug();
        }
    }
    
    togglePanel(panel) {
        const panelContent = document.getElementById(panel + 'PanelContent');
        if (panelContent) {
            panelContent.classList.toggle('collapsed');
        }
    }
    
    toggleDebug() {
        this.debugConsole.style.display = this.debugConsole.style.display === 'none' ? 'flex' : 'none';
    }
    
    clearDebugLog() {
        this.debugLog.innerHTML = '';
    }
    
    exportDebugLog() {
        const logs = this.debugLog.textContent;
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `remote-desktop-log-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    changeQuality(quality) {
        this.debug(`Quality changed to: ${quality}`);
        // Quality change would be implemented here
    }
    
    contextAction(action) {
        this.debug(`Context action: ${action}`);
        // Context menu actions would be implemented here
    }
    
    // Cleanup
    cleanup() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.remoteVideo.srcObject = null;
        this.localVideo.srcObject = null;
        this.videoOverlay.classList.remove('hidden');
        this.controlBtn.disabled = true;
        this.fullscreenBtn.disabled = true;
        
        document.getElementById('hostStats').style.display = 'none';
        document.getElementById('clientStats').style.display = 'none';
    }
    
    handleHostDisconnected() {
        if (this.role !== 'client') return;
        
        this.debug('Host disconnected');
        this.updateStatus('Host disconnected', 'error');
        this.cleanup();
        this.showNotification('Host disconnected', 'error');
    }
    
    handleServerShutdown() {
        this.debug('Server shutting down');
        this.updateStatus('Server shutting down', 'error');
        this.cleanup();
        this.showNotification('Server is shutting down', 'error');
    }
}

// Initialize application
const app = new RemoteDesktopApp();

// Export for use in HTML
window.app = app;