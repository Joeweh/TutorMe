import {useEffect, useRef, useState} from 'react'

interface SignalingMessage {
    type: string
    data: any
    room: string
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const BACKEND_HOST = 'localhost:8080'

const ICE_SERVERS = await (async ()=> {
    const response = await fetch(`http://${BACKEND_HOST}/ice-servers`)

    return await response.json();
})();

function App() {
    const [room, setRoom] = useState('room1')
    const [status, setStatus] = useState<ConnectionStatus>('disconnected')
    const [statusMessage, setStatusMessage] = useState('Disconnected')
    const [isInRoom, setIsInRoom] = useState(false)

    const localVideoRef = useRef<HTMLVideoElement>(null)
    const remoteVideoRef = useRef<HTMLVideoElement>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const pcRef = useRef<RTCPeerConnection | null>(null)
    const localStreamRef = useRef<MediaStream | null>(null)

    const updateStatus = (message: string, state: ConnectionStatus) => {
        setStatusMessage(message)
        setStatus(state)
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
                console.log('🧊 ICE Candidate:', {
                    type: event.candidate.type,
                    protocol: event.candidate.protocol,
                    address: event.candidate.address,
                    port: event.candidate.port,
                    candidate: event.candidate.candidate
                })
                sendSignalingMessage({
                    type: 'ice-candidate',
                    data: event.candidate,
                    room: room,
                })
            } else {
                console.log('✅ ICE gathering complete')
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
        const wsUrl = `ws://${BACKEND_HOST}/ws?room=${room}`
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
            // Get local media stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            })

            localStreamRef.current = stream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream
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
        console.log('Left room')
    }

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            leaveRoom()
        }
    }, [])

    return (
        <div className="app">
            <h1>WebRTC Video Chat</h1>

            <div className={`status ${status}`}>
                {statusMessage}
            </div>

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
            </div>

            <div className="videos">
                <div className="video-container">
                    <video ref={localVideoRef} autoPlay muted playsInline />
                    <div className="video-label">You (Local)</div>
                </div>
                <div className="video-container">
                    <video ref={remoteVideoRef} autoPlay playsInline />
                    <div className="video-label">Remote Peer</div>
                </div>
            </div>
        </div>
    )
}

export default App