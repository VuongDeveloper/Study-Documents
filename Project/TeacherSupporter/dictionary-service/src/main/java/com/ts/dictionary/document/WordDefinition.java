package com.ts.dictionary.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Document(collection = "word_definitions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WordDefinition {

    @Id
    private String id;

    private String word;

    private String createdByUserId;

    private String meaning;

    private String usage;

    private String notes;

    private List<String> examples;

    private List<String> tags;

    private Map<String, Object> extra;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;
}
