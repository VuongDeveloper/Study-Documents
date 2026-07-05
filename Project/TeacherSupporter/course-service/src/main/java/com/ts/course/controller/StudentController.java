package com.ts.course.controller;

import com.ts.course.dto.AssignmentResponse;
import com.ts.course.dto.CourseResponse;
import com.ts.course.dto.StudentResponse;
import com.ts.course.service.StudentService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/students")
@RequiredArgsConstructor
@Tag(name = "Students")
public class StudentController {

    private final StudentService studentService;

    @GetMapping
    @PreAuthorize("hasRole('TEACHER')")
    public ResponseEntity<List<StudentResponse>> getAllStudents() {
        return ResponseEntity.ok(studentService.getAllStudents());
    }

    @GetMapping("/me/courses")
    @PreAuthorize("hasRole('STUDENT')")
    public ResponseEntity<List<CourseResponse>> getStudentCourses(Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(studentService.getStudentCourses(userId));
    }

    @GetMapping("/me/assignments")
    @PreAuthorize("hasRole('STUDENT')")
    public ResponseEntity<List<AssignmentResponse>> getStudentAssignments(Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(studentService.getStudentAssignments(userId));
    }
}
