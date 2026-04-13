package com.ts.course.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record AssignmentResponse(
        Long id,
        Long courseId,
        String title,
        String description,
        String status,
        String documentUrl,
        LocalDate startDate,
        LocalDate dueDate,
        LocalDateTime createdAt
) {}
