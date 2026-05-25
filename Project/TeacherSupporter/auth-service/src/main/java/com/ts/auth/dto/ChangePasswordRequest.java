package com.ts.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank String tempToken,
        @NotBlank @Size(min = 8) String newPassword
) {}
