package com.ts.course.controller;

import com.ts.course.dto.GradeRequest;
import com.ts.course.dto.SubmissionResponse;
import com.ts.course.service.SubmissionService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/submissions")
@RequiredArgsConstructor
@Tag(name = "Submissions")
public class SubmissionController {

    private final SubmissionService submissionService;

    @GetMapping("/me")
    @PreAuthorize("hasRole('STUDENT')")
    public ResponseEntity<List<SubmissionResponse>> getMySubmissions(Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(submissionService.getStudentSubmissions(userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<SubmissionResponse> getSubmission(@PathVariable Long id,
                                                            Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(submissionService.getSubmission(id, userId));
    }

    @PostMapping("/{id}/grade")
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<SubmissionResponse> grade(@PathVariable Long id,
                                                    @Valid @RequestBody GradeRequest request,
                                                    Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(submissionService.grade(id, request, userId));
    }
}
