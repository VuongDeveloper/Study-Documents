package com.ts.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record TotpVerifyRequest(
        @NotBlank String tempToken,
        @NotBlank String code
) {}
