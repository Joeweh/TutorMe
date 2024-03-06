package org.github.joeweh.schemas

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import org.github.joeweh.utils.db.Postgres

import java.util.*

@Serializable
data class User(val email: String)

object UserSchema {
    private val connection = Postgres.connect()

    private const val SELECT_USER_BY_ID = "SELECT * FROM users WHERE id = ?"
    private const val INSERT_USER = "INSERT INTO users VALUES (?, ?)"
    private const val UPDATE_USER = "UPDATE users SET email = ? WHERE id = ?"
    private const val DELETE_USER = "DELETE FROM users WHERE id = ?"

    suspend fun getById(id: String): User = withContext(Dispatchers.IO) {
        val statement = connection.prepareStatement(SELECT_USER_BY_ID)
        statement.setString(1, id)
        val resultSet = statement.executeQuery()

        if (resultSet.next()) {
            val email = resultSet.getString("email")
            return@withContext User(email)
        }

        else {
            throw Exception("User not found")
        }
    }

    suspend fun create(user: User) = withContext(Dispatchers.IO) {
        val statement = connection.prepareStatement(INSERT_USER)
        statement.setString(1, UUID.randomUUID().toString())
        statement.setString(2, user.email)
        statement.executeUpdate()

        return@withContext
    }

    suspend fun update(id: String, user: User) = withContext(Dispatchers.IO) {
        val statement = connection.prepareStatement(UPDATE_USER)
        statement.setString(1, user.email)
        statement.setString(2, id)
        statement.executeUpdate()

        return@withContext
    }

    // Delete a city
    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        val statement = connection.prepareStatement(DELETE_USER)
        statement.setString(1, id)
        statement.executeUpdate()

        return@withContext
    }
}