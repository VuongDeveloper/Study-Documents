package com.ts.course.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record AssignmentRequest(
        @NotNull(message = "Course ID is required")
        Long courseId,
        @NotBlank(message = "Title is required")
        String title,
        String description,
        String status,
        String documentUrl,
        LocalDate startDate,
        LocalDate dueDate
) {}
