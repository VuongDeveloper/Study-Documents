package com.ts.dictionary.service;

import com.ts.common.exception.ApiException;
import com.ts.dictionary.document.WordDefinition;
import com.ts.dictionary.document.WordLink;
import com.ts.dictionary.dto.WordDefinitionRequest;
import com.ts.dictionary.dto.WordDefinitionResponse;
import com.ts.dictionary.dto.WordGraphResponse;
import com.ts.dictionary.dto.WordLinkRequest;
import com.ts.dictionary.repository.WordDefinitionRepository;
import com.ts.dictionary.repository.WordLinkRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DictionaryService {

    private final WordDefinitionRepository wordDefinitionRepository;
    private final WordLinkRepository wordLinkRepository;
    private final MessageSource messageSource;

    private String msg(String key, Object... args) {
        return messageSource.getMessage(key, args, LocaleContextHolder.getLocale());
    }

    private String wordTextOrId(String wordId) {
        return wordDefinitionRepository.findById(wordId)
                .map(WordDefinition::getWord)
                .orElse(wordId);
    }

    public WordDefinitionResponse createWord(WordDefinitionRequest req, String userId) {
        WordDefinition word = WordDefinition.builder()
                .word(req.word())
                .createdByUserId(userId)
                .meaning(req.meaning())
                .usage(req.usage())
                .notes(req.notes())
                .examples(req.examples())
                .tags(req.tags())
                .images(req.images())
                .extra(req.extra())
                .build();
        word = wordDefinitionRepository.save(word);
        return toResponse(word, userId);
    }

    public WordDefinitionResponse getWord(String id, String userId) {
        WordDefinition word = wordDefinitionRepository.findByIdAndCreatedByUserId(id, userId)
                .orElseThrow(() -> new ApiException(404, msg("word.not.found")));
        return toResponse(word, userId);
    }

    public WordDefinitionResponse updateWord(String id, WordDefinitionRequest req, String userId) {
        WordDefinition word = wordDefinitionRepository.findByIdAndCreatedByUserId(id, userId)
                .orElseThrow(() -> new ApiException(404, msg("word.not.found")));

        word.setWord(req.word());
        word.setMeaning(req.meaning());
        word.setUsage(req.usage());
        word.setNotes(req.notes());
        word.setExamples(req.examples());
        word.setTags(req.tags());
        word.setImages(req.images());
        word.setExtra(req.extra());

        word = wordDefinitionRepository.save(word);
        return toResponse(word, userId);
    }

    public void deleteWord(String id, String userId) {
        WordDefinition word = wordDefinitionRepository.findByIdAndCreatedByUserId(id, userId)
                .orElseThrow(() -> new ApiException(404, msg("word.not.found")));
        wordDefinitionRepository.delete(word);
        wordLinkRepository.deleteByParentWordIdOrChildWordId(id, id);
    }

    public Page<WordDefinitionResponse> searchWords(String userId, String query, Pageable pageable) {
        if (query != null && !query.isBlank()) {
            // Match the query against the word text OR any tag (case-insensitive).
            List<WordDefinitionResponse> responses = wordDefinitionRepository
                    .searchByWordOrTag(userId, escapeRegex(query.trim())).stream()
                    .map(w -> toResponse(w, userId))
                    .sorted(Comparator.comparing(WordDefinitionResponse::word, String.CASE_INSENSITIVE_ORDER))
                    .toList();
            int start = (int) pageable.getOffset();
            int end = Math.min(start + pageable.getPageSize(), responses.size());
            List<WordDefinitionResponse> pageContent = start < responses.size()
                    ? responses.subList(start, end)
                    : List.of();
            return new org.springframework.data.domain.PageImpl<>(pageContent, pageable, responses.size());
        }
        return wordDefinitionRepository.findByCreatedByUserId(userId, pageable)
                .map(w -> toResponse(w, userId));
    }

    /** Escapes regex metacharacters so a user query is matched literally inside a Mongo $regex. */
    private static String escapeRegex(String input) {
        return input.replaceAll("[.*+?^${}()|\\[\\]\\\\]", "\\\\$0");
    }

    public List<WordDefinitionResponse> getRootWords(String userId) {
        List<WordDefinition> allWords = wordDefinitionRepository.findByCreatedByUserId(userId);
        Set<String> childIds = wordLinkRepository.findByCreatedByUserId(userId).stream()
                .map(WordLink::getChildWordId)
                .collect(Collectors.toSet());

        return allWords.stream()
                .filter(w -> !childIds.contains(w.getId()))
                .map(w -> toResponse(w, userId))
                .toList();
    }

    public WordGraphResponse getGraph(String userId) {
        List<WordDefinitionResponse> roots = getRootWords(userId);
        Set<String> visited = new HashSet<>();
        List<WordGraphResponse> rootNodes = roots.stream()
                .map(r -> buildGraphNode(r.id(), userId, visited))
                .toList();

        return new WordGraphResponse(null, "root", null, rootNodes);
    }

    public WordLink createLink(WordLinkRequest req, String userId) {
        checkForCycle(req.parentWordId(), req.childWordId(), userId);

        if (wordLinkRepository.existsByParentWordIdAndChildWordId(req.parentWordId(), req.childWordId())) {
            throw new ApiException(409, msg("link.already.exists",
                    wordTextOrId(req.parentWordId()),
                    wordTextOrId(req.childWordId())));
        }

        WordLink link = WordLink.builder()
                .parentWordId(req.parentWordId())
                .childWordId(req.childWordId())
                .position(req.position())
                .createdByUserId(userId)
                .build();
        return wordLinkRepository.save(link);
    }

    public void deleteLink(String linkId, String userId) {
        WordLink link = wordLinkRepository.findById(linkId)
                .orElseThrow(() -> new ApiException(404, msg("link.not.found")));
        if (!link.getCreatedByUserId().equals(userId)) {
            throw new ApiException(403, msg("link.unauthorized.delete"));
        }
        wordLinkRepository.delete(link);
    }

    public void updateLinkPosition(String linkId, int newPosition, String userId) {
        WordLink link = wordLinkRepository.findById(linkId)
                .orElseThrow(() -> new ApiException(404, msg("link.not.found")));
        if (!link.getCreatedByUserId().equals(userId)) {
            throw new ApiException(403, msg("link.unauthorized.update"));
        }
        link.setPosition(newPosition);
        wordLinkRepository.save(link);
    }

    public List<WordDefinitionResponse> getChildren(String wordId, String userId) {
        List<WordLink> links = wordLinkRepository.findByParentWordIdOrderByPosition(wordId);
        return links.stream()
                .map(link -> wordDefinitionRepository.findByIdAndCreatedByUserId(link.getChildWordId(), userId))
                .filter(Optional::isPresent)
                .map(opt -> toResponse(opt.get(), userId))
                .toList();
    }

    public List<WordDefinitionResponse> getParents(String wordId, String userId) {
        List<WordLink> links = wordLinkRepository.findByChildWordId(wordId);
        return links.stream()
                .map(link -> wordDefinitionRepository.findByIdAndCreatedByUserId(link.getParentWordId(), userId))
                .filter(Optional::isPresent)
                .map(opt -> toResponse(opt.get(), userId))
                .toList();
    }

    private void checkForCycle(String parentId, String childId, String userId) {
        if (parentId.equals(childId)) {
            throw new ApiException(400, msg("word.link.self", wordTextOrId(parentId)));
        }
        checkAncestors(parentId, childId);
    }

    private void checkAncestors(String currentAncestorId, String prospectiveChildId) {
        List<WordLink> ancestorLinks = wordLinkRepository.findByChildWordId(currentAncestorId);
        for (WordLink link : ancestorLinks) {
            if (link.getParentWordId().equals(prospectiveChildId)) {
                throw new ApiException(400, msg("word.link.cycle",
                        wordTextOrId(prospectiveChildId),
                        wordTextOrId(currentAncestorId)));
            }
            checkAncestors(link.getParentWordId(), prospectiveChildId);
        }
    }

    private WordDefinitionResponse toResponse(WordDefinition word, String userId) {
        List<String> parentIds = wordLinkRepository.findByChildWordId(word.getId()).stream()
                .map(WordLink::getParentWordId)
                .toList();
        List<String> childIds = wordLinkRepository.findByParentWordIdOrderByPosition(word.getId()).stream()
                .map(WordLink::getChildWordId)
                .toList();

        return new WordDefinitionResponse(
                word.getId(),
                word.getWord(),
                word.getMeaning(),
                word.getUsage(),
                word.getNotes(),
                word.getExamples(),
                word.getTags(),
                word.getImages(),
                word.getExtra(),
                word.getCreatedAt(),
                word.getUpdatedAt(),
                parentIds,
                childIds
        );
    }

    private WordGraphResponse buildGraphNode(String wordId, String userId, Set<String> visited) {
        if (visited.contains(wordId)) {
            return null;
        }
        visited.add(wordId);

        WordDefinition word = wordDefinitionRepository.findByIdAndCreatedByUserId(wordId, userId)
                .orElse(null);
        if (word == null) {
            return null;
        }

        List<WordLink> childLinks = wordLinkRepository.findByParentWordIdOrderByPosition(wordId);
        List<WordGraphResponse> children = childLinks.stream()
                .map(link -> buildGraphNode(link.getChildWordId(), userId, visited))
                .filter(Objects::nonNull)
                .toList();

        return new WordGraphResponse(word.getId(), word.getWord(), word.getMeaning(), children);
    }
}
