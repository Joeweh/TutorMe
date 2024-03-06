package org.github.joeweh

import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import org.github.joeweh.plugins.*

fun main() {
    val port = Integer.parseInt(System.getenv("PORT"))

    embeddedServer(Netty, port = port, host = "0.0.0.0", module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    configureSockets()
    configureHTTP()
    configureRouting()
}
