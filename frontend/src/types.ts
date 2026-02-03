export interface SignalingMessage {
    type: string
    data: any
    room: string
}

export interface ChatMessage {
    text: string
    sender: 'local' | 'remote'
    timestamp: Date
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'