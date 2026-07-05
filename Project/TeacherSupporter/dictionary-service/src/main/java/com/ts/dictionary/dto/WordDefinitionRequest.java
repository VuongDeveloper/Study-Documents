package com.ts.dictionary.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.Map;

public record WordDefinitionRequest(
        @NotBlank String word,
        String meaning,
        String usage,
        String notes,
        List<String> examples,
        List<String> tags,
        List<String> images,
        Map<String, Object> extra
) {}
