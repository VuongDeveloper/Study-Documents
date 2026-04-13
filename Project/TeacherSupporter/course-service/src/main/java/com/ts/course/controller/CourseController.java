package com.ts.course.controller;

import com.ts.course.dto.AssignmentRequest;
import com.ts.course.dto.AssignmentResponse;
import com.ts.course.dto.CourseRequest;
import com.ts.course.dto.CourseResponse;
import com.ts.course.service.AssignmentService;
import com.ts.course.service.CourseService;
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

@RestController
@RequestMapping("/courses")
@RequiredArgsConstructor
@Tag(name = "Courses")
public class CourseController {

    private final CourseService courseService;
    private final AssignmentService assignmentService;

    @GetMapping
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<Page<CourseResponse>> getTeacherCourses(Authentication authentication,
                                                                   Pageable pageable) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(courseService.getTeacherCourses(userId, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CourseResponse> getCourse(@PathVariable Long id) {
        return ResponseEntity.ok(courseService.getCourse(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<CourseResponse> createCourse(@Valid @RequestBody CourseRequest request,
                                                       Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED).body(courseService.createCourse(request, userId));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<CourseResponse> updateCourse(@PathVariable Long id,
                                                       @Valid @RequestBody CourseRequest request,
                                                       Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(courseService.updateCourse(id, request, userId));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<Void> deleteCourse(@PathVariable Long id,
                                              Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        courseService.deleteCourse(id, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/assignments")
    public ResponseEntity<List<AssignmentResponse>> getCourseAssignments(@PathVariable Long id) {
        return ResponseEntity.ok(assignmentService.getCourseAssignments(id));
    }

    @PostMapping("/{id}/assignments")
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<AssignmentResponse> createAssignment(@PathVariable Long id,
                                                                @Valid @RequestBody AssignmentRequest request,
                                                                Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        AssignmentRequest req = new AssignmentRequest(id, request.title(), request.description(),
                request.status(), request.documentUrl(), request.startDate(), request.dueDate());
        return ResponseEntity.status(HttpStatus.CREATED).body(assignmentService.createAssignment(req, userId));
    }
}
