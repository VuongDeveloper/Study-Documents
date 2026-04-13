package com.ts.common.dto;

public record CourseDto(
        Long id,
        String name,
        String description,
        String status
) {}
