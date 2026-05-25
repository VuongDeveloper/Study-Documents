package com.ts.course.listener;

import com.ts.common.dto.UserActivatedEvent;
import com.ts.course.entity.Student;
import com.ts.course.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class UserActivatedListener {

    private static final String ROLE_STUDENT = "STUDENT";

    private final StudentRepository studentRepository;

    @KafkaListener(topics = "ts.user.activated", groupId = "course-group")
    public void onUserActivated(UserActivatedEvent event) {
        if (!ROLE_STUDENT.equalsIgnoreCase(event.role())) {
            return;
        }

        Long userId = Long.parseLong(event.userId());
        if (studentRepository.findByUserId(userId).isPresent()) {
            return;
        }

        Student student = Student.builder()
                .userId(userId)
                .firstName(event.firstName())
                .lastName(event.lastName())
                .email(event.email())
                .build();
        studentRepository.save(student);

        log.info("Provisioned student row for userId={}", userId);
    }
}
