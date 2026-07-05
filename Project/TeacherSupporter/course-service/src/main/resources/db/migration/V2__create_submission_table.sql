CREATE TABLE submission (
    id              BIGSERIAL PRIMARY KEY,
    assignment_id   BIGINT NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
    student_id      BIGINT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    attempt_number  INT NOT NULL,
    text_content    TEXT,
    link_url        VARCHAR(500),
    file_object_key VARCHAR(500),
    file_name       VARCHAR(255),
    status          VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
    score           NUMERIC(5, 2),
    feedback        TEXT,
    graded_by       BIGINT,
    submitted_at    TIMESTAMP DEFAULT NOW(),
    graded_at       TIMESTAMP,
    UNIQUE (assignment_id, student_id, attempt_number)
);

CREATE INDEX idx_submission_assignment ON submission(assignment_id);
CREATE INDEX idx_submission_student ON submission(student_id);
