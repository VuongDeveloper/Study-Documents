package com.ts.auth.event;

import com.ts.common.dto.UserRegisteredEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class UserRegisteredPublisher {

    private final KafkaTemplate<String, UserRegisteredEvent> kafkaTemplate;

    public void publish(UserRegisteredEvent event) {
        kafkaTemplate.send("ts.user.registered", event.userId(), event);
    }
}
