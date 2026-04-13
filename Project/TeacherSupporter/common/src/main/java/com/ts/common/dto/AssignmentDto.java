package com.ts.common.dto;

public record AssignmentDto(
        Long id,
        Long courseId,
        String title,
        String status
) {}
