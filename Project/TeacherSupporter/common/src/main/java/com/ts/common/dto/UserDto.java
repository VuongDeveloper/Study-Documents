package com.ts.common.dto;

public record UserDto(
        Long id,
        String email,
        String firstName,
        String lastName,
        String role
) {}
