package com.ts.dictionary.controller;

import com.ts.dictionary.document.WordLink;
import com.ts.dictionary.dto.WordDefinitionRequest;
import com.ts.dictionary.dto.WordDefinitionResponse;
import com.ts.dictionary.dto.WordGraphResponse;
import com.ts.dictionary.dto.WordLinkRequest;
import com.ts.dictionary.service.DictionaryService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/")
@RequiredArgsConstructor
@Tag(name = "Dictionary")
@PreAuthorize("hasRole('TEACHER')")
public class DictionaryController {

    private final DictionaryService dictionaryService;

    // ---- Word endpoints ----

    @GetMapping("/words")
    public Page<WordDefinitionResponse> searchWords(
            @RequestParam(required = false) String q,
            Pageable pageable,
            Authentication authentication) {
        String userId = authentication.getName();
        return dictionaryService.searchWords(userId, q, pageable);
    }

    @GetMapping("/words/{id}")
    public WordDefinitionResponse getWord(@PathVariable String id, Authentication authentication) {
        String userId = authentication.getName();
        return dictionaryService.getWord(id, userId);
    }

    @PostMapping("/words")
    public ResponseEntity<WordDefinitionResponse> createWord(
            @Valid @RequestBody WordDefinitionRequest request,
            Authentication authentication) {
        String userId = authentication.getName();
        WordDefinitionResponse response = dictionaryService.createWord(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/words/{id}")
    public WordDefinitionResponse updateWord(
            @PathVariable String id,
            @Valid @RequestBody WordDefinitionRequest request,
            Authentication authentication) {
        String userId = authentication.getName();
        return dictionaryService.updateWord(id, request, userId);
    }

    @DeleteMapping("/words/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteWord(@PathVariable String id, Authentication authentication) {
        String userId = authentication.getName();
        dictionaryService.deleteWord(id, userId);
    }

    @GetMapping("/words/{id}/parents")
    public List<WordDefinitionResponse> getParents(@PathVariable String id, Authentication authentication) {
        String userId = authentication.getName();
        return dictionaryService.getParents(id, userId);
    }

    @GetMapping("/words/{id}/children")
    public List<WordDefinitionResponse> getChildren(@PathVariable String id, Authentication authentication) {
        String userId = authentication.getName();
        return dictionaryService.getChildren(id, userId);
    }

    // ---- Link / graph endpoints ----

    @GetMapping("/roots")
    public List<WordDefinitionResponse> getRootWords(Authentication authentication) {
        String userId = authentication.getName();
        return dictionaryService.getRootWords(userId);
    }

    @GetMapping("/graph")
    public WordGraphResponse getGraph(Authentication authentication) {
        String userId = authentication.getName();
        return dictionaryService.getGraph(userId);
    }

    @PostMapping("/links")
    public ResponseEntity<WordLink> createLink(
            @Valid @RequestBody WordLinkRequest request,
            Authentication authentication) {
        String userId = authentication.getName();
        WordLink link = dictionaryService.createLink(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(link);
    }

    @DeleteMapping("/links/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLink(@PathVariable String id, Authentication authentication) {
        String userId = authentication.getName();
        dictionaryService.deleteLink(id, userId);
    }

    @PatchMapping("/links/{id}")
    public void updateLinkPosition(
            @PathVariable String id,
            @RequestBody Map<String, Integer> body,
            Authentication authentication) {
        String userId = authentication.getName();
        int newPosition = body.get("position");
        dictionaryService.updateLinkPosition(id, newPosition, userId);
    }
}
