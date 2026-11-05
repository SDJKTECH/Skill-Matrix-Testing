import React, { useState } from "react";
import toast from "react-hot-toast";
import LearningCenterAdmin from "./LearningCenterAdmin";
import { AddCoursePage } from "./add-course";

/**
 * Single Admin Dashboard entry for Manage Courses:
 * course list -> Add/Edit Course -> Add/Edit Lesson (lesson step lives inside AddCoursePage).
 */
export default function LearningCenterSection({ onBack, onGoHome }) {
  // false = course list; true = add-course editor
  const [showAddCourse, setShowAddCourse] = useState(false);

  const toList = () => setShowAddCourse(false);
  const trail = [
    { key: "home", label: "Home", onClick: onGoHome },
    { key: "admin", label: "Admin Dashboard", onClick: onBack },
    { key: "learning-center", label: "Course Management", onClick: toList },
  ];

  if (showAddCourse) {
    return (
      <AddCoursePage
        breadcrumbItems={trail}
        onBack={toList}
        onSaved={(course) => {
          toast.success(`Course "${course.title}" created.`);
          toList();
        }}
      />
    );
  }

  return (
    <LearningCenterAdmin
      breadcrumbItems={trail}
      onAddCourse={() => setShowAddCourse(true)}
    />
  );
}
