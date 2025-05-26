#!/bin/bash

# Remote Desktop Application - Portable Build Script
# For macOS M1/ARM - Click-and-Run Version
# ----------------------------------------------

# Text formatting
BOLD="\033[1m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
RESET="\033[0m"

# Configuration variables
PORT=9000
APP_NAME="RemoteDesktop"
BUILD_DIR="./build"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
NODE_VERSION="18.19.1"

# Print header
print_header() {
    clear
    echo -e "${BLUE}${BOLD}======================================================="
    echo -e "  Remote Desktop - Portable App Builder"
    echo -e "  For macOS M1/ARM Architecture"
    echo -e "=======================================================\n${RESET}"
}

# Print section
print_section() {
    echo -e "\n${BLUE}${BOLD}▶ $1${RESET}\n"
}

# Print success message
print_success() {
    echo -e "${GREEN}✓ $1${RESET}"
}

# Print error message
print_error() {
    echo -e "${RED}✖ ERROR: $1${RESET}"
}

# Print warning message
print_warning() {
    echo -e "${YELLOW}⚠ WARNING: $1${RESET}"
}

# Check if running on macOS
check_macos() {
    print_section "Checking system"
    
    if [[ "$(uname)" != "Darwin" ]]; then
        print_error "This script is designed for macOS. Detected OS: $(uname)"
        exit 1
    fi
    
    # Check architecture
    if [[ "$(uname -m)" == "arm64" ]]; then
        print_success "Detected Apple Silicon (ARM64) architecture"
    else
        print_warning "This script is optimized for Apple Silicon. You may experience compatibility issues."
    fi
}

# Create basic app structure
create_app_structure() {
    print_section "Creating application structure"
    
    # Create directory structure
    mkdir -p "$APP_DIR/Contents/MacOS"
    mkdir -p "$APP_DIR/Contents/Resources"
    
    # Create Info.plist
    cat > "$APP_DIR/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>start.sh</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.remotedesktop.app</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Remote Desktop</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF
    
    print_success "Application structure created"
}

# Download and set up portable Node.js
setup_portable_node() {
    print_section "Setting up portable Node.js"
    
    # Create a node directory in Resources
    mkdir -p "$APP_DIR/Contents/Resources/node"
    
    # Download portable Node.js for Mac ARM
    echo "Downloading Node.js $NODE_VERSION for macOS ARM64..."
    curl -L "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-arm64.tar.gz" -o "$BUILD_DIR/node.tar.gz"
    
    # Extract Node.js
    echo "Extracting Node.js..."
    tar -xzf "$BUILD_DIR/node.tar.gz" -C "$BUILD_DIR"
    
    # Copy Node.js binaries to the app
    cp -R "$BUILD_DIR/node-v$NODE_VERSION-darwin-arm64/"* "$APP_DIR/Contents/Resources/node/"
    
    # Clean up
    rm "$BUILD_DIR/node.tar.gz"
    rm -rf "$BUILD_DIR/node-v$NODE_VERSION-darwin-arm64"
    
    print_success "Node.js $NODE_VERSION installed in the app bundle"
}

# Create application code and dependencies
create_app_code() {
    print_section "Creating application files"
    
    # Copy server.js if it exists, otherwise create it
    if [ -f "server.js" ]; then
        cp server.js "$APP_DIR/Contents/Resources/"
    else
        print_warning "server.js not found, creating a basic version"
        
        # Create a basic server.js
        cat > "$APP_DIR/Contents/Resources/server.js" << EOF
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = process.env.PORT || 9000;

// Initialize WebSocket server
const server = http.createServer((req, res) => {
    const filePath = req.url === '/' ? '/index.html' : req.url;
    const fullPath = path.join(__dirname, filePath);
    
    // Simple static file server
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
        };
        
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(data);
    });
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Client tracking
const clients = new Map();

