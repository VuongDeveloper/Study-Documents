package com.ts.auth.event;

import com.ts.auth.entity.User;
import com.ts.common.dto.UserActivatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class UserActivatedPublisher {

    private static final String TOPIC = "ts.user.activated";

    private final KafkaTemplate<String, UserActivatedEvent> kafkaTemplate;

    public void publish(User user) {
        UserActivatedEvent event = new UserActivatedEvent(
                String.valueOf(user.getId()),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getRole().name()
        );
        kafkaTemplate.send(TOPIC, event.userId(), event);
    }
}
