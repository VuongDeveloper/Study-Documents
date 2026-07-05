package com.ts.course.repository;

import com.ts.course.entity.Submission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SubmissionRepository extends JpaRepository<Submission, Long> {

    List<Submission> findByAssignmentIdOrderBySubmittedAtDesc(Long assignmentId);

    List<Submission> findByAssignmentIdAndStudentIdOrderByAttemptNumberAsc(Long assignmentId, Long studentId);

    List<Submission> findByStudentIdOrderBySubmittedAtDesc(Long studentId);

    @Query("SELECT COALESCE(MAX(s.attemptNumber), 0) FROM Submission s " +
            "WHERE s.assignment.id = :assignmentId AND s.student.id = :studentId")
    int findMaxAttemptNumber(@Param("assignmentId") Long assignmentId, @Param("studentId") Long studentId);
}
