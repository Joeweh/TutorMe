package org.github.joeweh.utils.email.templates

import org.github.joeweh.utils.email.EmailTemplate
import kotlinx.html.*
import kotlinx.html.stream.appendHTML

class VerifyAccount(private val code: Int) : EmailTemplate {
    override val subject: String = "Account Verification"
    override fun compose(): String {
        return StringBuffer().appendHTML().html {
            body {
                h1 {
                    + "Code: $code"
                }
            }
        }.toString()
    }
}