wss.on('connection', (ws) => {
    const clientId = Date.now().toString();
    let role = null;
    
    console.log(`Client connected: ${clientId}`);
    
    // Handle messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`Received: ${data.type} from ${clientId}`);
            
            switch (data.type) {
                case 'register':
                    role = data.role;
                    clients.set(clientId, { ws, role });
                    
                    // Confirm registration
                    ws.send(JSON.stringify({
                        type: 'registered',
                        clientId: clientId
                    }));
                    
                    // If client, notify of available hosts
                    if (role === 'client') {
                        const hosts = [...clients.entries()]
                            .filter(([id, client]) => client.role === 'host')
                            .map(([id]) => id);
                            
                        if (hosts.length > 0) {
                            ws.send(JSON.stringify({
                                type: 'host-available',
                                hostId: hosts[0]
                            }));
                        }
                    }
                    
                    // If host, notify clients
                    if (role === 'host') {
                        [...clients.entries()]
                            .filter(([id, client]) => client.role === 'client')
                            .forEach(([id, client]) => {
                                client.ws.send(JSON.stringify({
                                    type: 'host-available',
                                    hostId: clientId
                                }));
                            });
                    }
                    break;
                    
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                case 'control':
                    // Forward to target client
                    if (data.targetId && clients.has(data.targetId)) {
                        const targetWs = clients.get(data.targetId).ws;
                        data.fromId = clientId;
                        targetWs.send(JSON.stringify(data));
                    }
                    break;
                
                case 'host-ready':
                    // Notify clients that host is ready
                    [...clients.entries()]
                        .filter(([id, client]) => client.role === 'client')
                        .forEach(([id, client]) => {
                            client.ws.send(JSON.stringify({
                                type: 'client-joined',
                                clientId: id
                            }));
                        });
                    break;
            }
            
        } catch (error) {
            console.error(`Error processing message: ${error.message}`);
        }
    });
    
    // Handle disconnection
    ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        
        if (role === 'host') {
            // Notify clients that host disconnected
            [...clients.entries()]
                .filter(([id, client]) => client.role === 'client')
                .forEach(([id, client]) => {
                    client.ws.send(JSON.stringify({
                        type: 'host-disconnected'
                    }));
                });
        }
        
        clients.delete(clientId);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});

// Handle shutdown signals
process.on('SIGINT', () => {
    console.log('Server shutting down');
    
    // Notify all clients
    [...clients.values()].forEach(({ws}) => {
        ws.send(JSON.stringify({
            type: 'server-shutdown'
        }));
    });
    
    // Close server
    wss.close();
    server.close(() => {
        process.exit(0);
    });
});
EOF
    fi
    
    # Copy app.js if it exists
    if [ -f "app.js" ]; then
        cp app.js "$APP_DIR/Contents/Resources/"
    else
        print_warning "app.js not found, it should be created"
    fi
    
    # Create package.json with only required dependencies
    cat > "$APP_DIR/Contents/Resources/package.json" << EOF
{
  "name": "remote-desktop",
  "version": "1.0.0",
  "description": "Remote Desktop with WebRTC",
  "main": "server.js",
  "dependencies": {
    "ws": "^8.13.0"
  }
}
EOF

    # Create index.html if it doesn't exist
    if [ ! -f "index.html" ]; then
        cat > "$APP_DIR/Contents/Resources/index.html" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Remote Desktop</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f5f5f7;
            color: #333;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
        }
        header {
            text-align: center;
            padding: 20px 0;
            border-bottom: 1px solid #ddd;
            margin-bottom: 30px;
        }
        h1 {
            color: #0066cc;
        }
        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            background-color: #999;
            border-radius: 50%;
            margin-right: 10px;
        }
        .status-indicator.connected {
            background-color: #4cd964;
        }
        #roleSelection {
            text-align: center;
            margin: 50px 0;
        }
        button {
            background-color: #0066cc;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin: 10px;
        }
        button:disabled {
            background-color: #999;
            cursor: not-allowed;
        }
        .role-button {
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            width: 150px;
            height: 150px;
            justify-content: center;
            border: 2px solid #0066cc;
            background-color: white;
            border-radius: 10px;
            margin: 0 20px;
            transition: transform 0.2s;
        }
        .role-button:hover {
            transform: scale(1.05);
        }
        .role-icon {
            font-size: 40px;
            margin-bottom: 10px;
        }
        #hostPanel, #clientPanel {
            display: none;
        }
        #videoArea {
            display: none;
        }
        .video-container {
            position: relative;
            background-color: #000;
            border-radius: 10px;
            overflow: hidden;
            margin: 20px 0;
        }
        video {
            width: 100%;
            display: block;
        }
        .control-panel {
            display: flex;
            justify-content: center;
            gap: 10px;
            padding: 10px;
        }
        .video-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            z-index: 10;
        }
        .video-overlay.hidden {
            display: none;
        }
        .control-canvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 5;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Remote Desktop</h1>
            <p><span id="statusIndicator" class="status-indicator"></span> <span id="statusText">Disconnected</span></p>
        </header>
        
        <div id="roleSelection">
            <h2>Select Your Role</h2>
            <button class="role-button" onclick="app.selectRole('host')">
                <div class="role-icon">🖥️</div>
                Share Your Screen
            </button>
            <button class="role-button" onclick="app.selectRole('client')">
                <div class="role-icon">👁️</div>
                View Remote Screen
            </button>
        </div>
        
        <div id="hostPanel">
            <h2>Screen Sharing</h2>
            <div>
                <p>Your session ID: <strong id="sessionId">...</strong></p>
                <div>
                    <label><input type="checkbox" id="showCursor" checked> Show cursor</label>
                    <label><input type="checkbox" id="captureAudio"> Capture audio</label>
                    <select id="qualitySelect">
                        <option value="auto">Auto quality</option>
                        <option value="high">High quality</option>
                        <option value="medium">Medium quality</option>
                        <option value="low">Low quality</option>
                    </select>
                </div>
                <div class="control-panel">
                    <button id="shareBtn" onclick="app.startScreenShare()">Share Screen</button>
                    <button id="stopBtn" onclick="app.stopScreenShare()" disabled>Stop Sharing</button>
                </div>
            </div>
        </div>
        
        <div id="clientPanel">
            <h2>Remote Screen</h2>
            <p>Connected to host: <strong id="connectedHost">...</strong></p>
        </div>
        
        <div id="videoArea">
            <div id="videoContainer" class="video-container">
                <video id="remoteVideo" autoplay playsinline></video>
                <canvas id="controlCanvas" class="control-canvas"></canvas>
                <div id="videoOverlay" class="video-overlay">
                    <div id="overlayMessage">Waiting for connection...</div>
                </div>
            </div>
            <div class="control-panel">
                <button id="controlBtn" onclick="app.toggleRemoteControl()" disabled>Enable Control</button>
                <button id="fullscreenBtn" onclick="app.toggleFullscreen()" disabled>Fullscreen</button>
            </div>
            <div id="localVideoContainer" style="display:none;">
                <video id="localVideo" muted autoplay playsinline></video>
            </div>
        </div>
    </div>
    
    <script src="app.js"></script>
