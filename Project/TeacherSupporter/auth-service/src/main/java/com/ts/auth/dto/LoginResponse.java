package com.ts.auth.dto;

public record LoginResponse(
        String accessToken,
        String refreshToken,
        boolean requiresTwoFactor,
        boolean mustChangePassword,
        String tempToken
) {}
