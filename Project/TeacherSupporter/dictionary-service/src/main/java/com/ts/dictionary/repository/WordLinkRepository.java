package com.ts.dictionary.repository;

import com.ts.dictionary.document.WordLink;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface WordLinkRepository extends MongoRepository<WordLink, String> {

    List<WordLink> findByParentWordIdOrderByPosition(String parentWordId);

    List<WordLink> findByChildWordId(String childWordId);

    List<WordLink> findByCreatedByUserId(String userId);

    Optional<WordLink> findByParentWordIdAndChildWordId(String parentWordId, String childWordId);

    boolean existsByParentWordIdAndChildWordId(String parentWordId, String childWordId);

    void deleteByParentWordIdOrChildWordId(String parentWordId, String childWordId);

    List<WordLink> findByParentWordIdInAndCreatedByUserId(List<String> parentWordIds, String userId);
}
