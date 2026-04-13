package com.ts.common.dto;

public record StudentDto(
        Long id,
        Long userId,
        String firstName,
        String lastName,
        String email
) {}
