package com.ts.dictionary.repository;

import com.ts.dictionary.document.WordDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface WordDefinitionRepository extends MongoRepository<WordDefinition, String> {

    List<WordDefinition> findByCreatedByUserId(String userId);

    Page<WordDefinition> findByCreatedByUserId(String userId, Pageable pageable);

    Optional<WordDefinition> findByIdAndCreatedByUserId(String id, String userId);

    List<WordDefinition> findByCreatedByUserIdAndWordContainingIgnoreCase(String userId, String query);
}
