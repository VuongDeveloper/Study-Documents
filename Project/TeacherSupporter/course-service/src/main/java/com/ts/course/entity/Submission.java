package com.ts.course.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "submission")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Submission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignment_id", nullable = false)
    private Assignment assignment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    @Column(name = "attempt_number", nullable = false)
    private Integer attemptNumber;

    @Column(name = "text_content", columnDefinition = "TEXT")
    private String textContent;

    @Column(name = "link_url", length = 500)
    private String linkUrl;

    /** Object key in MinIO/S3; null when no file was uploaded. */
    @Column(name = "file_object_key", length = 500)
    private String fileObjectKey;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "status", nullable = false)
    @Builder.Default
    private String status = "SUBMITTED";

    @Column(name = "score")
    private Double score;

    @Column(name = "feedback", columnDefinition = "TEXT")
    private String feedback;

    /** userId of the teacher who graded this submission. */
    @Column(name = "graded_by")
    private Long gradedBy;

    @Column(name = "submitted_at", updatable = false)
    private LocalDateTime submittedAt;

    @Column(name = "graded_at")
    private LocalDateTime gradedAt;

    @PrePersist
    protected void onCreate() {
        this.submittedAt = LocalDateTime.now();
    }
}
