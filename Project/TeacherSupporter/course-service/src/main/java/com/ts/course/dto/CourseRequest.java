package com.ts.course.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public record CourseRequest(
        @NotBlank(message = "Course name is required")
        String name,
        String description,
        String status,
        LocalDate startDate,
        LocalDate endDate
) {}
