package com.ts.auth.dto;

public record UserResponse(
        Long id,
        String email,
        String firstName,
        String lastName,
        String role,
        String provider,
        boolean totpEnabled,
        boolean activated
) {}
