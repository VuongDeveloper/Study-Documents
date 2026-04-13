package com.ts.notification.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender javaMailSender;
    private final SpringTemplateEngine templateEngine;

    public void sendActivationEmail(String to, String firstName, String activationCode) {
        Context context = new Context();
        context.setVariable("firstName", firstName);
        context.setVariable("activationLink", "http://localhost:8080/api/auth/activate?code=" + activationCode);

        String htmlContent = templateEngine.process("activation-email", context);

        try {
            MimeMessage message = javaMailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(to);
            helper.setSubject("Activate your TeacherSupporter account");
            helper.setText(htmlContent, true);
            javaMailSender.send(message);
            log.info("Activation email sent to {}", to);
        } catch (MessagingException e) {
            log.error("Failed to send activation email to {}. Content: {}", to, htmlContent, e);
        }
    }

    public void sendAssignmentNotification(String to, String title, String dueDate) {
        Context context = new Context();
        context.setVariable("title", title);
        context.setVariable("dueDate", dueDate);

        String htmlContent = templateEngine.process("assignment-notification", context);

        try {
            MimeMessage message = javaMailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(to);
            helper.setSubject("New Assignment: " + title);
            helper.setText(htmlContent, true);
            javaMailSender.send(message);
            log.info("Assignment notification email sent to {}", to);
        } catch (MessagingException e) {
            log.error("Failed to send assignment notification to {}. Content: {}", to, htmlContent, e);
        }
    }
}
