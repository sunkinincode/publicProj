import React, { useState } from 'react';
import { MOCK_SUBJECTS } from './data/mockSubjects';
import { TopbarExtras } from './modules/part1-ui/TopbarExtras';
import { ThemePanelSlot } from './modules/part1-ui/ThemePanelSlot';
import { SearchSidebar } from './modules/part2-search/SearchSidebar';
import { TimetableGrid } from './modules/part3-timetable/TimetableGrid';
import { PlanShareSlot } from './modules/part4-plan-share/PlanShareSlot';
import { ExportSlot } from './modules/part5-export-qa/ExportSlot';

export default function App() {
  const [subjects] = useState(MOCK_SUBJECTS);
  const [enrolledCourses, setEnrolledCourses] = useState([]);

  function handleToggleCourseSec(subject, section) {
    setEnrolledCourses((prev) => {
      const existing = prev.find((item) => item.subjectId === subject.id);
      if (existing && existing.sec === section.sec) {
        return prev.filter((item) => item.subjectId !== subject.id);
      }

      const nextCourse = {
        subjectId: subject.id,
        code: subject.code,
        nameTh: subject.nameTh,
        nameEn: subject.nameEn,
        creditNum: subject.creditNum,
        campus: subject.campus,
        prerequisites: subject.prerequisites,
        sec: section.sec,
        section,
      };

      if (existing) {
        return prev.map((item) => (item.subjectId === subject.id ? nextCourse : item));
      }
      return [...prev, nextCourse];
    });
  }

  function handleRemoveCourse(subjectId) {
    setEnrolledCourses((prev) => prev.filter((item) => item.subjectId !== subjectId));
  }

  function handleClearSchedule() {
    setEnrolledCourses([]);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-badge">PSU</span>
          <h1 className="app-title">ม.อ. จัดตารางเรียน · Starter Base</h1>
        </div>

        {/* จุดเชื่อมต่อโมดูลส่วนที่ 1, 4 และ 5 บนแถบด้านบน */}
        <div className="topbar-slots">
          <TopbarExtras />
          <PlanShareSlot
            enrolledCourses={enrolledCourses}
            onReplaceSchedule={setEnrolledCourses}
          />
          <ExportSlot enrolledCourses={enrolledCourses} />
        </div>
      </header>

      <main className="workspace">
        {/* ส่วนที่ 2: ค้นหารายวิชาและกดเลือก Section */}
        <SearchSidebar
          subjects={subjects}
          enrolledCourses={enrolledCourses}
          onToggleCourseSec={handleToggleCourseSec}
        />

        {/* พื้นที่ฝั่งขวา: แถบตกแต่ง (คนที่ 1) + ตารางเรียน (คนที่ 3) */}
        <div className="board-column">
          <ThemePanelSlot />
          <TimetableGrid
            subjects={subjects}
            enrolledCourses={enrolledCourses}
            onToggleCourseSec={handleToggleCourseSec}
            onReplaceSchedule={setEnrolledCourses}
            onRemoveCourse={handleRemoveCourse}
            onClearSchedule={handleClearSchedule}
          />
        </div>
      </main>
    </div>
  );
}
