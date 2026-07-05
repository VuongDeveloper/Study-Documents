package com.ts.course.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public record GradeRequest(
        @NotNull(message = "Score is required")
        @DecimalMin(value = "0.0", message = "Score must be at least 0")
        @DecimalMax(value = "100.0", message = "Score must be at most 100")
        Double score,
        String feedback
) {}
