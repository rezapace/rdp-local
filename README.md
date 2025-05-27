
# RemoteDesktop Pro

A high-performance, browser-based remote desktop solution featuring WebRTC screen sharing, real-time remote control capabilities, and an intuitive user interface.

![RemoteDesktop Pro](https://repository-images.githubusercontent.com/123456789/remote-desktop-pro)

## 🚀 Features

- **Real-time Screen Sharing**: Low-latency, high-quality screen sharing with WebRTC
- **Remote Control**: Control remote computers with keyboard and mouse input
- **Adaptive Quality**: Automatically adjusts quality based on network conditions
- **Multiple Codecs**: Supports AV1, VP9, VP8, and H264 for optimal performance
- **Simple Connection**: Easy session sharing with unique IDs
- **Cross-Platform**: Works on any device with a modern web browser
- **Additional Tools**:
  - Screenshot capture
  - Session recording
  - Picture-in-Picture mode
  - Fullscreen support
  - Connection statistics
- **Optimized Performance**: Throttling and binary WebSocket data for mouse movements
- **Mobile Support**: Touch interface for mobile devices

## 📋 Requirements

- **Node.js**: v14.0.0 or higher
- **For full remote control**: Operating system that supports RobotJS

## 🔧 Installation

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/rezapace/remote-desktop.git
cd remote-desktop

# Install dependencies
npm install

# Start the server
npm start
```

### Building Portable macOS App (Apple Silicon)

```bash
# Make the build script executable
chmod +x build-portable.sh

# Run the build script
./build-portable.sh
```

This will create a portable macOS application at `./build/RemoteDesktop.app` and a distributable DMG file.

## 🖥️ Usage

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Open the application** in your web browser:
   ```
   http://localhost:9000
   ```

3. **Choose your role**:
   - **Host**: Share your screen and allow remote control
   - **Viewer**: Connect to and control a remote screen

### Host Instructions

1. Select "Host" role
2. Configure sharing options (show cursor, capture audio, quality)
3. Click "Start Sharing"
4. Share your Session ID with the person who needs to connect

### Viewer Instructions

1. Select "Viewer" role
2. Enter the Host's Session ID
3. Click "Connect"
4. Once connected, click "Enable Control" to take control

## 🛠️ Technical Details

### Key Technologies

- **WebRTC**: For peer-to-peer screen sharing and data channels
- **WebSockets**: For signaling and control data
- **RobotJS**: For system-level input control on the host
- **Node.js**: For the server implementation

### Architecture

The application follows a client-server architecture:

- **Server**: Handles signaling between peers, relays control commands
- **Client**: Manages WebRTC connections, UI, and user interactions

### Performance Optimizations

- Binary WebSocket for mouse movements
- Input throttling for smooth control
- Adaptive bitrate based on network conditions
- Hardware acceleration when available
- Codec preference optimization

## 📝 Development

### Project Structure

```
.
├── app.js             # Client-side application logic
├── index.html         # Main application UI
├── package.json       # Node.js project configuration
├── server.js          # WebSocket signaling server
├── style.css          # Application styling
└── build-portable.sh  # macOS app build script
```

### Custom Configuration

Edit the configuration in `app.js` to adjust:
- ICE servers
- Video quality presets
- Bitrate settings
- Control sensitivity

## ⚠️ Troubleshooting

- **Connection Issues**: Ensure both host and client are on networks that allow WebRTC
- **Screen Sharing Not Working**: Some browsers require HTTPS for screen sharing
- **Remote Control Not Working**: Ensure RobotJS is properly installed on the host
- **Performance Issues**: Try lowering the quality settings

## 🔒 Security Considerations

- The application creates direct peer-to-peer connections
- No data is stored on any server
- Consider running behind a reverse proxy with HTTPS for production use

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

**Reza Pace**
- GitHub: [@rezapace](https://github.com/rezapace)

---

⭐️ If you found this project useful, please consider giving it a star on GitHub! ⭐️