package env

import (
	"log"
	"os"
	"sync"

	"github.com/joho/godotenv"
)

type Config struct {
	serverPort string

	// STUN/TURN (WebRTC)
	iceIP          string
	turnUsername   string
	turnCredential string
}

func (c *Config) ServerPort() string     { return c.serverPort }
func (c *Config) IceIP() string          { return c.iceIP }
func (c *Config) TurnUsername() string   { return c.turnUsername }
func (c *Config) TurnCredential() string { return c.turnCredential }

var (
	instance *Config
	once     sync.Once
)

func Load() *Config {
	once.Do(func() {
		if err := godotenv.Load(".env"); err != nil {
			log.Printf("Failed to load .env file: %v", err)
		}

		instance = &Config{
			serverPort:     getEnvOrDefault("PORT", "8080"),
			iceIP:          getEnv("ICE_IP"),
			turnUsername:   getEnv("TURN_USERNAME"),
			turnCredential: getEnv("TURN_CREDENTIAL"),
		}
	})

	return instance
}

func getEnvOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func getEnv(key string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	log.Fatalf("Environment variable %s is not set", key)
	return ""
}
