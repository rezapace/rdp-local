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
        
        // Mouse state tracking for better control
        this.mouseState = {
            isDown: false,
            lastX: 0,
            lastY: 0,
            currentButton: null
        };
        
        // Optimization: Use binary WebSocket for mouse movements
        this.mouseBinaryEnabled = true;
        this.mouseMoveBuffer = new ArrayBuffer(8); // 2 float32 values (x, y)
        this.mouseMoveView = new Float32Array(this.mouseMoveBuffer);
        
        // Optimization: Animation frame handling for input
        this.pendingMouseMoves = [];
        this.isProcessingInputs = false;
        
        // Configuration
        this.config = {
            // Performance optimization: High bandwidth, low latency configuration
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10,
            iceTransportPolicy: 'all', // 'relay' for stability over unreliable networks
            bundlePolicy: 'max-bundle', // Optimized bundle policy
            rtcpMuxPolicy: 'require', // Require RTCP muxing to reduce overhead
            sdpSemantics: 'unified-plan',
            reconnectDelay: 3000,
            statsUpdateInterval: 1000,
            controlSensitivity: 1.0, // Mouse movement sensitivity multiplier
            scrollSensitivity: 1.5,  // Scroll sensitivity multiplier
            maxBitrate: 25000,       // 25 Mbps for high quality
            codecPreferences: ['VP9', 'VP8', 'H264'],
            enableHwAcceleration: true
        };
        
        // Quality presets
        this.qualityPresets = {
            ultra: { width: 3840, height: 2160, frameRate: 60 },
            high: { width: 1920, height: 1080, frameRate: 60 },
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
        this.controlCanvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        
        // Touch events for mobile
        this.controlCanvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.controlCanvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.controlCanvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Keyboard events for remote keyboard control
        if (this.controlCanvas) {
            // Use canvas-specific keyboard events for more precise control
            this.controlCanvas.setAttribute('tabindex', '0'); // Make canvas focusable
            this.controlCanvas.style.outline = 'none'; // Remove focus outline
            this.controlCanvas.addEventListener('keydown', (e) => this.handleKeyDown(e));
            this.controlCanvas.addEventListener('keyup', (e) => this.handleKeyUp(e));
            this.controlCanvas.addEventListener('blur', () => this.handleCanvasBlur());
            
            // Add click event to ensure focus
            this.controlCanvas.addEventListener('click', () => {
                this.controlCanvas.focus();
                this.debug('Canvas focused');
            });
        }
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
        
        // Performance optimization: Enable binary type for WebSocket
        this.ws.binaryType = 'arraybuffer';
        
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
            this.updateStatus('Starting screen capture with optimized settings...');
            
            // Get quality setting
            const quality = document.getElementById('qualitySelect')?.value || 'high';
            const constraints = {
                video: {
                    cursor: document.getElementById('showCursor').checked ? 'always' : 'never',
                    displaySurface: 'monitor', // Prefer full monitor for best quality
                    logicalSurface: true,
                    frameRate: this.qualityPresets[quality]?.frameRate || 60
                },
                audio: document.getElementById('captureAudio').checked
            };
            
            // Apply quality preset
            if (quality !== 'auto' && this.qualityPresets[quality]) {
                Object.assign(constraints.video, this.qualityPresets[quality]);
            }
            
            this.debug(`Starting screen capture with constraints: ${JSON.stringify(constraints)}`);
            
            this.localStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            
            // Performance optimization: Configure video tracks for high performance
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                // Apply optimal settings to the track if supported
                if (videoTrack.applyConstraints) {
                    try {
                        // These are advanced video constraints for high performance
                        const advancedConstraints = {
                            width: { ideal: constraints.video.width || 1920 },
                            height: { ideal: constraints.video.height || 1080 },
                            frameRate: { ideal: constraints.video.frameRate || 60 },
                        };
                        
                        await videoTrack.applyConstraints(advancedConstraints);
                        this.debug(`Applied advanced constraints to video track: ${JSON.stringify(advancedConstraints)}`);
                    } catch (constraintError) {
                        this.debug(`Could not apply all constraints: ${constraintError}`, 'warning');
                    }
                }
                
                // Get actual track settings
                const settings = videoTrack.getSettings();
                this.debug(`Actual video track settings: ${JSON.stringify(settings)}`);
            }
            
            this.debug('Screen capture started with optimized settings');
            this.localVideo.srcObject = this.localStream;
            
            // Handle stream end
            this.localStream.getVideoTracks()[0].onended = () => {
                this.debug('Screen share ended by user');
                this.stopScreenShare();
            };
            
            this.updateStatus('Screen sharing active with optimized settings', 'connected');
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
            this.showNotification('Remote control enabled. Click video area for keyboard input.', 'success');
            this.debug('Remote control enabled');
            
            // Ensure canvas is properly sized and positioned
            this.resizeCanvas();
            
            // Focus the canvas to capture keyboard events
            setTimeout(() => {
                this.controlCanvas.focus();
                this.debug('Canvas focused');
            }, 100);
            
            // Add visual indicator for keyboard focus
            this.showKeyboardStatus(true);
        } else {
            this.controlBtn.textContent = 'Enable Control';
            this.videoContainer.classList.remove('control-active');
            this.controlCanvas.style.pointerEvents = 'none'; 
            this.controlCanvas.style.cursor = 'default';
            this.updateStatus('Remote control disabled');
            this.debug('Remote control disabled');
            
            // Reset mouse state
            this.mouseState.isDown = false;
            this.mouseState.currentButton = null;
            
            // Hide keyboard status
            this.showKeyboardStatus(false);
        }
    }
    
    // WebRTC methods
    createPeerConnection() {
        this.debug('Creating peer connection with optimized settings');
        
        // Create optimized configuration object
        const rtcConfig = {
            iceServers: this.config.iceServers,
            iceCandidatePoolSize: this.config.iceCandidatePoolSize,
            iceTransportPolicy: this.config.iceTransportPolicy,
            bundlePolicy: this.config.bundlePolicy,
            rtcpMuxPolicy: this.config.rtcpMuxPolicy,
            sdpSemantics: this.config.sdpSemantics
        };
        
        this.pc = new RTCPeerConnection(rtcConfig);
        
        this.pc.onicecandidate = (event) => this.handleLocalIceCandidate(event);
        this.pc.oniceconnectionstatechange = () => this.handleIceConnectionStateChange();
        this.pc.ontrack = (event) => this.handleRemoteTrack(event);
        this.pc.onconnectionstatechange = () => this.handleConnectionStateChange();
        
        // Add local stream if host
        if (this.role === 'host' && this.localStream) {
            this.debug('Adding local stream to peer connection');
            this.localStream.getTracks().forEach(track => {
                this.debug(`Adding track: ${track.kind}, enabled: ${track.enabled}`);
                this.pc.addTrack(track, this.localStream);
            });
        }
    }
    
    async createAndSendOffer() {
        try {
            this.debug('Creating optimized offer');
            
            // Set codec preferences if supported
            if (RTCRtpSender.getCapabilities && this.config.codecPreferences.length > 0) {
                try {
                    const transceivers = this.pc.getTransceivers();
                    const videoTransceiver = transceivers.find(t => 
                        t.sender && t.sender.track && t.sender.track.kind === 'video'
                    );
                    
                    if (videoTransceiver) {
                        const capabilities = RTCRtpSender.getCapabilities('video');
                        if (capabilities) {
                            const preferredCodecs = this.config.codecPreferences
                                .map(codec => capabilities.codecs.find(c => c.mimeType.toLowerCase().includes(codec.toLowerCase())))
                                .filter(codec => codec !== undefined);
                            
                            if (preferredCodecs.length > 0) {
                                const remainingCodecs = capabilities.codecs.filter(c => 
                                    !this.config.codecPreferences.some(p => 
                                        c.mimeType.toLowerCase().includes(p.toLowerCase())
                                    )
                                );
                                
                                videoTransceiver.setCodecPreferences([...preferredCodecs, ...remainingCodecs]);
                                this.debug(`Set codec preferences: ${preferredCodecs.map(c => c.mimeType).join(', ')}`);
                            }
                        }
                    }
                } catch (codecError) {
                    this.debug(`Error setting codec preferences: ${codecError}`, 'error');
                }
            }
            
            const offerOptions = {
                offerToReceiveVideo: this.role === 'client',
                offerToReceiveAudio: this.role === 'client' && document.getElementById('captureAudio')?.checked
            };
            
            const offer = await this.pc.createOffer(offerOptions);
            
            // Performance optimization: Modify SDP for high bandwidth
            let sdp = offer.sdp;
            
            // Set maximum bitrate
            if (this.config.maxBitrate > 0) {
                sdp = this.setMaxBitrate(sdp, this.config.maxBitrate);
            }
            
            // Enable hardware acceleration if configured
            if (this.config.enableHwAcceleration) {
                sdp = this.enableHardwareAcceleration(sdp);
            }
            
            const modifiedOffer = new RTCSessionDescription({
                type: offer.type,
                sdp: sdp
            });
            
            await this.pc.setLocalDescription(modifiedOffer);
            
            this.sendMessage({
                type: 'offer',
                offer: modifiedOffer,
                targetId: this.connectedPeerId
            });
            
            this.debug('Optimized offer sent');
        } catch (error) {
            this.debug(`Error creating offer: ${error}`, 'error');
        }
    }
    
    // Helper method to set max bitrate in SDP
    setMaxBitrate(sdp, bitrate) {
        const lines = sdp.split('\n');
        const videoLineIndex = lines.findIndex(line => line.startsWith('m=video'));
        
        if (videoLineIndex === -1) {
            return sdp;
        }
        
        // Find the video media section
        let mediaSection = lines.slice(videoLineIndex);
        const nextMLineIndex = mediaSection.findIndex((line, index) => index > 0 && line.startsWith('m='));
        if (nextMLineIndex !== -1) {
            mediaSection = mediaSection.slice(0, nextMLineIndex);
        }
        
        // Check if we already have a b=AS: line
        const bitrateLineIndex = mediaSection.findIndex(line => line.startsWith('b=AS:'));
        
        if (bitrateLineIndex !== -1) {
            // Replace existing bitrate line
            mediaSection[bitrateLineIndex] = `b=AS:${bitrate}`;
        } else {
            // Add new bitrate line after the m= line
            mediaSection.splice(1, 0, `b=AS:${bitrate}`, `b=TIAS:${bitrate * 1000}`);
        }
        
        // Rebuild the SDP
        lines.splice(videoLineIndex, mediaSection.length, ...mediaSection);
        return lines.join('\n');
    }
    
    // Helper method to enable hardware acceleration
    enableHardwareAcceleration(sdp) {
        // This is a simple implementation - in practice, you might want to add
        // more specific SDP modifications based on browser capabilities
        const lines = sdp.split('\n');
        
        // Add fmtp lines for hardware acceleration hints
        for (let i = 0; i < lines.length; i++) {
            // For H264, add acceleration-friendly parameters
            if (lines[i].includes('a=rtpmap:') && lines[i].includes('H264')) {
                const pt = lines[i].split(':')[1].split(' ')[0];
                
                // Check if we already have an fmtp line for this payload type
                const fmtpIndex = lines.findIndex(line => line.includes(`a=fmtp:${pt}`));
                
                if (fmtpIndex !== -1) {
                    // Add acceleration parameters if not already present
                    if (!lines[fmtpIndex].includes('profile-level-id')) {
                        lines[fmtpIndex] += ';profile-level-id=42e01f;level-asymmetry-allowed=1';
                    }
                } else {
                    // Add a new fmtp line
                    lines.splice(i + 1, 0, `a=fmtp:${pt} profile-level-id=42e01f;level-asymmetry-allowed=1`);
                    i++; // Skip the newly inserted line
                }
            }
        }
        
        return lines.join('\n');
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
        
        // Get canvas rectangle once to avoid recalculating
        const rect = this.controlCanvas.getBoundingClientRect();
        
        // Calculate normalized coordinates (0-1)
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        // Calculate delta (for relative movement option)
        const deltaX = x - this.mouseState.lastX;
        const deltaY = y - this.mouseState.lastY;
        
        // Update last position
        this.mouseState.lastX = x;
        this.mouseState.lastY = y;
        
        // Only send if there's meaningful movement
        if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001) {
            // Performance optimization: Use requestAnimationFrame to batch mouse moves
            this.pendingMouseMoves.push({ x, y, deltaX, deltaY });
            
            if (!this.isProcessingInputs) {
                this.isProcessingInputs = true;
                requestAnimationFrame(() => this.processPendingInputs());
            }
        }
    }
    
    // Process batched input events
    processPendingInputs() {
        // Process mouse moves (taking only the latest)
        if (this.pendingMouseMoves.length > 0) {
            // Get the most recent mouse position
            const latest = this.pendingMouseMoves[this.pendingMouseMoves.length - 1];
            
            // Performance optimization: Use binary format for mouse moves when possible
            if (this.mouseBinaryEnabled && this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Pack the x,y coordinates into a binary buffer
                this.mouseMoveView[0] = latest.x;
                this.mouseMoveView[1] = latest.y;
                this.ws.send(this.mouseMoveBuffer);
            } else {
                // Fallback to JSON for browsers that don't support binary websockets
                this.sendControlCommand('mousemove', {
                    x: latest.x,
                    y: latest.y,
                    deltaX: latest.deltaX * this.config.controlSensitivity,
                    deltaY: latest.deltaY * this.config.controlSensitivity,
                    relative: true
                });
            }
            
            // Clear the queue
            this.pendingMouseMoves = [];
        }
        
        // Reset processing flag, but only if queue is empty
        this.isProcessingInputs = false;
    }
    
    handleMouseDown(event) {
        if (!this.isControlEnabled) return;
        
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        // Remember last position for relative movement
        this.mouseState.lastX = x;
        this.mouseState.lastY = y;
        this.mouseState.isDown = true;
        this.mouseState.currentButton = event.button;
        
        this.debug(`Mouse down: ${x.toFixed(2)}, ${y.toFixed(2)}, button: ${event.button}`);
        this.sendControlCommand('mousedown', { x, y, button: event.button });
        
        // Focus canvas to capture keyboard events
        this.controlCanvas.focus();
        this.showKeyboardStatus(true);
    }
    
    handleMouseUp(event) {
        if (!this.isControlEnabled) return;
        
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        // Update state
        this.mouseState.isDown = false;
        this.mouseState.currentButton = null;
        
        this.debug(`Mouse up: ${x.toFixed(2)}, ${y.toFixed(2)}, button: ${event.button}`);
        this.sendControlCommand('mouseup', { x, y, button: event.button });
    }
    
    handleContextMenu(event) {
        if (this.isControlEnabled) {
            event.preventDefault();
            
            const rect = this.controlCanvas.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            
            this.sendControlCommand('rightclick', { x, y });
        }
    }
    
    handleWheel(event) {
        if (!this.isControlEnabled) return;
        
        // Always prevent default scrolling when control is enabled
        event.preventDefault();
        
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        // Apply sensitivity to scroll amount
        const deltaY = event.deltaY * this.config.scrollSensitivity;
        const deltaX = event.deltaX * this.config.scrollSensitivity;
        
        // Include horizontal scroll for trackpads
        this.sendControlCommand('wheel', { 
            x, 
            y, 
            deltaY,
            deltaX,
            mode: event.deltaMode // 0: pixel, 1: line, 2: page
        });
    }
    
    // New keyboard event handlers
    handleKeyDown(event) {
        if (!this.isControlEnabled) return;
        
        // Show visual feedback
        this.showKeyPress(event.key);
        
        // Prevent browser shortcuts except for some essential ones
        if (!event.ctrlKey || (event.ctrlKey && !['f', 'r', 't', 'w'].includes(event.key.toLowerCase()))) {
            // Prevent default for most keys to avoid browser shortcuts interference
            event.preventDefault();
        }
        
        const keyData = {
            key: event.key,
            code: event.code,
            keyCode: event.keyCode,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey, 
            altKey: event.altKey,
            metaKey: event.metaKey
        };
        
        this.debug(`Key down: ${event.key} (${event.code})`, 'info');
        this.sendControlCommand('keydown', keyData);
    }
    
    handleKeyUp(event) {
        if (!this.isControlEnabled) return;
        
        // Always prevent default to avoid unexpected behavior
        event.preventDefault();
        
        const keyData = {
            key: event.key,
            code: event.code,
            keyCode: event.keyCode,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey
        };
        
        this.debug(`Key up: ${event.key} (${event.code})`);
        this.sendControlCommand('keyup', keyData);
    }
    
    handleCanvasBlur() {
        // When canvas loses focus, ensure all keys that might be 'down' are released
        if (this.isControlEnabled && this.mouseState.isDown) {
            // Auto-release any pressed mouse buttons
            this.sendControlCommand('mouseup', { 
                x: this.mouseState.lastX, 
                y: this.mouseState.lastY, 
                button: this.mouseState.currentButton || 0
            });
            
            this.mouseState.isDown = false;
            this.mouseState.currentButton = null;
            
            this.debug('Canvas lost focus - released buttons');
        }
    }
    
    // Touch events with improved handling
    handleTouchStart(event) {
        if (!this.isControlEnabled) return;
        event.preventDefault();
        
        const touch = event.touches[0];
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;
        
        // Store touch position for relative movement
        this.mouseState.lastX = x;
        this.mouseState.lastY = y;
        this.mouseState.isDown = true;
        this.mouseState.currentButton = 0; // Left click
        
        this.sendControlCommand('mousedown', { x, y, button: 0 });
    }
    
    handleTouchMove(event) {
        if (!this.isControlEnabled) return;
        event.preventDefault();
        
        const touch = event.touches[0];
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;
        
        // Calculate deltas for relative movement
        const deltaX = x - this.mouseState.lastX;
        const deltaY = y - this.mouseState.lastY;
        
        // Update last position
        this.mouseState.lastX = x;
        this.mouseState.lastY = y;
        
        // Throttle touch move events
        if (!this.lastTouchMove || Date.now() - this.lastTouchMove > 16) {
            this.sendControlCommand('mousemove', { 
                x, 
                y, 
                deltaX: deltaX * this.config.controlSensitivity,
                deltaY: deltaY * this.config.controlSensitivity,
                relative: true
            });
            this.lastTouchMove = Date.now();
        }
    }
    
    handleTouchEnd(event) {
        if (!this.isControlEnabled) return;
        event.preventDefault();
        
        const lastX = this.mouseState.lastX;
        const lastY = this.mouseState.lastY;
        
        // Reset state
        this.mouseState.isDown = false;
        this.mouseState.currentButton = null;
        
        // Send mouseup at the last known position
        this.sendControlCommand('mouseup', { x: lastX, y: lastY, button: 0 });
    }
    
    // Simulate two-finger scroll for touch devices
    handleTouchScroll(event) {
        if (!this.isControlEnabled || event.touches.length !== 2) return;
        event.preventDefault();
        
        // Calculate the center point between the two touches
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        
        const rect = this.controlCanvas.getBoundingClientRect();
        const x = ((touch1.clientX + touch2.clientX) / 2 - rect.left) / rect.width;
        const y = ((touch1.clientY + touch2.clientY) / 2 - rect.top) / rect.height;
        
        // Use distance between touches to determine scroll amount
        const currentDist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        
        if (this.lastPinchDist) {
            const deltaY = (this.lastPinchDist - currentDist) * 2 * this.config.scrollSensitivity;
            this.sendControlCommand('wheel', { x, y, deltaY, mode: 0 });
        }
        
        this.lastPinchDist = currentDist;
    }
    
    sendControlCommand(action, data) {
        this.sendMessage({
            type: 'control',
            action: action,
            ...data,
            targetId: this.connectedPeerId
        });
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
            connection: null,
            bandwidth: { current: 0, available: 0, utilization: 0 }
        };
        
        let totalBitrate = 0;
        
        stats.forEach(report => {
            if (report.type === 'inbound-rtp') {
                if (report.mediaType === 'video') {
                    const bitrate = this.calculateBitrate(report.bytesReceived, report.timestamp);
                    processed.video.inbound = {
                        fps: report.framesPerSecond || 0,
                        resolution: `${report.frameWidth || 0}x${report.frameHeight || 0}`,
                        bitrate: bitrate,
                        packetsLost: report.packetsLost || 0,
                        jitter: report.jitter ? (report.jitter * 1000).toFixed(2) : 'N/A',
                        framesDropped: report.framesDropped || 0,
                        framesDecoded: report.framesDecoded || 0
                    };
                    totalBitrate += Number(bitrate);
                } else if (report.mediaType === 'audio') {
                    const bitrate = this.calculateBitrate(report.bytesReceived, report.timestamp);
                    processed.audio.inbound = {
                        bitrate: bitrate,
                        packetsLost: report.packetsLost || 0,
                        jitter: report.jitter ? (report.jitter * 1000).toFixed(2) : 'N/A'
                    };
                    totalBitrate += Number(bitrate);
                }
            } else if (report.type === 'outbound-rtp') {
                if (report.mediaType === 'video') {
                    const bitrate = this.calculateBitrate(report.bytesSent, report.timestamp);
                    processed.video.outbound = {
                        fps: report.framesPerSecond || 0,
                        resolution: `${report.frameWidth || 0}x${report.frameHeight || 0}`,
                        bitrate: bitrate,
                        packetsSent: report.packetsSent || 0,
                        framesSent: report.framesSent || 0,
                        hugeFramesSent: report.hugeFramesSent || 0
                    };
                    totalBitrate += Number(bitrate);
                } else if (report.mediaType === 'audio') {
                    const bitrate = this.calculateBitrate(report.bytesSent, report.timestamp);
                    processed.audio.outbound = {
                        bitrate: bitrate,
                        packetsSent: report.packetsSent || 0
                    };
                    totalBitrate += Number(bitrate);
                }
            } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                processed.connection = {
                    rtt: report.currentRoundTripTime ? (report.currentRoundTripTime * 1000).toFixed(0) : 'N/A',
                    localAddress: report.local?.address || 'N/A',
                    remoteAddress: report.remote?.address || 'N/A',
                    totalRoundTripTime: report.totalRoundTripTime || 0,
                    availableOutgoingBitrate: report.availableOutgoingBitrate
                };
                
                // Track bandwidth utilization
                if (report.availableOutgoingBitrate) {
                    processed.bandwidth = {
                        current: totalBitrate,
                        available: Math.round(report.availableOutgoingBitrate / 1000),
                        utilization: Math.min(100, Math.round((totalBitrate * 1000 / report.availableOutgoingBitrate) * 100))
                    };
                }
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
                <div>FPS:</div><div>${stats.video.outbound.fps || 'N/A'}</div>
                <div>Resolution:</div><div>${stats.video.outbound.resolution || 'N/A'}</div>
                <div>Bitrate:</div><div>${stats.video.outbound.bitrate || 0} Kbps</div>
                <div>Frames Sent:</div><div>${stats.video.outbound.framesSent || 0}</div>
            `;
        } else if (this.role === 'client' && stats.video.inbound) {
            html += `
                <div>FPS:</div><div>${stats.video.inbound.fps || 'N/A'}</div>
                <div>Resolution:</div><div>${stats.video.inbound.resolution || 'N/A'}</div>
                <div>Bitrate:</div><div>${stats.video.inbound.bitrate || 0} Kbps</div>
                <div>Frames Dropped:</div><div>${stats.video.inbound.framesDropped || 0}</div>
            `;
        }
        
        if (stats.connection) {
            html += `
                <div>RTT:</div><div>${stats.connection.rtt || 'N/A'} ms</div>
                <div>Connection:</div><div>${stats.connection.localAddress.includes(':') ? 'IPv6' : 'IPv4'}</div>
            `;
        }
        
        // Add bandwidth utilization information
        if (stats.bandwidth && stats.bandwidth.available > 0) {
            const utilizationClass = stats.bandwidth.utilization > 90 ? 'high-utilization' : 
                                   stats.bandwidth.utilization > 70 ? 'medium-utilization' : 'low-utilization';
            
            html += `
                <div>Bandwidth:</div><div>${stats.bandwidth.current}/${stats.bandwidth.available} Kbps</div>
                <div>Utilization:</div><div class="${utilizationClass}">${stats.bandwidth.utilization}%</div>
            `;
        }
        
        statsGrid.innerHTML = html;
        
        // Update stats every second to avoid UI freezing
        if (!this.statsDomUpdateInterval) {
            this.statsDomUpdateInterval = setInterval(() => {
                if (this.lastStatsData) {
                    this.displayStats(this.lastStatsData);
                }
            }, 1000);
        }
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
    
    // Add new methods for keyboard visual feedback
    showKeyboardStatus(active) {
        // Create or update keyboard indicator
        if (!this.keyboardIndicator) {
            this.keyboardIndicator = document.createElement('div');
            this.keyboardIndicator.className = 'keyboard-indicator';
            this.keyboardIndicator.innerHTML = '<i class="fas fa-keyboard"></i> Keyboard Ready';
            this.keyboardIndicator.style.position = 'absolute';
            this.keyboardIndicator.style.bottom = '10px';
            this.keyboardIndicator.style.left = '10px';
            this.keyboardIndicator.style.padding = '5px 10px';
            this.keyboardIndicator.style.background = 'rgba(0,0,0,0.7)';
            this.keyboardIndicator.style.color = '#fff';
            this.keyboardIndicator.style.borderRadius = '4px';
            this.keyboardIndicator.style.fontSize = '12px';
            this.keyboardIndicator.style.zIndex = '100';
            this.videoContainer.appendChild(this.keyboardIndicator);
        }
        
        this.keyboardIndicator.style.display = active ? 'block' : 'none';
        if (active) {
            this.keyboardIndicator.style.backgroundColor = 'rgba(74, 144, 226, 0.7)';
        }
    }
    
    showKeyPress(key) {
        // Make it visually obvious that a key was pressed
        if (!this.keyPressIndicator) {
            this.keyPressIndicator = document.createElement('div');
            this.keyPressIndicator.style.position = 'absolute';
            this.keyPressIndicator.style.top = '10px';
            this.keyPressIndicator.style.right = '10px';
            this.keyPressIndicator.style.padding = '5px 10px';
            this.keyPressIndicator.style.background = 'rgba(92, 184, 92, 0.7)';
            this.keyPressIndicator.style.color = '#fff';
            this.keyPressIndicator.style.borderRadius = '4px';
            this.keyPressIndicator.style.fontSize = '12px';
            this.keyPressIndicator.style.zIndex = '100';
            this.keyPressIndicator.style.transition = 'opacity 0.5s';
            this.videoContainer.appendChild(this.keyPressIndicator);
        }
        
        // Show special keys in a readable format
        const displayKey = key.length > 1 ? `[${key}]` : key;
        this.keyPressIndicator.textContent = `Key: ${displayKey}`;
        this.keyPressIndicator.style.opacity = '1';
        
        clearTimeout(this.keyPressTimeout);
        this.keyPressTimeout = setTimeout(() => {
            this.keyPressIndicator.style.opacity = '0';
        }, 1000);
    }
}

// Initialize application
const app = new RemoteDesktopApp();

// Export for use in HTML
window.app = app;