package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"tutor_me_backend/env"
)

type contextKey string

const userIDKey contextKey = "userID"

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

func login(config *env.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		// TODO get & verify credentials
		
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			// TODO userID 
    		"sub": "",
    		"exp": time.Now().Add(24 * time.Hour).Unix(),
		})

		signed, err := token.SignedString([]byte(config.JWTSecret()))
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"token":"` + signed + `"}`))
	}
}
