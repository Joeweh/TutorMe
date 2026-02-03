import { useEffect, useRef, useState } from 'react'
import {SignalingMessage, ChatMessage, ConnectionStatus} from './types'
import {BACKEND_HOST, ICE_SERVERS} from './config'
import "./styles.css"

function App() {
    const [muted, setMuted] = useState(false)
    const [video, setVideo] = useState(false)
    const [isScreenSharing, setIsScreenSharing] = useState(false)
    const [room, setRoom] = useState('room1')
    const [status, setStatus] = useState<ConnectionStatus>('disconnected')
    const [statusMessage, setStatusMessage] = useState('Disconnected')
    const [isInRoom, setIsInRoom] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [messageInput, setMessageInput] = useState('')
    const [showDeviceSettings, setShowDeviceSettings] = useState(false)

    // Device states
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
    const [selectedAudioInput, setSelectedAudioInput] = useState<string>('')
    const [selectedVideoInput, setSelectedVideoInput] = useState<string>('')
    const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('')

    const localVideoRef = useRef<HTMLVideoElement>(null)
    const remoteVideoRef = useRef<HTMLVideoElement>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const pcRef = useRef<RTCPeerConnection | null>(null)
    const localStreamRef = useRef<MediaStream | null>(null)
    const dataChannelRef = useRef<RTCDataChannel | null>(null)
    const chatEndRef = useRef<HTMLDivElement>(null)

    const updateStatus = (message: string, state: ConnectionStatus) => {
        setStatusMessage(message)
        setStatus(state)
    }

    const getDevices = async () => {
        try {
            const deviceList = await navigator.mediaDevices.enumerateDevices()
            setDevices(deviceList)
            console.log('📱 Available devices:', deviceList)

            // Set defaults if not already set
            if (!selectedAudioInput) {
                const defaultAudio = deviceList.find(d => d.kind === 'audioinput')
                if (defaultAudio) setSelectedAudioInput(defaultAudio.deviceId)
            }
            if (!selectedVideoInput) {
                const defaultVideo = deviceList.find(d => d.kind === 'videoinput')
                if (defaultVideo) setSelectedVideoInput(defaultVideo.deviceId)
            }
            if (!selectedAudioOutput) {
                const defaultOutput = deviceList.find(d => d.kind === 'audiooutput')
                if (defaultOutput) setSelectedAudioOutput(defaultOutput.deviceId)
            }
        } catch (error) {
            console.error('❌ Error getting devices:', error)
        }
    }

    const changeAudioInput = async (deviceId: string) => {
        if (!localStreamRef.current || !pcRef.current) return

        try {
            console.log('🎤 Changing audio input to:', deviceId)

            // Get new audio stream with selected device
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } },
                video: false,
            })

            const newAudioTrack = newStream.getAudioTracks()[0]
            const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'audio')

            if (sender && newAudioTrack) {
                await sender.replaceTrack(newAudioTrack)

                // Stop old audio track
                const oldAudioTrack = localStreamRef.current.getAudioTracks()[0]
                if (oldAudioTrack) {
                    oldAudioTrack.stop()
                    localStreamRef.current.removeTrack(oldAudioTrack)
                }

                localStreamRef.current.addTrack(newAudioTrack)
                setSelectedAudioInput(deviceId)
                console.log('✅ Audio input changed')
            }
        } catch (error) {
            console.error('❌ Error changing audio input:', error)
            alert('Could not change microphone')
        }
    }

    const changeVideoInput = async (deviceId: string) => {
        if (!localStreamRef.current || !pcRef.current || isScreenSharing) return

        try {
            console.log('📹 Changing video input to:', deviceId)

            // Get new video stream with selected device
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: deviceId } },
                audio: false,
            })

            const newVideoTrack = newStream.getVideoTracks()[0]
            const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')

            if (sender && newVideoTrack) {
                await sender.replaceTrack(newVideoTrack)

                // Stop old video track
                const oldVideoTrack = localStreamRef.current.getVideoTracks()[0]
                if (oldVideoTrack) {
                    oldVideoTrack.stop()
                    localStreamRef.current.removeTrack(oldVideoTrack)
                }

                localStreamRef.current.addTrack(newVideoTrack)

                // Update local video display
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = localStreamRef.current
                }

                setSelectedVideoInput(deviceId)
                console.log('✅ Video input changed')
            }
        } catch (error) {
            console.error('❌ Error changing video input:', error)
            alert('Could not change camera')
        }
    }

    const changeAudioOutput = async (deviceId: string) => {
        try {
            console.log('🔊 Changing audio output to:', deviceId)

            // Change output for remote video
            if (remoteVideoRef.current && 'setSinkId' in remoteVideoRef.current) {
                await (remoteVideoRef.current as any).setSinkId(deviceId)
                setSelectedAudioOutput(deviceId)
                console.log('✅ Audio output changed')
            }
        } catch (error) {
            console.error('❌ Error changing audio output:', error)
            alert('Could not change speaker/output device')
        }
    }

    const setupDataChannel = (channel: RTCDataChannel) => {
        channel.onopen = () => {
            console.log('💬 Data channel opened')
        }

        channel.onclose = () => {
            console.log('💬 Data channel closed')
        }

        channel.onmessage = (event) => {
            console.log('📨 Received message:', event.data)
            const newMessage: ChatMessage = {
                text: event.data,
                sender: 'remote',
                timestamp: new Date(),
            }
            setMessages((prev) => [...prev, newMessage])
        }

        channel.onerror = (error) => {
            const errorEvent = error as RTCErrorEvent
            if (errorEvent.error?.message?.includes('User-Initiated Abort') ||
                errorEvent.error?.message?.includes('Close called')) {
                console.log('💬 Data channel closed by peer')
                return
            }
            console.error('❌ Data channel error:', error)
        }
    }

    const sendMessage = () => {
        if (!messageInput.trim() || !dataChannelRef.current) return

        const channel = dataChannelRef.current
        if (channel.readyState !== 'open') {
            console.warn('⚠️ Data channel not open')
            return
        }

        // Send message
        channel.send(messageInput)
        console.log('📤 Sent message:', messageInput)

        // Add to local messages
        const newMessage: ChatMessage = {
            text: messageInput,
            sender: 'local',
            timestamp: new Date(),
        }
        setMessages((prev) => [...prev, newMessage])
        setMessageInput('')
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const sendSignalingMessage = (message: SignalingMessage) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('📤 Sending signaling message:', message.type)
            wsRef.current.send(JSON.stringify(message))
        } else {
            console.error('❌ Cannot send message - WebSocket not open')
        }
    }

    const handleSignalingMessage = async (message: SignalingMessage) => {
        const pc = pcRef.current
        if (!pc) {
            console.warn('⚠️ Received signaling message but no peer connection exists')
            return
        }

        console.log('📨 Received signaling message:', message.type)

        try {
            switch (message.type) {
                case 'offer':
                    console.log('📥 Processing offer')
                    await pc.setRemoteDescription(new RTCSessionDescription(message.data))
                    const answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)
                    console.log('📤 Sending answer')
                    sendSignalingMessage({
                        type: 'answer',
                        data: answer,
                        room: room,
                    })
                    console.log('✅ Answer sent')
                    break

                case 'answer':
                    console.log('📥 Processing answer')
                    await pc.setRemoteDescription(new RTCSessionDescription(message.data))
                    console.log('✅ Answer processed')
                    break

                case 'ice-candidate':
                    console.log('📥 Processing ICE candidate:', message.data.type)
                    await pc.addIceCandidate(new RTCIceCandidate(message.data))
                    console.log('✅ ICE candidate added')
                    break
            }
        } catch (error) {
            console.error('❌ Error handling signaling message:', error)
        }
    }

    const createPeerConnection = async () => {
        const pc = new RTCPeerConnection(ICE_SERVERS)
        pcRef.current = pc

        const dataChannel = pc.createDataChannel('chat')
        dataChannelRef.current = dataChannel
        setupDataChannel(dataChannel)
        console.log('💬 Data channel created')

        // Handle data channel from remote peer
        pc.ondatachannel = (event) => {
            console.log('💬 Data channel received from remote peer')
            dataChannelRef.current = event.channel
            setupDataChannel(event.channel)
        }

        // Add local stream tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
                pc.addTrack(track, localStreamRef.current!)
            })
        }

        // Handle incoming tracks
        pc.ontrack = (event) => {
            console.log('Received remote track')
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0]
            }
        }

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignalingMessage({
                    type: 'ice-candidate',
                    data: event.candidate,
                    room: room,
                })
            }
        }

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState)
            if (pc.connectionState === 'connected') {
                updateStatus('Peer connected!', 'connected')
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                updateStatus('Peer disconnected', 'error')
            }
        }

        // Create and send offer
        try {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            sendSignalingMessage({
                type: 'offer',
                data: offer,
                room: room,
            })
            console.log('Offer sent')
        } catch (error) {
            console.error('Error creating offer:', error)
        }
    }

    const connectSignaling = () => {
        const wsUrl = `wss://${BACKEND_HOST}/ws?room=${room}`
        console.log('🌐 Connecting to signaling server:', wsUrl)
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
            console.log('✅ Connected to signaling server')
            updateStatus(`Connected to room: ${room}`, 'connecting')
            createPeerConnection()
        }

        ws.onmessage = async (event) => {
            const message: SignalingMessage = JSON.parse(event.data)
            await handleSignalingMessage(message)
        }

        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error)
            updateStatus('Connection error', 'error')
        }

        ws.onclose = () => {
            console.log('🔌 Disconnected from signaling server')
            updateStatus('Disconnected', 'disconnected')
        }
    }

    const joinRoom = async () => {
        if (!room.trim()) {
            alert('Please enter a room name')
            return
        }

        try {
            // Get local media stream with selected devices
            const constraints: MediaStreamConstraints = {
                video: selectedVideoInput
                    ? { deviceId: { exact: selectedVideoInput } }
                    : true,
                audio: selectedAudioInput
                    ? { deviceId: { exact: selectedAudioInput } }
                    : true,
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints)

            localStreamRef.current = stream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream
            }

            // Set audio output if selected
            if (selectedAudioOutput && remoteVideoRef.current && 'setSinkId' in remoteVideoRef.current) {
                await (remoteVideoRef.current as any).setSinkId(selectedAudioOutput)
            }

            updateStatus('Getting media stream...', 'connecting')
            setIsInRoom(true)

            // Connect to signaling server
            connectSignaling()
        } catch (error) {
            console.error('Error accessing media devices:', error)
            updateStatus('Error accessing camera/microphone', 'error')
        }
    }

    const leaveRoom = () => {
        // Close peer connection
        if (pcRef.current) {
            pcRef.current.close()
            pcRef.current = null
        }

        // Close data channel
        if (dataChannelRef.current) {
            dataChannelRef.current.close()
            dataChannelRef.current = null
        }

        // Close WebSocket
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }

        // Stop local media stream
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop())
            localStreamRef.current = null
        }

        // Clear video elements
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null
        }

        updateStatus('Disconnected', 'disconnected')
        setIsInRoom(false)
        setIsScreenSharing(false)
        setMessages([])
        setMessageInput('')
        console.log('Left room')
    }

    const toggleMute = () => {
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setMuted(!audioTrack.enabled);
        }
    };

    const toggleCamera = () => {
        const videoTrack = localStreamRef.current?.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            setVideo(!videoTrack.enabled);
        }
    };

    const startScreenShare = async () => {
        try {
            console.log('🖥️ Starting screen share')

            // Get screen stream
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true, // Include system audio if available
            })

            // Replace video track in peer connection
            const pc = pcRef.current
            if (pc && localStreamRef.current) {
                const videoTrack = screenStream.getVideoTracks()[0]
                const sender = pc.getSenders().find((s) => s.track?.kind === 'video')

                if (sender) {
                    await sender.replaceTrack(videoTrack)
                    console.log('✅ Replaced camera with screen share')
                }

                // Stop the old camera track
                const oldVideoTrack = localStreamRef.current.getVideoTracks()[0]
                if (oldVideoTrack) {
                    oldVideoTrack.stop()
                }

                // Replace video track in local stream
                localStreamRef.current.removeTrack(oldVideoTrack)
                localStreamRef.current.addTrack(videoTrack)
            }

            // Update local video display
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = screenStream
            }

            setIsScreenSharing(true)

            // Handle when user clicks "Stop Sharing" in browser UI
            screenStream.getVideoTracks()[0].onended = () => {
                console.log('🛑 Screen share ended by user')
                stopScreenShare()
            }
        } catch (error) {
            console.error('❌ Error starting screen share:', error)
            alert('Could not start screen sharing. Make sure you granted permission.')
        }
    }

    const stopScreenShare = async () => {
        try {
            console.log('🎥 Switching back to camera')

            // Get camera stream again
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            })

            // Replace screen track with camera in peer connection
            const pc = pcRef.current
            if (pc && localStreamRef.current) {
                const videoTrack = cameraStream.getVideoTracks()[0]
                const sender = pc.getSenders().find((s) => s.track?.kind === 'video')

                if (sender) {
                    await sender.replaceTrack(videoTrack)
                    console.log('✅ Replaced screen share with camera')
                }

                // Stop the old screen track
                const oldVideoTrack = localStreamRef.current.getVideoTracks()[0]
                if (oldVideoTrack) {
                    oldVideoTrack.stop()
                }

                // Replace video track in local stream
                localStreamRef.current.removeTrack(oldVideoTrack)
                localStreamRef.current.addTrack(videoTrack)
            }

            // Update local video display
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = cameraStream
            }

            setIsScreenSharing(false)
        } catch (error) {
            console.error('❌ Error stopping screen share:', error)
            alert('Could not switch back to camera')
        }
    }


    // Cleanup on unmount
    useEffect(() => {
        return () => {
            leaveRoom()
        }
    }, [])

    // Auto-scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    return (
        <div className="app">
            <h1>WebRTC Video Chat</h1>

            <div className={`status ${status}`}>
                {statusMessage}
            </div>

            {!isInRoom && (
                <div className="device-settings">
                    <button
                        className="settings-toggle"
                        onClick={() => setShowDeviceSettings(!showDeviceSettings)}
                    >
                        ⚙️ {showDeviceSettings ? 'Hide' : 'Show'} Device Settings
                    </button>

                    {showDeviceSettings && (
                        <div className="device-selectors">
                            <div className="device-selector">
                                <label>🎤 Microphone:</label>
                                <select
                                    value={selectedAudioInput}
                                    onChange={(e) => setSelectedAudioInput(e.target.value)}
                                >
                                    <option value="">Default</option>
                                    {devices
                                        .filter(d => d.kind === 'audioinput')
                                        .map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div className="device-selector">
                                <label>📹 Camera:</label>
                                <select
                                    value={selectedVideoInput}
                                    onChange={(e) => setSelectedVideoInput(e.target.value)}
                                >
                                    <option value="">Default</option>
                                    {devices
                                        .filter(d => d.kind === 'videoinput')
                                        .map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div className="device-selector">
                                <label>🔊 Speaker:</label>
                                <select
                                    value={selectedAudioOutput}
                                    onChange={(e) => setSelectedAudioOutput(e.target.value)}
                                >
                                    <option value="">Default</option>
                                    {devices
                                        .filter(d => d.kind === 'audiooutput')
                                        .map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Speaker ${device.deviceId.slice(0, 5)}`}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isInRoom && (
                <div className="device-settings-inline">
                    <select
                        value={selectedAudioInput}
                        onChange={(e) => changeAudioInput(e.target.value)}
                        title="Change microphone"
                    >
                        {devices
                            .filter(d => d.kind === 'audioinput')
                            .map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    🎤 {device.label || `Mic ${device.deviceId.slice(0, 5)}`}
                                </option>
                            ))
                        }
                    </select>

                    <select
                        value={selectedVideoInput}
                        onChange={(e) => changeVideoInput(e.target.value)}
                        disabled={isScreenSharing}
                        title="Change camera"
                    >
                        {devices
                            .filter(d => d.kind === 'videoinput')
                            .map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    📹 {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                                </option>
                            ))
                        }
                    </select>

                    <select
                        value={selectedAudioOutput}
                        onChange={(e) => changeAudioOutput(e.target.value)}
                        title="Change speaker"
                    >
                        {devices
                            .filter(d => d.kind === 'audiooutput')
                            .map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    🔊 {device.label || `Speaker ${device.deviceId.slice(0, 5)}`}
                                </option>
                            ))
                        }
                    </select>
                </div>
            )}

            <div className="controls">
                <input
                    type="text"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    placeholder="Enter room name"
                    disabled={isInRoom}
                />
                <button onClick={joinRoom} disabled={isInRoom}>
                    Join Room
                </button>
                <button onClick={leaveRoom} disabled={!isInRoom}>
                    Leave Room
                </button>
                <button onClick={toggleMute} disabled={!isInRoom}>
                    {muted ? 'Unmute Mic' : 'Mute Mic'}
                </button>
                <button onClick={toggleCamera} disabled={!isInRoom}>
                    {video ? 'Show Camera' : 'Hide Camera'}
                </button>
                <button
                    onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                    disabled={!isInRoom}
                >
                    {isScreenSharing ? '🎥 Stop Sharing' : '🖥️ Share Screen'}
                </button>
            </div>

            <div className="videos">
                <div className="video-container">
                    <video className={isScreenSharing ? '' : 'video-flipped'} ref={localVideoRef} autoPlay muted playsInline />
                    <div className="video-label">You (Local)</div>
                </div>
                <div className="video-container">
                    <video ref={remoteVideoRef} autoPlay playsInline />
                    <div className="video-label">Remote Peer</div>
                </div>
            </div>
            {isInRoom && (
                <div className="chat-container">
                    <div className="chat-header">💬 Chat</div>
                    <div className="chat-messages">
                        {messages.length === 0 ? (
                            <div className="chat-empty">No messages yet. Start chatting!</div>
                        ) : (
                            messages.map((msg, index) => (
                                <div
                                    key={index}
                                    className={`chat-message ${msg.sender === 'local' ? 'local' : 'remote'}`}
                                >
                                    <div className="message-text">{msg.text}</div>
                                    <div className="message-time">
                                        {msg.timestamp.toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={chatEndRef} />
                    </div>
                    <div className="chat-input-container">
                        <input
                            type="text"
                            className="chat-input"
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Type a message... (Enter to send)"
                        />
                        <button onClick={sendMessage} disabled={!messageInput.trim()}>
                            Send
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default App