package org.github.joeweh.plugins

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.github.joeweh.routing.userRouting

fun Application.configureRouting() {
    routing {
        userRouting()

        get("/ping") {
            call.respond(HttpStatusCode.OK, "Pong")
        }
    }
}
