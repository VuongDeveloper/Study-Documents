package com.ts.course.scheduler;

import com.ts.course.entity.Course;
import com.ts.course.repository.CourseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * Periodically transitions courses through date-driven lifecycle changes.
 * Currently: archives ACTIVE courses once their end date has passed, which also
 * removes them from students' views (see StudentService ACTIVE-only filters).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CourseLifecycleScheduler {

    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final String STATUS_ARCHIVED = "ARCHIVED";

    private final CourseRepository courseRepository;

    /** Runs daily at 01:00. Archives ACTIVE courses whose end date is in the past. */
    @Scheduled(cron = "0 0 1 * * *")
    @Transactional
    public void archiveExpiredCourses() {
        LocalDate today = LocalDate.now();
        List<Course> expired = courseRepository.findByStatusAndEndDateBefore(STATUS_ACTIVE, today);
        if (expired.isEmpty()) {
            return;
        }
        expired.forEach(course -> course.setStatus(STATUS_ARCHIVED));
        courseRepository.saveAll(expired);
        log.info("Auto-archived {} course(s) past their end date", expired.size());
    }
}
