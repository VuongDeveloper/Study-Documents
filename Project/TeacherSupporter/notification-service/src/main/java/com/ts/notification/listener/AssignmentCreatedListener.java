package com.ts.notification.listener;

import com.ts.common.dto.AssignmentCreatedEvent;
import com.ts.notification.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class AssignmentCreatedListener {

    private final EmailService emailService;

    @KafkaListener(topics = "ts.assignment.created", groupId = "notification-group")
    public void onAssignmentCreated(AssignmentCreatedEvent event) {
        log.info("Received assignment created event for assignmentId={}, courseId={}",
                event.assignmentId(), event.courseId());

        if (event.enrolledStudentEmails() != null) {
            for (String email : event.enrolledStudentEmails()) {
                emailService.sendAssignmentNotification(email, event.title(), event.dueDate());
            }
        }
    }
}
