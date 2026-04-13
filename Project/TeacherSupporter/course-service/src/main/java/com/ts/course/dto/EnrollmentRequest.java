package com.ts.course.dto;

import jakarta.validation.constraints.NotNull;

public record EnrollmentRequest(
        @NotNull(message = "Course ID is required")
        Long courseId,
        @NotNull(message = "Student ID is required")
        Long studentId
) {}
