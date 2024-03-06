package org.github.joeweh.utils.db

import java.sql.Connection
import java.sql.DriverManager

object Postgres {
    fun connect(): Connection {
        Class.forName("org.postgresql.Driver")

        val url = System.getenv("POSTGRES_URL")
        val user = System.getenv("POSTGRES_USER")
        val password = System.getenv("POSTGRES_PW")

        return DriverManager.getConnection(url, user, password)
    }
}