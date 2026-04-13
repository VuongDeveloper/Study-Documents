package com.ts.course.service;

import com.ts.common.exception.ApiException;
import com.ts.course.dto.EnrollmentRequest;
import com.ts.course.dto.EnrollmentResponse;
import com.ts.course.entity.Course;
import com.ts.course.entity.Enrollment;
import com.ts.course.entity.Student;
import com.ts.course.repository.CourseRepository;
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
public class EnrollmentService {

    private final EnrollmentRepository enrollmentRepository;
    private final CourseRepository courseRepository;
    private final StudentRepository studentRepository;

    public EnrollmentResponse enroll(EnrollmentRequest req, Long teacherUserId) {
        Course course = courseRepository.findByIdAndTeacherUserId(req.courseId(), teacherUserId)
                .orElseThrow(() -> new ApiException(403, "Course not found or you are not the owner"));

        Student student = studentRepository.findById(req.studentId())
                .orElseThrow(() -> new ApiException(404, "Student not found with id: " + req.studentId()));

        if (enrollmentRepository.existsByCourseIdAndStudentId(req.courseId(), req.studentId())) {
            throw new ApiException(409, "Student is already enrolled in this course");
        }

        Enrollment enrollment = Enrollment.builder()
                .course(course)
                .student(student)
                .status("ACTIVE")
                .build();

        enrollment = enrollmentRepository.save(enrollment);
        return toResponse(enrollment);
    }

    public void unenroll(Long enrollmentId, Long teacherUserId) {
        Enrollment enrollment = enrollmentRepository.findById(enrollmentId)
                .orElseThrow(() -> new ApiException(404, "Enrollment not found with id: " + enrollmentId));

        courseRepository.findByIdAndTeacherUserId(enrollment.getCourse().getId(), teacherUserId)
                .orElseThrow(() -> new ApiException(403, "You are not the owner of this course"));

        enrollmentRepository.delete(enrollment);
    }

    @Transactional(readOnly = true)
    public List<EnrollmentResponse> getCourseEnrollments(Long courseId) {
        return enrollmentRepository.findByCourseId(courseId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    private EnrollmentResponse toResponse(Enrollment enrollment) {
        Student student = enrollment.getStudent();
        String studentName = (student.getFirstName() != null ? student.getFirstName() : "") +
                (student.getLastName() != null ? " " + student.getLastName() : "");

        return new EnrollmentResponse(
                enrollment.getId(),
                enrollment.getCourse().getId(),
                student.getId(),
                studentName.trim(),
                enrollment.getEnrolledAt(),
                enrollment.getStatus()
        );
    }
}
