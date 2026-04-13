package com.ts.course.event;

import com.ts.common.dto.AssignmentCreatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AssignmentCreatedPublisher {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void publish(AssignmentCreatedEvent event) {
        kafkaTemplate.send("ts.assignment.created", String.valueOf(event.assignmentId()), event);
    }
}
