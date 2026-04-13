package com.ts.course.service;

import com.ts.common.exception.ApiException;
import com.ts.course.dto.CourseRequest;
import com.ts.course.dto.CourseResponse;
import com.ts.course.entity.Course;
import com.ts.course.repository.CourseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class CourseService {

    private final CourseRepository courseRepository;

    public Page<CourseResponse> getTeacherCourses(Long teacherUserId, Pageable pageable) {
        return courseRepository.findByTeacherUserId(teacherUserId, pageable)
                .map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public CourseResponse getCourse(Long id) {
        Course course = courseRepository.findById(id)
                .orElseThrow(() -> new ApiException(404, "Course not found with id: " + id));
        return toResponse(course);
    }

    public CourseResponse createCourse(CourseRequest req, Long teacherUserId) {
        Course course = Course.builder()
                .name(req.name())
                .description(req.description())
                .status(req.status() != null ? req.status() : "DRAFT")
                .teacherUserId(teacherUserId)
                .startDate(req.startDate())
                .endDate(req.endDate())
                .build();

        course = courseRepository.save(course);
        return toResponse(course);
    }

    public CourseResponse updateCourse(Long id, CourseRequest req, Long teacherUserId) {
        Course course = courseRepository.findByIdAndTeacherUserId(id, teacherUserId)
                .orElseThrow(() -> new ApiException(403, "Course not found or you are not the owner"));

        course.setName(req.name());
        course.setDescription(req.description());
        if (req.status() != null) {
            course.setStatus(req.status());
        }
        course.setStartDate(req.startDate());
        course.setEndDate(req.endDate());

        course = courseRepository.save(course);
        return toResponse(course);
    }

    public void deleteCourse(Long id, Long teacherUserId) {
        Course course = courseRepository.findByIdAndTeacherUserId(id, teacherUserId)
                .orElseThrow(() -> new ApiException(403, "Course not found or you are not the owner"));
        courseRepository.delete(course);
    }

    private CourseResponse toResponse(Course course) {
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
}
