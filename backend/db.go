package main

import (
	"database/sql"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB() {
	var err error
	DB, err = sql.Open("sqlite", "../test.db")
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	if err = DB.Ping(); err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	DB.SetMaxOpenConns(10)
	DB.SetConnMaxLifetime(time.Hour)
}
