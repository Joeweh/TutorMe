package org.github.joeweh.utils.email.templates

import org.github.joeweh.utils.email.EmailTemplate
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

class Welcome(private val name: String) : EmailTemplate {
    override val subject: String = "Welcome!"
    override fun compose(): String {
        return StringBuffer().appendHTML().html {
            body {
                h1 {
                    + "Welcome $name!"
                }
            }
        }.toString()
    }
}