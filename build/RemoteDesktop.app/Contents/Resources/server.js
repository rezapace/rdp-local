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

// Create HTTP server
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile('./index.html', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map();
let clientIdCounter = 0;

// Store hosts and viewers
const hosts = new Map();
const viewers = new Map();

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
    
    // Store client
    const client = {
        id: clientId,
        ws: ws,
        role: null,
        ip: clientIp,
        ready: false
    };
    
    clients.set(clientId, client);
    
    // Handle messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`[Client ${clientId}] Message: ${data.type}`);
            
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
                    handleControl(client, data);
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
        
        clients.delete(clientId);
    });
    
    // Handle errors
    ws.on('error', (error) => {
        console.error(`[Client ${clientId}] WebSocket error:`, error);
    });
});

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
    
    const target = clients.get(targetId);
    if (target && target.ws.readyState === WebSocket.OPEN) {
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
    
    const target = clients.get(targetId);
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
        const target = clients.get(data.targetId);
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
    
    // Forward to all hosts
    hosts.forEach((host) => {
        sendToClient(host, {
            type: 'control',
            ...data,
            fromId: client.id
        });
    });
    
    // If robotjs is available, perform the action
    if (robot) {
        try {
            const screenSize = robot.getScreenSize();
            // Map button values: 0 = left, 1 = middle, 2 = right
            const buttonMap = ['left', 'middle', 'right'];
            
            switch(data.action) {
                case 'mousemove':
                case 'move':
                    const x = Math.round(data.x * screenSize.width);
                    const y = Math.round(data.y * screenSize.height);
                    robot.moveMouse(x, y);
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
                    robot.mouseClick();
                    break;
                
                case 'rightclick':
                    const rclickX = Math.round(data.x * screenSize.width);
                    const rclickY = Math.round(data.y * screenSize.height);
                    robot.moveMouse(rclickX, rclickY);
                    robot.mouseClick('right');
                    break;
                    
                case 'wheel':
                    const scrollX = Math.round(data.x * screenSize.width);
                    const scrollY = Math.round(data.y * screenSize.height);
                    robot.moveMouse(scrollX, scrollY);
                    
                    // Normalize scroll amount
                    const scrollAmount = data.deltaY > 0 ? 5 : -5;
                    robot.scrollMouse(0, scrollAmount);
                    break;
            }
        } catch (error) {
            console.error('RobotJS error:', error);
        }
    }
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n==========================================');
    console.log('   Simple Remote Desktop Server');
    console.log('==========================================\n');
    
    console.log(`Server running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
    
    const ips = getLocalIPs();
    if (ips.length > 0) {
        console.log('\nNetwork access:');
        ips.forEach(ip => {
            console.log(`  http://${ip}:${PORT}`);
        });
    }
    
    console.log('\n📋 Instructions:');
    console.log('1. Open the URL in browser on both computers');
    console.log('2. Host: Click "Host" then "Start Screen Share"');
    console.log('3. Client: Click "Client" and wait for connection');
    console.log('4. Client: Click "Enable Control" to control the host\n');
    
    if (!robot) {
        console.log('⚠️  Note: RobotJS not installed - remote control simulated');
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