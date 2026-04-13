package com.ts.course.service;

import com.ts.common.dto.AssignmentCreatedEvent;
import com.ts.common.exception.ApiException;
import com.ts.course.dto.AssignmentRequest;
import com.ts.course.dto.AssignmentResponse;
import com.ts.course.entity.Assignment;
import com.ts.course.entity.Course;
import com.ts.course.entity.Enrollment;
import com.ts.course.event.AssignmentCreatedPublisher;
import com.ts.course.repository.AssignmentRepository;
import com.ts.course.repository.CourseRepository;
import com.ts.course.repository.EnrollmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class AssignmentService {

    private final AssignmentRepository assignmentRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final AssignmentCreatedPublisher assignmentCreatedPublisher;

    @Transactional(readOnly = true)
    public List<AssignmentResponse> getCourseAssignments(Long courseId) {
        return assignmentRepository.findByCourseId(courseId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public AssignmentResponse getAssignment(Long id) {
        Assignment assignment = assignmentRepository.findById(id)
                .orElseThrow(() -> new ApiException(404, "Assignment not found with id: " + id));
        return toResponse(assignment);
    }

    public AssignmentResponse createAssignment(AssignmentRequest req, Long teacherUserId) {
        Course course = courseRepository.findByIdAndTeacherUserId(req.courseId(), teacherUserId)
                .orElseThrow(() -> new ApiException(403, "Course not found or you are not the owner"));

        Assignment assignment = Assignment.builder()
                .course(course)
                .title(req.title())
                .description(req.description())
                .status(req.status() != null ? req.status() : "DRAFT")
                .documentUrl(req.documentUrl())
                .startDate(req.startDate())
                .dueDate(req.dueDate())
                .build();

        assignment = assignmentRepository.save(assignment);

        // Publish event
        List<String> enrolledEmails = enrollmentRepository.findByCourseId(course.getId()).stream()
                .map(Enrollment::getStudent)
                .map(student -> student.getEmail())
                .filter(email -> email != null)
                .collect(Collectors.toList());

        AssignmentCreatedEvent event = new AssignmentCreatedEvent(
                assignment.getId(),
                course.getId(),
                assignment.getTitle(),
                assignment.getDueDate() != null ? assignment.getDueDate().toString() : null,
                enrolledEmails
        );
        assignmentCreatedPublisher.publish(event);

        return toResponse(assignment);
    }

    public AssignmentResponse updateAssignment(Long id, AssignmentRequest req, Long teacherUserId) {
        Assignment assignment = assignmentRepository.findById(id)
                .orElseThrow(() -> new ApiException(404, "Assignment not found with id: " + id));

        courseRepository.findByIdAndTeacherUserId(assignment.getCourse().getId(), teacherUserId)
                .orElseThrow(() -> new ApiException(403, "You are not the owner of this course"));

        assignment.setTitle(req.title());
        assignment.setDescription(req.description());
        if (req.status() != null) {
            assignment.setStatus(req.status());
        }
        assignment.setDocumentUrl(req.documentUrl());
        assignment.setStartDate(req.startDate());
        assignment.setDueDate(req.dueDate());

        assignment = assignmentRepository.save(assignment);
        return toResponse(assignment);
    }

    public void deleteAssignment(Long id, Long teacherUserId) {
        Assignment assignment = assignmentRepository.findById(id)
                .orElseThrow(() -> new ApiException(404, "Assignment not found with id: " + id));

        courseRepository.findByIdAndTeacherUserId(assignment.getCourse().getId(), teacherUserId)
                .orElseThrow(() -> new ApiException(403, "You are not the owner of this course"));

        assignmentRepository.delete(assignment);
    }

    private AssignmentResponse toResponse(Assignment assignment) {
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
