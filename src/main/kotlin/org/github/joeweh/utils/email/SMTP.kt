package org.github.joeweh.utils.email

import io.ktor.server.application.*
import jakarta.mail.*
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeBodyPart
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import java.util.*

class SMTP {
    companion object {
        fun sendEmail(recipient: String, emailTemplate: EmailTemplate) {
            val smtpConfig = Properties()
            smtpConfig["mail.smtp.auth"] = true
            smtpConfig["mail.smtp.starttls.enable"] = true
            smtpConfig["mail.smtp.host"] = "smtp.mailtrap.io"
            smtpConfig["mail.smtp.port"] = 25
            smtpConfig["mail.smtp.ssl.trust"] = "smtp.mailtrap.io"

            val session = Session.getInstance(smtpConfig, object : Authenticator() {
                override fun getPasswordAuthentication(): PasswordAuthentication {
                    return PasswordAuthentication(System.getenv("MAILTRAP_USERNAME"), System.getenv("MAILTRAP_PASSWORD"))
                }
            })

            val message: Message = MimeMessage(session)
            message.setFrom(InternetAddress("test@gmail.com"))
            message.setRecipients(
                Message.RecipientType.TO, InternetAddress.parse(recipient)
            )
            message.subject = emailTemplate.subject

            val msg = emailTemplate.compose()

            val mimeBodyPart = MimeBodyPart()
            mimeBodyPart.setContent(msg, "text/html; charset=utf-8")

            val multipart: Multipart = MimeMultipart()
            multipart.addBodyPart(mimeBodyPart)

            message.setContent(multipart)

            Transport.send(message)
        }
    }
}