package com.ts.course.service;

import com.ts.common.exception.ApiException;
import com.ts.course.dto.GradeRequest;
import com.ts.course.dto.SubmissionResponse;
import com.ts.course.entity.Assignment;
import com.ts.course.entity.Course;
import com.ts.course.entity.Student;
import com.ts.course.entity.Submission;
import com.ts.course.repository.AssignmentRepository;
import com.ts.course.repository.CourseRepository;
import com.ts.course.repository.EnrollmentRepository;
import com.ts.course.repository.StudentRepository;
import com.ts.course.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class SubmissionService {

    private static final String STATUS_ACTIVE = "ACTIVE";

    private final SubmissionRepository submissionRepository;
    private final AssignmentRepository assignmentRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final StudentRepository studentRepository;
    private final S3StorageService s3StorageService;

    /** Student submits a new attempt for an assignment. */
    public SubmissionResponse submit(Long assignmentId, Long studentUserId,
                                     String textContent, String linkUrl, MultipartFile file) {
        Assignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new ApiException(404, "Assignment not found with id: " + assignmentId));

        Student student = studentRepository.findByUserId(studentUserId)
                .orElseThrow(() -> new ApiException(404, "Student profile not found"));

        Course course = assignment.getCourse();
        if (!enrollmentRepository.existsByCourseIdAndStudentId(course.getId(), student.getId())) {
            throw new ApiException(403, "You are not enrolled in this course");
        }

        // Submission window: the assignment and its course must be published (ACTIVE)
        // and the current date must fall within [startDate, dueDate]. Otherwise a student
        // could submit to a draft/archived assignment or outside its open window.
        if (!STATUS_ACTIVE.equals(course.getStatus()) || !STATUS_ACTIVE.equals(assignment.getStatus())) {
            throw new ApiException(403, "This assignment is not open for submissions");
        }
        LocalDate today = LocalDate.now();
        if (assignment.getStartDate() != null && today.isBefore(assignment.getStartDate())) {
            throw new ApiException(403, "This assignment opens on " + assignment.getStartDate());
        }
        if (assignment.getDueDate() != null && today.isAfter(assignment.getDueDate())) {
            throw new ApiException(403, "The submission deadline (" + assignment.getDueDate() + ") has passed");
        }

        boolean hasFile = file != null && !file.isEmpty();
        if (!StringUtils.hasText(textContent) && !StringUtils.hasText(linkUrl) && !hasFile) {
            throw new ApiException(400, "A submission must include text, a link, or a file");
        }

        int nextAttempt = submissionRepository.findMaxAttemptNumber(assignmentId, student.getId()) + 1;

        Submission submission = Submission.builder()
                .assignment(assignment)
                .student(student)
                .attemptNumber(nextAttempt)
                .textContent(StringUtils.hasText(textContent) ? textContent : null)
                .linkUrl(StringUtils.hasText(linkUrl) ? linkUrl : null)
                .status("SUBMITTED")
                .build();

        if (hasFile) {
            String key = s3StorageService.upload(file, assignmentId, student.getId());
            submission.setFileObjectKey(key);
            submission.setFileName(file.getOriginalFilename());
        }

        submission = submissionRepository.save(submission);
        return toResponse(submission);
    }

    /** Teacher views all attempts submitted for one of their assignments. */
    @Transactional(readOnly = true)
    public List<SubmissionResponse> getAssignmentSubmissions(Long assignmentId, Long teacherUserId) {
        Assignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new ApiException(404, "Assignment not found with id: " + assignmentId));
        requireCourseOwner(assignment.getCourse().getId(), teacherUserId);

        return submissionRepository.findByAssignmentIdOrderBySubmittedAtDesc(assignmentId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /** A single submission, accessible to its owning student or the owning teacher. */
    @Transactional(readOnly = true)
    public SubmissionResponse getSubmission(Long submissionId, Long userId) {
        Submission submission = findOrThrow(submissionId);
        authorizeView(submission, userId);
        return toResponse(submission);
    }

    /** Student views their own submissions across all assignments. */
    @Transactional(readOnly = true)
    public List<SubmissionResponse> getStudentSubmissions(Long studentUserId) {
        Student student = studentRepository.findByUserId(studentUserId)
                .orElseThrow(() -> new ApiException(404, "Student profile not found"));
        return submissionRepository.findByStudentIdOrderBySubmittedAtDesc(student.getId()).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /** Teacher grades a submission: records score, optional feedback, marks GRADED. */
    public SubmissionResponse grade(Long submissionId, GradeRequest req, Long teacherUserId) {
        Submission submission = findOrThrow(submissionId);
        requireCourseOwner(submission.getAssignment().getCourse().getId(), teacherUserId);

        submission.setScore(req.score());
        submission.setFeedback(req.feedback());
        submission.setStatus("GRADED");
        submission.setGradedBy(teacherUserId);
        submission.setGradedAt(LocalDateTime.now());

        submission = submissionRepository.save(submission);
        return toResponse(submission);
    }

    private Submission findOrThrow(Long submissionId) {
        return submissionRepository.findById(submissionId)
                .orElseThrow(() -> new ApiException(404, "Submission not found with id: " + submissionId));
    }

    private void requireCourseOwner(Long courseId, Long teacherUserId) {
        courseRepository.findByIdAndTeacherUserId(courseId, teacherUserId)
                .orElseThrow(() -> new ApiException(403, "You are not the owner of this course"));
    }

    private void authorizeView(Submission submission, Long userId) {
        boolean isOwningStudent = submission.getStudent().getUserId().equals(userId);
        boolean isOwningTeacher = courseRepository
                .findByIdAndTeacherUserId(submission.getAssignment().getCourse().getId(), userId)
                .isPresent();
        if (!isOwningStudent && !isOwningTeacher) {
            throw new ApiException(403, "You do not have access to this submission");
        }
    }

    private SubmissionResponse toResponse(Submission s) {
        Student student = s.getStudent();
        String name = (orEmpty(student.getFirstName()) + " " + orEmpty(student.getLastName())).trim();
        if (name.isEmpty()) {
            name = student.getEmail();
        }
        String downloadUrl = s.getFileObjectKey() != null
                ? s3StorageService.presignedDownloadUrl(s.getFileObjectKey())
                : null;

        return new SubmissionResponse(
                s.getId(),
                s.getAssignment().getId(),
                student.getId(),
                name,
                s.getAttemptNumber(),
                s.getTextContent(),
                s.getLinkUrl(),
                s.getFileName(),
                downloadUrl,
                s.getStatus(),
                s.getScore(),
                s.getFeedback(),
                s.getGradedBy(),
                s.getSubmittedAt(),
                s.getGradedAt()
        );
    }

    private String orEmpty(String v) {
        return v != null ? v : "";
    }
}
