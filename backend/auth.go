package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"tutor_me_backend/env"
)

type contextKey string

const (
	userIDKey        contextKey = "userID"
	accessTokenExp              = 15 * time.Minute
	refreshTokenExp             = 30 * 24 * time.Hour
)

func AuthMiddleware(config *env.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			header, exists := request.Header["Authorization"]

			if !exists {
				http.Error(writer, "missing authorization header", http.StatusUnauthorized)
				return
			}

			parts := strings.Split(header[0], " ")

			if len(parts) != 2 || parts[0] != "Bearer" {
				http.Error(writer, "invalid authorization header format", http.StatusUnauthorized)
				return
			}

			token, err := jwt.Parse(parts[1], func(token *jwt.Token) (any, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				return []byte(config.JWTSecret()), nil
			})

			if err != nil || !token.Valid {
				http.Error(writer, "invalid token", http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(writer, "invalid token claims", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(request.Context(), userIDKey, claims["sub"])

			next.ServeHTTP(writer, request.WithContext(ctx))
		})
	}
}

type loginRequest struct {
	Email string `json:"email"`
}

func newAccessToken(userID string, secret string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(accessTokenExp).Unix(),
	})
	return token.SignedString([]byte(secret))
}

func newRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func login(config *env.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req loginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		// TODO verify credentials with bcrypt
		var userID string
		err := DB.QueryRow("SELECT user_id FROM users WHERE email = ?", req.Email).Scan(&userID)
		if err == sql.ErrNoRows {
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		log.Printf("ID: %s", userID)

		accessToken, err := newAccessToken(userID, config.JWTSecret())
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		refreshToken, err := newRefreshToken()
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		_, err = DB.Exec(
			"INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
			refreshToken, userID, time.Now().Add(refreshTokenExp),
		)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"access_token":  accessToken,
			"refresh_token": refreshToken,
		})
	}
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func refresh(config *env.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req refreshRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		var userID string
		var expiresAt time.Time
		err := DB.QueryRow(
			"SELECT user_id, expires_at FROM refresh_tokens WHERE token = ?",
			req.RefreshToken,
		).Scan(&userID, &expiresAt)
		if err == sql.ErrNoRows {
			http.Error(w, "invalid refresh token", http.StatusUnauthorized)
			return
		}
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		if time.Now().After(expiresAt) {
			http.Error(w, "refresh token expired", http.StatusUnauthorized)
			return
		}

		accessToken, err := newAccessToken(userID, config.JWTSecret())
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"access_token": accessToken,
		})
	}
}

func logout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req refreshRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		_, err := DB.Exec("DELETE FROM refresh_tokens WHERE token = ?", req.RefreshToken)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
