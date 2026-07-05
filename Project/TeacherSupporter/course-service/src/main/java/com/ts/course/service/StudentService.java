package com.ts.course.service;

import com.ts.common.exception.ApiException;
import com.ts.course.dto.*;
import com.ts.course.entity.Assignment;
import com.ts.course.entity.Course;
import com.ts.course.entity.Enrollment;
import com.ts.course.entity.Student;
import com.ts.course.repository.EnrollmentRepository;
import com.ts.course.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class StudentService {

    private static final String STATUS_ACTIVE = "ACTIVE";

    private final StudentRepository studentRepository;
    private final EnrollmentRepository enrollmentRepository;

    public StudentResponse getOrCreateStudent(StudentRequest req) {
        Student student = studentRepository.findByUserId(req.userId())
                .orElseGet(() -> {
                    Student newStudent = Student.builder()
                            .userId(req.userId())
                            .firstName(req.firstName())
                            .lastName(req.lastName())
                            .email(req.email())
                            .phone(req.phone())
                            .build();
                    return studentRepository.save(newStudent);
                });
        return toResponse(student);
    }

    @Transactional(readOnly = true)
    public List<StudentResponse> getAllStudents() {
        return studentRepository.findAll().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public StudentResponse getStudentByUserId(Long userId) {
        Student student = studentRepository.findByUserId(userId)
                .orElseThrow(() -> new ApiException(404, "Student not found with userId: " + userId));
        return toResponse(student);
    }

    @Transactional(readOnly = true)
    public List<CourseResponse> getStudentCourses(Long userId) {
        Student student = studentRepository.findByUserId(userId)
                .orElseThrow(() -> new ApiException(404, "Student not found with userId: " + userId));

        List<Enrollment> enrollments = enrollmentRepository.findByStudentId(student.getId());

        // Students only see published (ACTIVE) courses; DRAFT/ARCHIVED stay hidden.
        return enrollments.stream()
                .map(Enrollment::getCourse)
                .filter(course -> STATUS_ACTIVE.equals(course.getStatus()))
                .map(this::toCourseResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AssignmentResponse> getStudentAssignments(Long userId) {
        Student student = studentRepository.findByUserId(userId)
                .orElseThrow(() -> new ApiException(404, "Student not found with userId: " + userId));

        List<Enrollment> enrollments = enrollmentRepository.findByStudentId(student.getId());

        // Only assignments that are ACTIVE and belong to an ACTIVE course are visible.
        return enrollments.stream()
                .map(Enrollment::getCourse)
                .filter(course -> STATUS_ACTIVE.equals(course.getStatus()))
                .flatMap(course -> course.getAssignments().stream())
                .filter(assignment -> STATUS_ACTIVE.equals(assignment.getStatus()))
                .map(this::toAssignmentResponse)
                .collect(Collectors.toList());
    }

    private StudentResponse toResponse(Student student) {
        return new StudentResponse(
                student.getId(),
                student.getUserId(),
                student.getFirstName(),
                student.getLastName(),
                student.getEmail(),
                student.getPhone()
        );
    }

    private CourseResponse toCourseResponse(Course course) {
        return new CourseResponse(
                course.getId(),
                course.getName(),
                course.getDescription(),
                course.getStatus(),
                course.getTeacherUserId(),
                course.getStartDate(),
                course.getEndDate(),
                course.getCreatedAt()
        );
    }

    private AssignmentResponse toAssignmentResponse(Assignment assignment) {
        return new AssignmentResponse(
                assignment.getId(),
                assignment.getCourse().getId(),
                assignment.getTitle(),
                assignment.getDescription(),
                assignment.getStatus(),
                assignment.getDocumentUrl(),
                assignment.getStartDate(),
                assignment.getDueDate(),
                assignment.getCreatedAt()
        );
    }
}
