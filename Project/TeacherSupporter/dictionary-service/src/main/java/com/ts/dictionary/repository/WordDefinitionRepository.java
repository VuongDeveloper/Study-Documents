package com.ts.dictionary.repository;

import com.ts.dictionary.document.WordDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.util.List;
import java.util.Optional;

public interface WordDefinitionRepository extends MongoRepository<WordDefinition, String> {

    List<WordDefinition> findByCreatedByUserId(String userId);

    Page<WordDefinition> findByCreatedByUserId(String userId, Pageable pageable);

    Optional<WordDefinition> findByIdAndCreatedByUserId(String id, String userId);

    List<WordDefinition> findByCreatedByUserIdAndWordContainingIgnoreCase(String userId, String query);

    /**
     * Matches the user's words whose word text OR any tag matches the given regex (case-insensitive).
     * The caller must pass an already regex-escaped query. A {@code $regex} on the {@code tags} array
     * matches when any element matches.
     */
    @Query("{ 'createdByUserId': ?0, '$or': [ "
            + "{ 'word': { '$regex': ?1, '$options': 'i' } }, "
            + "{ 'tags': { '$regex': ?1, '$options': 'i' } } ] }")
    List<WordDefinition> searchByWordOrTag(String userId, String regex);
}