</body>
</html>
EOF
    else
        cp index.html "$APP_DIR/Contents/Resources/"
    fi
    
    # Create a logs directory
    mkdir -p "$APP_DIR/Contents/Resources/logs"
    
    print_success "Application code created"
}

# Install dependencies
install_dependencies() {
    print_section "Installing minimal dependencies"
    
    # Use the bundled npm to install ws
    cd "$APP_DIR/Contents/Resources"
    ../Resources/node/bin/npm install --no-optional --production
    cd -
    
    print_success "Dependencies installed"
}

# Create launcher script
create_launcher() {
    print_section "Creating launcher script"
    
    # Create launcher script
    cat > "$APP_DIR/Contents/MacOS/start.sh" << EOF
#!/bin/bash

# Get the directory where the script is located
DIR="\$( cd "\$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
RESOURCES_DIR="\$DIR/../Resources"

# Define paths
NODE="\$RESOURCES_DIR/node/bin/node"
SERVER_JS="\$RESOURCES_DIR/server.js"
PORT=9000

# Create logs directory
mkdir -p "\$RESOURCES_DIR/logs"

# Set NODE_PATH to include the node_modules directory
export NODE_PATH="\$RESOURCES_DIR/node_modules"

# Open browser after a short delay
(sleep 2 && open "http://localhost:\$PORT") &

# Start the server with the bundled Node.js
cd "\$RESOURCES_DIR"
exec "\$NODE" "\$SERVER_JS" > "\$RESOURCES_DIR/logs/server.log" 2>&1
EOF
    
    # Make launcher executable
    chmod +x "$APP_DIR/Contents/MacOS/start.sh"
    
    print_success "Launcher script created"
}

# Create DMG for distribution
create_dmg() {
    print_section "Creating distributable DMG"
    
    if command -v hdiutil &> /dev/null; then
        echo "Creating DMG file..."
        
        # Create a temporary DMG
        hdiutil create -volname "Remote Desktop" -srcfolder "$BUILD_DIR" -ov -format UDZO "$BUILD_DIR/RemoteDesktop.dmg"
        
        print_success "DMG created at $BUILD_DIR/RemoteDesktop.dmg"
    else
        print_warning "hdiutil not found, skipping DMG creation"
    fi
}

# Show final instructions
show_summary() {
    print_section "Build Complete!"
    
    echo -e "${GREEN}${BOLD}Remote Desktop app has been successfully built!${RESET}"
    echo
    echo -e "${BOLD}Application:${RESET}"
    echo "  - Location: $APP_DIR"
    echo
    echo -e "${BOLD}To run the application:${RESET}"
    echo "  1. Double-click the RemoteDesktop.app in the build directory"
    echo "  2. The application will start and open your browser automatically"
    echo
    if [ -f "$BUILD_DIR/RemoteDesktop.dmg" ]; then
        echo -e "${BOLD}Distribution:${RESET}"
        echo "  - DMG file: $BUILD_DIR/RemoteDesktop.dmg"
        echo "  - Share this DMG file with others for easy installation"
        echo
    fi
    echo -e "${BLUE}${BOLD}Thank you for using Remote Desktop!${RESET}"
}

# Main function
main() {
    print_header
    
    # Check if we're on macOS
    check_macos
    
    # Create build directory
    mkdir -p "$BUILD_DIR"
    
    # Create app structure
    create_app_structure
    
    # Set up portable Node.js
    setup_portable_node
    
    # Create application code
    create_app_code
    
    # Install dependencies
    install_dependencies
    
    # Create launcher
    create_launcher
    
    # Create DMG
    create_dmg
    
    # Show summary
    show_summary
}

# Run the main function
main 