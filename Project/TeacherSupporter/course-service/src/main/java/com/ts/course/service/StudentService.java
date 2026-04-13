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

        return enrollments.stream()
                .map(Enrollment::getCourse)
                .map(this::toCourseResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AssignmentResponse> getStudentAssignments(Long userId) {
        Student student = studentRepository.findByUserId(userId)
                .orElseThrow(() -> new ApiException(404, "Student not found with userId: " + userId));

        List<Enrollment> enrollments = enrollmentRepository.findByStudentId(student.getId());

        return enrollments.stream()
                .map(Enrollment::getCourse)
                .flatMap(course -> course.getAssignments().stream())
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
