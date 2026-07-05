package com.ts.course.controller;

import com.ts.course.dto.AssignmentRequest;
import com.ts.course.dto.AssignmentResponse;
import com.ts.course.dto.SubmissionResponse;
import com.ts.course.service.AssignmentService;
import com.ts.course.service.SubmissionService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/assignments")
@RequiredArgsConstructor
@Tag(name = "Assignments")
public class AssignmentController {

    private final AssignmentService assignmentService;
    private final SubmissionService submissionService;

    @GetMapping("/{id}")
    public ResponseEntity<AssignmentResponse> getAssignment(@PathVariable Long id) {
        return ResponseEntity.ok(assignmentService.getAssignment(id));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<AssignmentResponse> updateAssignment(@PathVariable Long id,
                                                                @Valid @RequestBody AssignmentRequest request,
                                                                Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(assignmentService.updateAssignment(id, request, userId));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<Void> deleteAssignment(@PathVariable Long id,
                                                  Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        assignmentService.deleteAssignment(id, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/submissions")
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<List<SubmissionResponse>> getAssignmentSubmissions(@PathVariable Long id,
                                                                             Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(submissionService.getAssignmentSubmissions(id, userId));
    }

    @PostMapping(value = "/{id}/submissions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('STUDENT')")
    public ResponseEntity<SubmissionResponse> submit(@PathVariable Long id,
                                                     @RequestParam(required = false) String textContent,
                                                     @RequestParam(required = false) String linkUrl,
                                                     @RequestPart(required = false) MultipartFile file,
                                                     Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        SubmissionResponse created = submissionService.submit(id, userId, textContent, linkUrl, file);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
