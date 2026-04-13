package com.ts.dictionary.dto;

import java.util.List;

public record WordGraphResponse(
        String id,
        String word,
        String meaning,
        List<WordGraphResponse> children
) {}
