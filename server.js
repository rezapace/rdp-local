const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Try to load robotjs - if it fails, we'll work without it
let robot = null;
try {
    robot = require('robotjs');
    console.log('✅ RobotJS loaded successfully');
} catch (error) {
    console.log('⚠️  RobotJS not available - remote control will be simulated');
}

// Use environment variable or default port
const PORT = process.env.PORT || 9000;

// Create HTTP server to serve static files
const server = http.createServer((req, res) => {
    // Print request info for debugging
    console.log(`Received request for: ${req.url} from ${req.socket.remoteAddress}`);
    
    // Handle static file requests
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    // Get the file extension
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    // Set proper content type
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
        case '.jpeg':
            contentType = 'image/jpeg';
            break;
    }
    
    // Read the file
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // File not found - handle app.js specially
                if (filePath === './app.js') {
                    fs.readFile('./app.js', (err, data) => {
                        if (err) {
                            res.writeHead(404);
                            res.end('app.js not found');
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'text/javascript' });
                        res.end(data, 'utf-8');
                    });
                    return;
                }
                
                res.writeHead(404);
                res.end(`File not found: ${filePath}`);
            } else {
                res.writeHead(500);
                res.end(`Server error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map();
let clientIdCounter = 0;

// Store hosts and viewers
const hosts = new Map();
const viewers = new Map();

// Performance optimization: Direct peer references
const clientPeers = new Map(); // Maps clientId to their peer's client object

// Performance optimization: Mouse movement batching
const mouseState = new Map(); // Track last mouse position for each client
const MOUSE_THRESHOLD = 2; // Minimum pixel change to process

// Performance optimization: Modifier key state caching
const keyboardState = new Map(); // Track modifier keys state for each client

// Performance optimization: Event priority handling
const EVENT_PRIORITIES = {
    'mousemove': 1, // Highest priority (lowest number)
    'wheel': 2,
    'mousedown': 3,
    'mouseup': 3,
    'click': 4,
    'rightclick': 4,
    'keydown': 5,
    'keyup': 5
};

// Get local IP addresses
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    
    return addresses;
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
    const clientId = ++clientIdCounter;
    const clientIp = req.socket.remoteAddress;
    
    console.log(`[Client ${clientId}] Connected from ${clientIp}`);
    
    // Performance optimization: Set binary type for WebSocket
    ws.binaryType = 'arraybuffer';
    
    // Store client
    const client = {
        id: clientId,
        ws: ws,
        role: null,
        ip: clientIp,
        ready: false,
        // Performance optimization: Track last event time
        lastEventTime: Date.now(),
        // Performance optimization: Event queue for priority handling
        eventQueue: []
    };
    
    clients.set(clientId, client);
    
    // Initialize tracking states
    mouseState.set(clientId, { x: 0, y: 0, lastUpdate: 0 });
    keyboardState.set(clientId, {
        shift: false,
        control: false,
        alt: false,
        command: false
    });
    
    // Handle messages
    ws.on('message', (message) => {
        try {
            // Performance optimization: Handle binary messages for mouse movement
            if (message instanceof ArrayBuffer) {
                if (client.role === 'client' && message.byteLength === 8) {
                    const view = new Float32Array(message);
                    handleBinaryMouseMove(client, {
                        x: view[0],
                        y: view[1]
                    });
                    return;
                }
            }
            
            const data = JSON.parse(message);
            console.log(`[Client ${clientId}] Message: ${data.type}`);
            
            // Performance optimization: Update last event time
            client.lastEventTime = Date.now();
            
            switch(data.type) {
                case 'register':
                    handleRegister(client, data);
                    break;
                    
                case 'host-ready':
                    handleHostReady(client);
                    break;
                    
                case 'host-stopped':
                    handleHostStopped(client);
                    break;
                    
                case 'connect-to-host':
                    handleConnectToHost(client, data);
                    break;
                    
                case 'offer':
                    handleOffer(client, data);
                    break;
                    
                case 'answer':
                    handleAnswer(client, data);
                    break;
                    
                case 'ice-candidate':
                    handleIceCandidate(client, data);
                    break;
                    
                case 'control':
                    // Performance optimization: Add to queue for priority handling
                    if (EVENT_PRIORITIES[data.action]) {
                        client.eventQueue.push(data);
                        processEventQueue(client);
                    } else {
                        handleControl(client, data);
                    }
                    break;
            }
        } catch (error) {
            console.error(`[Client ${clientId}] Error:`, error);
        }
    });
    
    // Handle disconnect
    ws.on('close', () => {
        console.log(`[Client ${clientId}] Disconnected`);
        
        // Remove from maps
        if (client.role === 'host') {
            hosts.delete(clientId);
            
            // Notify all viewers
            viewers.forEach((viewer) => {
                sendToClient(viewer, {
                    type: 'host-disconnected',
                    hostId: clientId
                });
            });
        } else if (client.role === 'client') {
            viewers.delete(clientId);
        }
        
        // Performance optimization: Clean up all client-related resources
        clients.delete(clientId);
        mouseState.delete(clientId);
        keyboardState.delete(clientId);
        
        // Clean up peer references
        if (clientPeers.has(clientId)) {
            clientPeers.delete(clientId);
        }
    });
    
    // Handle errors
    ws.on('error', (error) => {
        console.error(`[Client ${clientId}] WebSocket error:`, error);
    });
});

// Process event queue based on priority
function processEventQueue(client) {
    if (client.eventQueue.length === 0) return;
    
    // Sort queue by priority
    client.eventQueue.sort((a, b) => 
        (EVENT_PRIORITIES[a.action] || 99) - (EVENT_PRIORITIES[b.action] || 99)
    );
    
    // Process highest priority event
    const event = client.eventQueue.shift();
    handleControl(client, event);
    
    // If there are more events, process them in the next tick
    if (client.eventQueue.length > 0) {
        setImmediate(() => processEventQueue(client));
    }
}

// Handle binary mouse move data
function handleBinaryMouseMove(client, data) {
    // Only process if client role is correct
    if (client.role !== 'client') return;
    
    // Performance optimization: UDP-style delivery (drop if too frequent)
    const now = Date.now();
    const lastState = mouseState.get(client.id);
    
    // Drop events that come too quickly (5ms threshold)
    if (now - lastState.lastUpdate < 5) return;
    
    // Performance optimization: Skip if movement is below threshold
    const screenSize = robot ? robot.getScreenSize() : { width: 1920, height: 1080 };
    const newX = Math.round(data.x * screenSize.width);
    const newY = Math.round(data.y * screenSize.height);
    
    const deltaX = Math.abs(newX - lastState.x);
    const deltaY = Math.abs(newY - lastState.y);
    
    if (deltaX < MOUSE_THRESHOLD && deltaY < MOUSE_THRESHOLD) return;
    
    // Update state
    mouseState.set(client.id, {
        x: newX,
        y: newY,
        lastUpdate: now
    });
    
    // Create minimal control data for forwarding
    const minimalData = {
        action: 'mousemove',
        x: data.x,
        y: data.y
    };
    
    // Forward to all hosts with minimal data
    hosts.forEach((host) => {
        sendToClient(host, {
            type: 'control',
            ...minimalData,
            fromId: client.id
        });
    });
    
    // If robotjs is available, perform the action
    if (robot) {
        try {
            robot.moveMouse(newX, newY);
        } catch (error) {
            console.error(`RobotJS error: ${error.message}`, error);
        }
    }
}

// Send message to specific client
function sendToClient(client, data) {
    if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(data));
    }
}

// Handle registration
function handleRegister(client, data) {
    client.role = data.role;
    
    if (data.role === 'host') {
        hosts.set(client.id, client);
        console.log(`[Client ${client.id}] Registered as HOST`);
    } else if (data.role === 'client') {
        viewers.set(client.id, client);
        console.log(`[Client ${client.id}] Registered as CLIENT`);
        
        // Check if any host is ready
        hosts.forEach((host) => {
            if (host.ready) {
                sendToClient(client, {
                    type: 'host-available',
                    hostId: host.id
                });
                
                // Tell host about the viewer
                sendToClient(host, {
                    type: 'client-joined',
                    clientId: client.id
                });
            }
        });
    }
    
    // Send confirmation
    sendToClient(client, {
        type: 'registered',
        clientId: client.id,
        role: client.role
    });
}

// Handle host ready
function handleHostReady(host) {
    host.ready = true;
    console.log(`[Host ${host.id}] Ready to share`);
    
    // Notify all viewers
    viewers.forEach((viewer) => {
        sendToClient(viewer, {
            type: 'host-available',
            hostId: host.id
        });
        
        // Tell host about the viewer
        sendToClient(host, {
            type: 'client-joined',
            clientId: viewer.id
        });
    });
}

// Handle host stopped
function handleHostStopped(host) {
    host.ready = false;
    console.log(`[Host ${host.id}] Stopped sharing`);
    
    // Notify all viewers
    viewers.forEach((viewer) => {
        sendToClient(viewer, {
            type: 'host-stopped',
            hostId: host.id
        });
    });
}

// Handle connect to host
function handleConnectToHost(client, data) {
    console.log(`[Client ${client.id}] Trying to connect to host: ${data.hostId}`);
    
    const host = clients.get(parseInt(data.hostId));
    if (host && host.role === 'host' && host.ready) {
        console.log(`[Client ${client.id}] Host found and ready`);
        
        // Tell client about host
        sendToClient(client, {
            type: 'host-available',
            hostId: host.id
        });
        
        // Tell host about client
        sendToClient(host, {
            type: 'client-joined',
            clientId: client.id
        });
    } else {
        console.log(`[Client ${client.id}] Host not found or not ready`);
        sendToClient(client, {
            type: 'error',
            message: 'Host not found or not ready'
        });
    }
}

// Handle WebRTC offer
function handleOffer(client, data) {
    const targetId = data.targetId || findPeerForClient(client.id);
    console.log(`[Client ${client.id}] Sending offer to ${targetId}`);
    
    const target = clients.get(parseInt(targetId));
    if (target && target.ws.readyState === WebSocket.OPEN) {
        // Performance optimization: Store direct peer reference
        clientPeers.set(client.id, target);
        clientPeers.set(target.id, client);
        
        sendToClient(target, {
            type: 'offer',
            offer: data.offer,
            fromId: client.id
        });
    } else {
        console.log(`[Client ${client.id}] Target ${targetId} not found or not connected`);
    }
}

// Helper to find a peer for a client
function findPeerForClient(clientId) {
    const client = clients.get(clientId);
    if (!client) return null;
    
    if (client.role === 'host') {
        // Find the first viewer
        for (const [id, viewer] of viewers) {
            return id;
        }
    } else {
        // Find the first host
        for (const [id, host] of hosts) {
            if (host.ready) {
                return id;
            }
        }
    }
    
    return null;
}

// Handle WebRTC answer
function handleAnswer(client, data) {
    const targetId = data.targetId || findPeerForClient(client.id);
    console.log(`[Client ${client.id}] Sending answer to ${targetId}`);
    
    const target = clients.get(parseInt(targetId));
    if (target && target.ws.readyState === WebSocket.OPEN) {
        sendToClient(target, {
            type: 'answer',
            answer: data.answer,
            fromId: client.id
        });
    } else {
        console.log(`[Client ${client.id}] Target ${targetId} not found or not connected`);
    }
}

// Handle ICE candidate
function handleIceCandidate(client, data) {
    console.log(`[Client ${client.id}] Forwarding ICE candidate`);
    
    // Forward to specific target if provided
    if (data.targetId) {
        const target = clients.get(parseInt(data.targetId));
        if (target && target.ws.readyState === WebSocket.OPEN) {
            sendToClient(target, {
                type: 'ice-candidate',
                candidate: data.candidate,
                fromId: client.id
            });
        }
    } else {
        // Broadcast to all clients with different role
        clients.forEach((otherClient) => {
            if (otherClient.id !== client.id && otherClient.role !== client.role) {
                sendToClient(otherClient, {
                    type: 'ice-candidate',
                    candidate: data.candidate,
                    fromId: client.id
                });
            }
        });
    }
}

// Handle remote control
function handleControl(client, data) {
    if (client.role !== 'client') return;
    
    console.log(`[Client ${client.id}] Control: ${data.action}`);
    
    // Performance optimization: Create minimal data object for forwarding
    const minimalData = {
        type: 'control',
        action: data.action,
        fromId: client.id
    };
    
    // Only include necessary properties based on action type
    switch(data.action) {
        case 'mousemove':
            minimalData.x = data.x;
            minimalData.y = data.y;
            if (data.relative) {
                minimalData.relative = true;
                minimalData.deltaX = data.deltaX;
                minimalData.deltaY = data.deltaY;
            }
            break;
            
        case 'mousedown':
        case 'mouseup':
        case 'click':
        case 'rightclick':
            minimalData.x = data.x;
            minimalData.y = data.y;
            if (data.button !== undefined) minimalData.button = data.button;
            break;
            
        case 'wheel':
            minimalData.x = data.x;
            minimalData.y = data.y;
            if (data.deltaX) minimalData.deltaX = data.deltaX;
            if (data.deltaY) minimalData.deltaY = data.deltaY;
            if (data.mode !== undefined) minimalData.mode = data.mode;
            break;
            
        case 'keydown':
        case 'keyup':
            minimalData.key = data.key;
            minimalData.code = data.code;
            if (data.shiftKey) minimalData.shiftKey = true;
            if (data.ctrlKey) minimalData.ctrlKey = true;
            if (data.altKey) minimalData.altKey = true;
            if (data.metaKey) minimalData.metaKey = true;
            break;
            
        default:
            // For unknown actions, forward the original data
            Object.assign(minimalData, data);
    }
    
    // Forward to all hosts
    hosts.forEach((host) => {
        sendToClient(host, minimalData);
    });
    
    // If robotjs is available, perform the action
    if (robot) {
        try {
            const screenSize = robot.getScreenSize();
            // Map button values: 0 = left, 1 = middle, 2 = right
            const buttonMap = ['left', 'middle', 'right'];
            
            switch(data.action) {
                case 'mousemove':
                    // Performance optimization: Skip redundant mouse movements
                    if (data.relative && typeof data.deltaX === 'number' && typeof data.deltaY === 'number') {
                        // Get current mouse position
                        const currentPos = robot.getMousePos();
                        // Calculate new position using deltas
                        const moveX = currentPos.x + Math.round(data.deltaX * screenSize.width);
                        const moveY = currentPos.y + Math.round(data.deltaY * screenSize.height);
                        
                        // Only move if delta is significant
                        const deltaX = Math.abs(moveX - currentPos.x);
                        const deltaY = Math.abs(moveY - currentPos.y);
                        
                        if (deltaX >= MOUSE_THRESHOLD || deltaY >= MOUSE_THRESHOLD) {
                            // Ensure within screen bounds
                            const boundedX = Math.max(0, Math.min(screenSize.width - 1, moveX));
                            const boundedY = Math.max(0, Math.min(screenSize.height - 1, moveY));
                            robot.moveMouse(boundedX, boundedY);
                        }
                    } else {
                        // Use absolute positioning
                        const x = Math.round(data.x * screenSize.width);
                        const y = Math.round(data.y * screenSize.height);
                        
                        // Get current mouse position and check if movement is significant
                        const currentPos = robot.getMousePos();
                        const deltaX = Math.abs(x - currentPos.x);
                        const deltaY = Math.abs(y - currentPos.y);
                        
                        if (deltaX >= MOUSE_THRESHOLD || deltaY >= MOUSE_THRESHOLD) {
                            robot.moveMouse(x, y);
                        }
                    }
                    break;
                    
                case 'mousedown':
                    const downX = Math.round(data.x * screenSize.width);
                    const downY = Math.round(data.y * screenSize.height);
                    robot.moveMouse(downX, downY);
                    
                    const button = buttonMap[data.button] || 'left';
                    console.log(`[Control] Mouse down: ${downX},${downY} button: ${button}`);
                    robot.mouseToggle('down', button);
                    break;
                    
                case 'mouseup':
                    const upX = Math.round(data.x * screenSize.width);
                    const upY = Math.round(data.y * screenSize.height);
                    robot.moveMouse(upX, upY);
                    
                    const upButton = buttonMap[data.button] || 'left';
                    console.log(`[Control] Mouse up: ${upX},${upY} button: ${upButton}`);
                    robot.mouseToggle('up', upButton);
                    break;
                
                case 'click':
                    const clickX = Math.round(data.x * screenSize.width);
                    const clickY = Math.round(data.y * screenSize.height);
                    robot.moveMouse(clickX, clickY);
                    robot.mouseClick(buttonMap[data.button] || 'left');
                    break;
                
                case 'rightclick':
                    const rclickX = Math.round(data.x * screenSize.width);
                    const rclickY = Math.round(data.y * screenSize.height);
                    robot.moveMouse(rclickX, rclickY);
                    robot.mouseClick('right');
                    break;
                    
                case 'wheel':
                    // Handle both vertical and horizontal scrolling
                    // Ensure mouse is at the right position
                    const scrollX = Math.round(data.x * screenSize.width);
                    const scrollY = Math.round(data.y * screenSize.height);
                    robot.moveMouse(scrollX, scrollY);
                    
                    // Normalize scroll amounts - invert deltaY to match natural scroll direction
                    // Use mode to determine the scale factor (0=pixels, 1=lines, 2=pages)
                    let vScroll = 0, hScroll = 0;
                    const scaleFactor = data.mode === 1 ? 15 : data.mode === 2 ? 50 : 1;
                    
                    if (data.deltaY) {
                        // Note: robotjs expects positive values to scroll down
                        vScroll = Math.sign(data.deltaY) * Math.min(Math.abs(data.deltaY / scaleFactor), 100);
                    }
                    
                    if (data.deltaX) {
                        // Note: robotjs expects positive values to scroll right
                        hScroll = Math.sign(data.deltaX) * Math.min(Math.abs(data.deltaX / scaleFactor), 100);
                    }
                    
                    console.log(`[Control] Scroll: v=${vScroll}, h=${hScroll}`);
                    robot.scrollMouse(hScroll, vScroll);
                    break;
                
                // Performance optimization: Cached modifier state for keyboard events
                case 'keydown':
                    console.log(`[Keyboard] DOWN: ${data.key} (${data.code})`);
                    handleKeyboardEvent(client, data, true);
                    break;
                    
                case 'keyup':
                    console.log(`[Keyboard] UP: ${data.key} (${data.code})`);
                    handleKeyboardEvent(client, data, false);
                    break;
            }
        } catch (error) {
            console.error(`RobotJS error: ${error.message}`, error);
        }
    } else {
        if (data.action === 'keydown' || data.action === 'keyup') {
            console.log(`[NO ROBOTJS] ${data.action} ${data.key} (${data.code}). Install RobotJS for keyboard control.`);
        }
    }
}

// Helper function to handle keyboard events
function handleKeyboardEvent(client, data, isDown) {
    if (!robot) {
        console.log(`[Warning] RobotJS not available - cannot process keyboard events`);
        return;
    }
    
    try {
        const action = isDown ? 'down' : 'up';
        
        // Map common key codes to robotjs-compatible key strings
        const key = mapKeyToRobotJS(data.key, data.code);
        
        if (!key) {
            console.log(`[Control] Unsupported key: ${data.key} (${data.code})`);
            return;
        }
        
        console.log(`[Control] Key ${action}: ${key}`);
        
        // Performance optimization: Use cached state for modifier keys
        const clientKeyState = keyboardState.get(client.id);
        
        // Handle modifier keys with state caching
        if (['shift', 'control', 'alt', 'command'].includes(key)) {
            // Update cached state
            clientKeyState[key] = isDown;
            
            robot.keyToggle(key, action);
            console.log(`[RobotJS] Toggled modifier: ${key} ${action}`);
            return;
        }
        
        // Handle regular keys with modifiers
        const modifiers = [];
        if (data.shiftKey) modifiers.push('shift');
        if (data.ctrlKey) modifiers.push('control');
        if (data.altKey) modifiers.push('alt');
        if (data.metaKey) modifiers.push('command');
        
        // Performance optimization: Only toggle modifiers that changed state
        if (isDown) {
            // Activate modifiers
            modifiers.forEach(mod => {
                if (!clientKeyState[mod]) {
                    clientKeyState[mod] = true;
                    robot.keyToggle(mod, 'down');
                    console.log(`[RobotJS] Modifier down: ${mod}`);
                }
            });
            
            // Press main key
            robot.keyToggle(key, 'down');
            console.log(`[RobotJS] Key down: ${key}`);
        }
        // For key up, release the key then toggle off modifiers
        else {
            // Release main key
            robot.keyToggle(key, 'up');
            console.log(`[RobotJS] Key up: ${key}`);
            
            // Only release modifiers that are no longer needed
            Object.keys(clientKeyState).forEach(mod => {
                if (clientKeyState[mod] && !modifiers.includes(mod)) {
                    clientKeyState[mod] = false;
                    robot.keyToggle(mod, 'up');
                    console.log(`[RobotJS] Modifier up: ${mod}`);
                }
            });
        }
    } catch (error) {
        console.error(`Keyboard control error for ${data.key}: ${error.message}`);
        console.error(error);
    }
}

// Map browser key codes/values to robotjs-compatible key strings
function mapKeyToRobotJS(key, code) {
    // Special keys mapping
    const specialKeys = {
        'Backspace': 'backspace',
        'Tab': 'tab',
        'Enter': 'enter',
        'Escape': 'escape',
        'Space': 'space',
        'ArrowLeft': 'left',
        'ArrowUp': 'up',
        'ArrowRight': 'right',
        'ArrowDown': 'down',
        'Delete': 'delete',
        'Home': 'home',
        'End': 'end',
        'PageUp': 'pageup',
        'PageDown': 'pagedown',
        'CapsLock': 'capslock',
        'Control': 'control',
        'Alt': 'alt',
        'Shift': 'shift',
        'Meta': 'command'
    };
    
    // Function keys
    if (code && code.startsWith('F') && code.length > 1) {
        const fNum = code.substring(1);
        if (!isNaN(parseInt(fNum)) && parseInt(fNum) >= 1 && parseInt(fNum) <= 12) {
            return `f${fNum}`;
        }
    }
    
    // Special keys
    if (specialKeys[key]) {
        return specialKeys[key];
    }
    
    // Regular single character keys
    if (key && key.length === 1) {
        return key.toLowerCase();
    }
    
    return null;
}

// Function to test network interfaces
function testNetworkInterfaces() {
    const interfaces = os.networkInterfaces();
    console.log('\nNetwork Interface Details:');
    for (const name of Object.keys(interfaces)) {
        console.log(`Interface: ${name}`);
        for (const iface of interfaces[name]) {
            console.log(`  ${iface.family}: ${iface.address} ${iface.internal ? '(internal)' : '(external)'}`);
        }
    }
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n==========================================');
    console.log('   Remote Desktop Server');
    console.log('==========================================\n');
    
    console.log(`Server running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
    
    const ips = getLocalIPs();
    if (ips.length > 0) {
        console.log('\nNetwork access:');
        ips.forEach(ip => {
            console.log(`  http://${ip}:${PORT}`);
        });
    } else {
        console.log('\nWARNING: No network interfaces detected! This might prevent access from other devices.');
    }
    
    // Test and show detailed network interface info
    testNetworkInterfaces();
    
    console.log('\n📋 Instructions:');
    console.log('1. Open the URL in browser on both computers');
    console.log('2. Host: Click "Host" then "Start Screen Share"');
    console.log('3. Client: Click "Client" and wait for connection');
    console.log('4. Client: Click "Enable Control" to control the host\n');
    
    console.log('ℹ️ Network Tips:');
    console.log('- Make sure your firewall allows incoming connections to port ' + PORT);
    console.log('- Both devices must be on the same network');
    console.log('- Try accessing the specific IP addresses shown above');
    
    if (!robot) {
        console.log('\n⚠️  Note: RobotJS not installed - remote control simulated');
        console.log('   Run: npm install robotjs');
    }
    
    console.log('\nPress Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    
    // Notify all clients
    clients.forEach((client) => {
        sendToClient(client, {
            type: 'server-shutdown'
        });
    });
    
    wss.close(() => {
        server.close(() => {
            console.log('Server stopped');
            process.exit(0);
        });
    });
});