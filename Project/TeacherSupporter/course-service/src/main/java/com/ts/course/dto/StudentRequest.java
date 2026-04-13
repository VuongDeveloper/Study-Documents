package com.ts.course.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;

public record StudentRequest(
        @NotNull(message = "User ID is required")
        Long userId,
        String firstName,
        String lastName,
        @Email(message = "Invalid email format")
        String email,
        String phone
) {}
