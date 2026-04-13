package com.ts.course.controller;

import com.ts.course.dto.AssignmentRequest;
import com.ts.course.dto.AssignmentResponse;
import com.ts.course.service.AssignmentService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/assignments")
@RequiredArgsConstructor
@Tag(name = "Assignments")
public class AssignmentController {

    private final AssignmentService assignmentService;

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
}
