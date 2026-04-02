package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"tutor_me_backend/env"
)

const shutdownTimeout = 5 * time.Second

func main() {
	config := env.Load()
	InitDB()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws", handleWebSocket)
	mux.HandleFunc("GET /ice-servers", handleIceServers(config))
	mux.HandleFunc("POST /login", login(config))
	mux.HandleFunc("POST /refresh", refresh(config))
	mux.HandleFunc("POST /logout", logout())

	server := &http.Server{
		Addr:    ":" + config.ServerPort(),
		Handler: enableCORS(mux),
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

	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown error: %v", err)
	}

	log.Println("Server stopped")
}
