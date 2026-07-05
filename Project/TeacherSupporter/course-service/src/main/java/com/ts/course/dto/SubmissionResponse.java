package com.ts.course.dto;

import java.time.LocalDateTime;

public record SubmissionResponse(
        Long id,
        Long assignmentId,
        Long studentId,
        String studentName,
        Integer attemptNumber,
        String textContent,
        String linkUrl,
        String fileName,
        String fileDownloadUrl,
        String status,
        Double score,
        String feedback,
        Long gradedBy,
        LocalDateTime submittedAt,
        LocalDateTime gradedAt
) {}
