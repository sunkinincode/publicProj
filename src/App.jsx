import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { loadCampusCatalog, loadCatalogManifest } from './data/catalogLoader';
import { TopbarExtras } from './modules/part1-ui/TopbarExtras';
import { ThemePanelSlot } from './modules/part1-ui/ThemePanelSlot';
import { SearchSidebar } from './modules/part2-search/SearchSidebar';
import { TimetableGrid } from './modules/part3-timetable/TimetableGrid';
import { PlanShareSlot } from './modules/part4-plan-share/PlanShareSlot';
import { ExportSlot } from './modules/part5-export-qa/ExportSlot';

export default function App() {
  const [manifest, setManifest] = useState(null);
  const [semesterId, setSemesterId] = useState('2569-2');
  const [campusCode, setCampusCode] = useState('01');
  const [subjects, setSubjects] = useState([]);
  const [knownSubjectsById, setKnownSubjectsById] = useState(() => new Map());
  const [loadingCampus, setLoadingCampus] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [enrolledCourses, setEnrolledCourses] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadActiveCatalog() {
      setLoadingCampus(true);
      setLoadError(null);
      try {
        const mf = manifest || (await loadCatalogManifest());
        if (cancelled) return;
        if (!manifest) {
          setManifest(mf);
        }

        const activeSem =
          mf.semesters.find((s) => s.id === semesterId) ||
          mf.semesters.find((s) => s.id === mf.defaultSemester) ||
          mf.semesters[0];

        const activeCampus =
          activeSem?.campuses.find((c) => c.code === campusCode) ||
          activeSem?.campuses.find((c) => c.code === mf.defaultCampus) ||
          activeSem?.campuses[0];

        if (!activeCampus) {
          setSubjects([]);
          return;
        }

        const payload = await loadCampusCatalog(activeCampus.file);
        if (cancelled) return;

        const nextSubjects = Array.isArray(payload.subjects) ? payload.subjects : [];
        setSubjects(nextSubjects);
        setKnownSubjectsById((prev) => {
          const next = new Map(prev);
          for (const subj of nextSubjects) {
            next.set(subj.id, subj);
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลรายวิชา');
        }
      } finally {
        if (!cancelled) {
          setLoadingCampus(false);
        }
      }
    }

    loadActiveCatalog();
    return () => {
      cancelled = true;
    };
  }, [manifest, semesterId, campusCode, reloadTick]);

  const timetableSubjects = useMemo(() => {
    const merged = new Map(subjects.map((s) => [s.id, s]));
    for (const enrolled of enrolledCourses) {
      if (!merged.has(enrolled.subjectId)) {
        const known = knownSubjectsById.get(enrolled.subjectId);
        if (known) merged.set(known.id, known);
      }
    }
    return Array.from(merged.values());
  }, [subjects, enrolledCourses, knownSubjectsById]);

  const handleToggleCourseSec = useCallback((subject, section) => {
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
  }, []);

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
        {/* ส่วนที่ 2: ค้นหารายวิชา 5 วิทยาเขตและกดเลือก Section */}
        <SearchSidebar
          subjects={subjects}
          manifest={manifest}
          semesterId={semesterId}
          campusCode={campusCode}
          loadingCampus={loadingCampus}
          loadError={loadError}
          onChangeSemester={setSemesterId}
          onChangeCampus={setCampusCode}
          onRetryLoad={() => setReloadTick((n) => n + 1)}
          enrolledCourses={enrolledCourses}
          onToggleCourseSec={handleToggleCourseSec}
        />

        {/* พื้นที่ฝั่งขวา: แถบตกแต่ง (คนที่ 1) + ตารางเรียน (คนที่ 3) */}
        <div className="board-column">
          <ThemePanelSlot />
          <TimetableGrid
            subjects={timetableSubjects}
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
