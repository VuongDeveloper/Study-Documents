package com.ts.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record AdminCreateUserRequest(
        @Email @NotBlank String email,
        @NotBlank String role,
        @NotBlank String authMethod,
        String firstName,
        String lastName
) {}
