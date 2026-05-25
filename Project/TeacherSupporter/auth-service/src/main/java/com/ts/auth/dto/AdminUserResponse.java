package com.ts.auth.dto;

import java.time.LocalDateTime;

public record AdminUserResponse(
        Long id,
        String email,
        String firstName,
        String lastName,
        String role,
        String provider,
        boolean activated,
        boolean mustChangePassword,
        LocalDateTime createdAt
) {}
