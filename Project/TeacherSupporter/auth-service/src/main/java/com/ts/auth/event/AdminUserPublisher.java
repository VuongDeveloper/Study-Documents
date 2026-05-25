package com.ts.auth.event;

import com.ts.common.dto.AdminProvisionedUserEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AdminUserPublisher {

    private static final String TOPIC = "ts.user.admin-provisioned";

    private final KafkaTemplate<String, AdminProvisionedUserEvent> kafkaTemplate;

    public void publish(AdminProvisionedUserEvent event) {
        kafkaTemplate.send(TOPIC, event.email(), event);
    }
}
