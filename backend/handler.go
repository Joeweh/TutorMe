package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"

	"tutor_me_backend/env"
)

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins in development
		},
	}
)

type IceServer struct {
	Urls       string `json:"urls"`
	Username   string `json:"username,omitempty"`
	Credential string `json:"credential,omitempty"`
}

type IceServersResponse struct {
	IceServers []IceServer `json:"iceServers"`
}

type Message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
	Room string          `json:"room"`
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
		send: make(chan []byte, sendBufferSize),
	}

	room := getOrCreateRoom(roomID)

	room.mu.Lock()
	room.clients[client] = true
	room.mu.Unlock()

	log.Printf("Client joined room: %s (total clients: %d)", roomID, len(room.clients))

	go client.writePump()
	client.readPump(room)
}

func handleIceServers(config *env.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		iceServers := IceServersResponse{
			IceServers: []IceServer{
				//{Urls: fmt.Sprintf("stun:%s:3478", config.IceIP())},
				//
				//{
				//	Urls:       fmt.Sprintf("turn:%s:3478", config.IceIP()),
				//	Username:   config.TurnUsername(),
				//	Credential: config.TurnPassword(),
				//},

				{
					Urls: fmt.Sprintf("stun:%s:80", config.IceIP()),
				},
				{
					Urls:       fmt.Sprintf("turn:%s:80", config.IceIP()),
					Username:   config.TurnUsername(),
					Credential: config.TurnCredential(),
				},
				{
					Urls:       fmt.Sprintf("turn:%s:80?transport=tcp", config.IceIP()),
					Username:   config.TurnUsername(),
					Credential: config.TurnCredential(),
				},
				{
					Urls:       fmt.Sprintf("turn:%s:443", config.IceIP()),
					Username:   config.TurnUsername(),
					Credential: config.TurnCredential(),
				},
				{
					Urls:       fmt.Sprintf("turn:%s:443?transport=tcp", config.IceIP()),
					Username:   config.TurnUsername(),
					Credential: config.TurnCredential(),
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")

		if err := json.NewEncoder(w).Encode(iceServers); err != nil {
			return
		}
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
