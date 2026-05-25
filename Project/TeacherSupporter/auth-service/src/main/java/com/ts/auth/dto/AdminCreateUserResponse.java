package com.ts.auth.dto;

public record AdminCreateUserResponse(
        String email,
        String role,
        String authMethod,
        String status
) {}
