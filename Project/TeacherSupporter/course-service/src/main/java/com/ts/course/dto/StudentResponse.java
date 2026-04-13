package com.ts.course.dto;

public record StudentResponse(
        Long id,
        Long userId,
        String firstName,
        String lastName,
        String email,
        String phone
) {}
