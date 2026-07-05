package com.ts.course.repository;

import com.ts.course.entity.Course;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CourseRepository extends JpaRepository<Course, Long> {

    Page<Course> findByTeacherUserId(Long teacherUserId, Pageable pageable);

    Optional<Course> findByIdAndTeacherUserId(Long id, Long teacherUserId);

    List<Course> findByStatusAndEndDateBefore(String status, LocalDate date);
}
