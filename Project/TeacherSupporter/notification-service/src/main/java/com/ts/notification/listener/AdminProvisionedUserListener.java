package com.ts.notification.listener;

import com.ts.common.dto.AdminProvisionedUserEvent;
import com.ts.notification.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class AdminProvisionedUserListener {

    private static final String AUTH_METHOD_PASSWORD = "PASSWORD";
    private static final String AUTH_METHOD_GOOGLE = "GOOGLE";

    private final EmailService emailService;

    @KafkaListener(topics = "ts.user.admin-provisioned", groupId = "notification-group")
    public void onAdminProvisionedUser(AdminProvisionedUserEvent event) {
        log.info("Received admin-provisioned user event for email={} authMethod={}", event.email(), event.authMethod());

        if (AUTH_METHOD_GOOGLE.equalsIgnoreCase(event.authMethod())) {
            emailService.sendInvitationEmail(event.email(), event.role(), event.inviteToken());
        } else if (AUTH_METHOD_PASSWORD.equalsIgnoreCase(event.authMethod())) {
            emailService.sendTempPasswordEmail(event.email(), event.role(), event.tempPassword());
        } else {
            log.warn("Unknown authMethod '{}' for admin-provisioned user {}", event.authMethod(), event.email());
        }
    }
}
