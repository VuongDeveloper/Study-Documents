package com.ts.notification.listener;

import com.ts.common.dto.UserRegisteredEvent;
import com.ts.notification.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class UserRegisteredListener {

    private final EmailService emailService;

    @KafkaListener(topics = "ts.user.registered", groupId = "notification-group")
    public void onUserRegistered(UserRegisteredEvent event) {
        log.info("Received user registered event for userId={}", event.userId());

        if ("EMAIL".equalsIgnoreCase(event.activationMethod())) {
            emailService.sendActivationEmail(event.email(), event.firstName(), event.activationCode());
        } else {
            log.info("Activation method is '{}' for user {}. Activation link: {}",
                    event.activationMethod(), event.userId(), emailService.activationLink(event.activationCode()));
        }
    }
}
