package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

type Message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
	Room string          `json:"room"`
}

type Client struct {
	conn *websocket.Conn
	room string
	send chan []byte
}

type Room struct {
	clients map[*Client]bool
	mu      sync.RWMutex
}

type IceServer struct {
	Urls       string `json:"urls"`
	Username   string `json:"username,omitempty"`
	Credential string `json:"credential,omitempty"`
}

type IceServersResponse struct {
	IceServers []IceServer `json:"iceServers"`
}

var (
	rooms    = make(map[string]*Room)
	roomsMu  sync.RWMutex
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins in development
		},
	}
)

func getOrCreateRoom(roomID string) *Room {
	roomsMu.Lock()
	defer roomsMu.Unlock()

	if room, exists := rooms[roomID]; exists {
		return room
	}

	room := &Room{
		clients: make(map[*Client]bool),
	}
	rooms[roomID] = room
	return room
}

func (c *Client) readPump(room *Room) {
	defer func() {
		room.mu.Lock()
		delete(room.clients, c)
		room.mu.Unlock()
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		// Broadcast to all other clients in the room
		room.mu.RLock()
		for client := range room.clients {
			if client != c {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(room.clients, client)
				}
			}
		}
		room.mu.RUnlock()
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()

	for message := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			break
		}
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		roomID = "default"
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading connection: %v", err)
		return
	}

	client := &Client{
		conn: conn,
		room: roomID,
		send: make(chan []byte, 256),
	}

	room := getOrCreateRoom(roomID)

	room.mu.Lock()
	room.clients[client] = true
	room.mu.Unlock()

	log.Printf("Client joined room: %s (total clients: %d)", roomID, len(room.clients))

	go client.writePump()
	client.readPump(room)
}

func handleIceServers(w http.ResponseWriter, r *http.Request) {
	username := os.Getenv("TURN_USERNAME")
	credential := os.Getenv("TURN_CREDENTIAL")

	iceServers := IceServersResponse{
		IceServers: []IceServer{
			{Urls: "stun:stun.l.google.com:19302"},
			{Urls: "stun:stun1.l.google.com:19302"},

			{
				Urls:       "turn:standard.relay.metered.ca:80",
				Username:   username,
				Credential: credential,
			},
			{
				Urls:       "turn:standard.relay.metered.ca:80?transport=tcp",
				Username:   username,
				Credential: credential,
			},
			{
				Urls:       "turn:standard.relay.metered.ca:443",
				Username:   username,
				Credential: credential,
			},
			{
				Urls:       "turns:standard.relay.metered.ca:443?transport=tcp",
				Username:   username,
				Credential: credential,
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")

	err := json.NewEncoder(w).Encode(iceServers)

	if err != nil {
		return
	}
}

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*") // Or specify your frontend URL
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight OPTIONS request
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func main() {
	err := godotenv.Load()

	if err != nil {
		log.Fatal("Error loading .env file")
	}

	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/ice-servers", enableCORS(handleIceServers))

	log.Println("Signaling server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("ListenAndServe error: ", err)
	}
}
