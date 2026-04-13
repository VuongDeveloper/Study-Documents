package com.ts.auth.dto;

public record ActivationResponse(
        String message,
        String activationLink
) {}
