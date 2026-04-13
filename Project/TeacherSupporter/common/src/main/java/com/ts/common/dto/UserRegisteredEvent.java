package com.ts.common.dto;

public record UserRegisteredEvent(
        String userId,
        String email,
        String firstName,
        String activationCode,
        String activationMethod
) {}
