package com.ts.dictionary.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "word_links")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WordLink {

    @Id
    private String id;

    @Indexed
    private String parentWordId;

    @Indexed
    private String childWordId;

    private int position;

    private String createdByUserId;
}
