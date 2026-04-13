package com.ts.dictionary.config;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.CompoundIndexDefinition;
import org.springframework.data.mongodb.core.index.Index;
import lombok.RequiredArgsConstructor;
import org.bson.Document;

@Configuration
@RequiredArgsConstructor
public class MongoIndexConfig {

    private final MongoTemplate mongoTemplate;

    @EventListener(ApplicationReadyEvent.class)
    public void initIndexes() {
        // word_definitions: { createdByUserId: 1 }
        mongoTemplate.indexOps("word_definitions")
                .ensureIndex(new Index().on("createdByUserId", Sort.Direction.ASC));

        // word_links: { parentWordId: 1, position: 1 }
        mongoTemplate.indexOps("word_links")
                .ensureIndex(new CompoundIndexDefinition(
                        new Document("parentWordId", 1).append("position", 1)
                ));

        // word_links: { childWordId: 1 }
        mongoTemplate.indexOps("word_links")
                .ensureIndex(new Index().on("childWordId", Sort.Direction.ASC));

        // word_links: { parentWordId: 1, childWordId: 1 } unique
        mongoTemplate.indexOps("word_links")
                .ensureIndex(new CompoundIndexDefinition(
                        new Document("parentWordId", 1).append("childWordId", 1)
                ).unique());
    }
}
