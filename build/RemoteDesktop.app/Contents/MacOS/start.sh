#!/bin/bash

# Get the directory where the script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
RESOURCES_DIR="$DIR/../Resources"

# Define paths
NODE="$RESOURCES_DIR/node/bin/node"
SERVER_JS="$RESOURCES_DIR/server.js"
PORT=9000

# Create logs directory
mkdir -p "$RESOURCES_DIR/logs"

# Set NODE_PATH to include the node_modules directory
export NODE_PATH="$RESOURCES_DIR/node_modules"

# Open browser after a short delay
(sleep 2 && open "http://localhost:$PORT") &

# Start the server with the bundled Node.js
cd "$RESOURCES_DIR"
exec "$NODE" "$SERVER_JS" > "$RESOURCES_DIR/logs/server.log" 2>&1
