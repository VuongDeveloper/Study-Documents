package com.ts.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record AdminUpdateUserRequest(
        @NotBlank String role
) {}
