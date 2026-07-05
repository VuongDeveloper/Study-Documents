package com.ts.dictionary.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record WordDefinitionResponse(
        String id,
        String word,
        String meaning,
        String usage,
        String notes,
        List<String> examples,
        List<String> tags,
        List<String> images,
        Map<String, Object> extra,
        Instant createdAt,
        Instant updatedAt,
        List<String> parentIds,
        List<String> childIds
) {}
