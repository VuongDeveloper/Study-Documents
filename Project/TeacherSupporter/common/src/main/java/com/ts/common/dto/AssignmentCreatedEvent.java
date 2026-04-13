package com.ts.common.dto;

import java.util.List;

public record AssignmentCreatedEvent(
        Long assignmentId,
        Long courseId,
        String title,
        String dueDate,
        List<String> enrolledStudentEmails
) {}
