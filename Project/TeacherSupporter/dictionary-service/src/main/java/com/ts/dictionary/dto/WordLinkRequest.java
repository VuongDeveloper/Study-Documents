package com.ts.dictionary.dto;

import jakarta.validation.constraints.NotBlank;

public record WordLinkRequest(
        @NotBlank String parentWordId,
        @NotBlank String childWordId,
        int position
) {}
