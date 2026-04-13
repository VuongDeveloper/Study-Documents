package com.ts.course.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record CourseResponse(
        Long id,
        String name,
        String description,
        String status,
        Long teacherUserId,
        LocalDate startDate,
        LocalDate endDate,
        LocalDateTime createdAt
) {}
