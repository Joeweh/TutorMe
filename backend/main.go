package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
	"tutor_me_backend/env"

	"github.com/gorilla/websocket"
)

const (
	sendBufferSize = 256
	maxMessageSize = 16 * 1024
	pongWait       = 60 * time.Second
	pingPeriod     = 54 * time.Second
	writeWait      = 10 * time.Second
)

type Client struct {
	conn *websocket.Conn
	room string
	send chan []byte
}

type Room struct {
	clients map[*Client]bool
	mu      sync.RWMutex
}

var (
	rooms   = make(map[string]*Room)
	roomsMu sync.RWMutex
)

func main() {
	config := env.Load()

	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/ice-servers", enableCORS(handleIceServers(config)))

	server := &http.Server{
		Addr: ":" + config.ServerPort(),
	}

	// Start server in goroutine
	go func() {
		log.Printf("Signaling server starting on %s", config.ServerPort())
		if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("ListenAndServe error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Give connections 5 seconds to finish
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown error: %v", err)
	}

	log.Println("Server stopped")
}

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
		isEmpty := len(room.clients) == 0
		room.mu.Unlock()

		if isEmpty {
			roomsMu.Lock()
			delete(rooms, c.room)
			roomsMu.Unlock()
		}

		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)

	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		log.Printf("Received pong from client in room %s", c.room)
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Client disconnected from room %s: %v", c.room, err)
			} else {
				log.Printf("Read error (possibly missed pong) in room %s: %v", c.room, err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		log.Printf("Message type=%s room=%s data=%s", msg.Type, msg.Room, msg.Data)

		// Broadcast to all other clients in the room
		room.mu.Lock()
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
		room.mu.Unlock()
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)

	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			log.Printf("Sending ping to client in room %s", c.room)
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Ping failed for client in room %s: %v", c.room, err)
				return
			}
		}
	}
}
