package com.ts.course.dto;

import java.time.LocalDateTime;

public record EnrollmentResponse(
        Long id,
        Long courseId,
        Long studentId,
        String studentName,
        LocalDateTime enrolledAt,
        String status
) {}
