package com.ts.common.dto;

public record UserActivatedEvent(
        String userId,
        String email,
        String firstName,
        String lastName,
        String role
) {}
