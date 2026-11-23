import React, { useMemo, useState } from 'react';

/**
 * โมดูลส่วนที่ 2 : ค้นหารายวิชาและเลือกลงตาราง (Starter Working Base)
 *
 * ฟีเจอร์ที่มีให้ใน Base นี้:
 * - ช่องค้นหาจากรหัสวิชา, ชื่อภาษาไทย และชื่อภาษาอังกฤษ
 * - กดปุ่ม Sec XX เพื่อเพิ่มรายวิชาลงตาราง, สลับ Sec หรือกดซ้ำเพื่อลบออก
 *
 * TODO (คนที่ 2 - Data Pipeline & Search Lead):
 * 1. เขียนสคริปต์ดึงข้อมูลรายวิชา ม.อ. ใหม่ให้ครบทั้ง 5 วิทยาเขต (อย่าลืมเพิ่มวิทยาเขตภูเก็ต 03)
 * 2. แยกโหลดข้อมูลตามวิทยาเขตเพื่อไม่ให้เว็บโหลดช้าเมื่อมีหลายพันวิชา
 * 3. เพิ่มตัวกรอง: เลือกวิทยาเขต, เลือกภาคเรียน/ปีการศึกษา, กรองวิชาเรียนออนไลน์/ไม่ระบุห้อง และแสดงป้ายวิชาบังคับก่อน
 */
export function SearchSidebar({ subjects, enrolledCourses, onToggleCourseSec }) {
  const [query, setQuery] = useState('');

  const filteredSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => {
      return (
        s.code.toLowerCase().includes(q) ||
        s.nameTh.toLowerCase().includes(q) ||
        s.nameEn.toLowerCase().includes(q)
      );
    });
  }, [subjects, query]);

  const enrolledSecMap = useMemo(() => {
    const map = new Map();
    enrolledCourses.forEach((item) => {
      map.set(item.subjectId, item.sec);
    });
    return map;
  }, [enrolledCourses]);

  return (
    <aside className="search-sidebar" aria-label="ค้นหารายวิชา">
      <div className="search-header">
        <div className="search-box">
          <input
            type="search"
            id="courseSearchInput"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหารหัสวิชา หรือชื่อวิชา..."
            aria-label="ค้นหารหัสวิชา หรือชื่อวิชา"
          />
          {query && (
            <button
              type="button"
              className="btn-clear-search"
              onClick={() => setQuery('')}
              aria-label="ล้างคำค้นหา"
            >
              ×
            </button>
          )}
        </div>
        <div className="search-meta-hint">
          พบ {filteredSubjects.length} รายวิชา (ข้อมูลสมมติตั้งต้น · TODO คนที่ 2)
        </div>
      </div>

      <div className="catalog-list" id="catalogList">
        {filteredSubjects.length === 0 ? (
          <div className="empty-catalog">ไม่พบรายวิชาที่ตรงกับ "{query}"</div>
        ) : (
          filteredSubjects.map((subj) => {
            const activeSec = enrolledSecMap.get(subj.id);
            return (
              <article
                key={subj.id}
                className={`course-card${activeSec ? ' is-enrolled' : ''}`}
                data-subject-code={subj.code}
              >
                <div className="course-card-top">
                  <span className="course-code">{subj.code}</span>
                  <span className="course-campus-tag">{subj.campus}</span>
                </div>
                <div className="course-name-en">{subj.nameEn}</div>
                <div className="course-name-th">{subj.nameTh}</div>
                <div className="course-credits">{subj.credits}</div>

                <div className="sec-buttons">
                  {subj.sections.map((section) => {
                    const isSelected = activeSec === section.sec;
                    return (
                      <button
                        key={section.sec}
                        type="button"
                        className={`btn-sec${isSelected ? ' is-selected' : ''}`}
                        data-subject-code={subj.code}
                        data-sec={section.sec}
                        title={`${section.dayTime} | ห้อง: ${section.room} | ${section.group}`}
                        onClick={() => onToggleCourseSec(subj, section)}
                      >
                        <span className="sec-num">Sec {section.sec}</span>
                        <span className="sec-time">
                          {section.slots.length > 0 ? section.dayTime : 'ไม่ระบุเวลา'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
