import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import './search.css';

const VISIBLE_STEP = 60;

function formatThaiShortDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function matchesSearchQuery(subject, lowerQuery) {
  if (!lowerQuery) return true;
  if (subject.code?.toLowerCase().includes(lowerQuery)) return true;
  if (subject.nameTh?.toLowerCase().includes(lowerQuery)) return true;
  if (subject.nameEn?.toLowerCase().includes(lowerQuery)) return true;
  if (subject.faculty?.toLowerCase().includes(lowerQuery)) return true;
  if (subject.dept?.toLowerCase().includes(lowerQuery)) return true;
  if (subject.prerequisites?.some((req) => req.toLowerCase().includes(lowerQuery))) return true;
  return Boolean(
    subject.sections?.some((sec) =>
      sec.instructors?.some((ins) => ins.toLowerCase().includes(lowerQuery))
    )
  );
}

/**
 * โมดูลส่วนที่ 2 : ค้นหารายวิชา 5 วิทยาเขต, กรองรูปแบบการเรียน และป้ายวิชาบังคับก่อน
 */
export function SearchSidebar({
  subjects = [],
  manifest = null,
  semesterId = '',
  campusCode = '01',
  loadingCampus = false,
  loadError = null,
  onChangeSemester,
  onChangeCampus,
  onRetryLoad,
  enrolledCourses = [],
  onToggleCourseSec,
}) {
  const [query, setQuery] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP);

  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setFacultyFilter('all');
    setVisibleCount(VISIBLE_STEP);
  }, [campusCode, semesterId]);

  useEffect(() => {
    setVisibleCount(VISIBLE_STEP);
  }, [deferredQuery, facultyFilter, modeFilter]);

  const semesterOptions = manifest?.semesters || [];
  const activeSemester = useMemo(
    () => semesterOptions.find((s) => s.id === semesterId) || semesterOptions[0] || null,
    [semesterOptions, semesterId]
  );
  const campusOptions = activeSemester?.campuses || [];

  const facultyOptions = useMemo(() => {
    const counts = new Map();
    for (const s of subjects) {
      const fac = s.faculty && s.faculty !== '-' ? s.faculty : 'ไม่ระบุคณะ';
      counts.set(fac, (counts.get(fac) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'));
  }, [subjects]);

  const baseMatches = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return subjects.filter((s) => {
      if (facultyFilter !== 'all') {
        const fac = s.faculty && s.faculty !== '-' ? s.faculty : 'ไม่ระบุคณะ';
        if (fac !== facultyFilter) return false;
      }
      return matchesSearchQuery(s, q);
    });
  }, [subjects, facultyFilter, deferredQuery]);

  const modeCounts = useMemo(() => {
    let online = 0;
    let onsite = 0;
    for (const s of baseMatches) {
      const hasOnline = s.sections?.some((sec) => sec.isOnline);
      const hasOnsite = s.sections?.some((sec) => !sec.isOnline);
      if (hasOnline) online += 1;
      if (hasOnsite) onsite += 1;
    }
    return { all: baseMatches.length, online, onsite };
  }, [baseMatches]);

  const filteredSubjects = useMemo(() => {
    if (modeFilter === 'all') return baseMatches;
    if (modeFilter === 'online') {
      return baseMatches.filter((s) => s.sections?.some((sec) => sec.isOnline));
    }
    return baseMatches.filter((s) => s.sections?.some((sec) => !sec.isOnline));
  }, [baseMatches, modeFilter]);

  const visibleSubjects = useMemo(
    () => filteredSubjects.slice(0, visibleCount),
    [filteredSubjects, visibleCount]
  );

  const enrolledSecMap = useMemo(() => {
    const map = new Map();
    enrolledCourses.forEach((item) => {
      map.set(item.subjectId, item.sec);
    });
    return map;
  }, [enrolledCourses]);

  function handleJumpToPrereq(reqCode) {
    setFacultyFilter('all');
    setModeFilter('all');
    setQuery(reqCode);
  }

  const updatedLabel = formatThaiShortDate(manifest?.updatedAt);

  return (
    <aside className="search-sidebar" aria-label="ค้นหารายวิชา">
      <div className="search-header">
        <div className="search-box">
          <span className="search-input-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="search"
            id="courseSearchInput"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหารหัสวิชา ชื่อวิชา หรือผู้สอน..."
            aria-label="ค้นหารหัสวิชา ชื่อวิชา หรือผู้สอน"
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

        <div className="filter-row">
          <select
            id="semesterSelect"
            className="filter-select"
            value={semesterId}
            onChange={(e) => onChangeSemester?.(e.target.value)}
            aria-label="เลือกภาคการศึกษา"
            disabled={semesterOptions.length === 0}
          >
            {semesterOptions.length === 0 ? (
              <option value="">เทอม 2/2569</option>
            ) : (
              semesterOptions.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  เทอม {sem.label}
                </option>
              ))
            )}
          </select>

          <select
            id="campusSelect"
            className="filter-select"
            value={campusCode}
            onChange={(e) => onChangeCampus?.(e.target.value)}
            aria-label="เลือกวิทยาเขต"
            disabled={campusOptions.length === 0}
          >
            {campusOptions.length === 0 ? (
              <option value="01">วิทยาเขตหาดใหญ่</option>
            ) : (
              campusOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.shortName} ({c.subjectCount.toLocaleString()})
                </option>
              ))
            )}
          </select>
        </div>

        <select
          id="facultySelect"
          className="filter-select"
          value={facultyFilter}
          onChange={(e) => setFacultyFilter(e.target.value)}
          aria-label="เลือกคณะหรือหน่วยงาน"
          disabled={loadingCampus || facultyOptions.length === 0}
        >
          <option value="all">ทุกคณะ / หน่วยงาน ({subjects.length.toLocaleString()})</option>
          {facultyOptions.map((fac) => (
            <option key={fac.name} value={fac.name}>
              {fac.name} ({fac.count.toLocaleString()})
            </option>
          ))}
        </select>

        <div className="mode-filter-bar" role="group" aria-label="ตัวกรองรูปแบบการเรียน">
          <button
            type="button"
            className={`mode-pill${modeFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setModeFilter('all')}
            aria-pressed={modeFilter === 'all'}
          >
            <span>ทั้งหมด</span>
            <span className="mode-pill-count">{modeCounts.all.toLocaleString()}</span>
          </button>
          <button
            type="button"
            className={`mode-pill${modeFilter === 'online' ? ' is-active' : ''}`}
            onClick={() => setModeFilter('online')}
            aria-pressed={modeFilter === 'online'}
          >
            <span>ออนไลน์ / ไม่ระบุห้อง</span>
            <span className="mode-pill-count">{modeCounts.online.toLocaleString()}</span>
          </button>
          <button
            type="button"
            className={`mode-pill${modeFilter === 'onsite' ? ' is-active' : ''}`}
            onClick={() => setModeFilter('onsite')}
            aria-pressed={modeFilter === 'onsite'}
          >
            <span>มีห้องเรียน</span>
            <span className="mode-pill-count">{modeCounts.onsite.toLocaleString()}</span>
          </button>
        </div>

        <div className="search-meta-hint" role="status" aria-atomic="true">
          <span>
            {loadingCampus
              ? 'กำลังโหลดข้อมูลรายวิชา...'
              : `พบ ${filteredSubjects.length.toLocaleString()} จาก ${subjects.length.toLocaleString()} รายวิชา`}
          </span>
          {updatedLabel && <span>อัปเดต {updatedLabel}</span>}
        </div>
      </div>

      <div className="catalog-list" id="catalogList">
        {loadError ? (
          <div className="catalog-state-box is-error" role="alert">
            <span>{loadError}</span>
            <button type="button" className="btn-retry-load" onClick={onRetryLoad}>
              ลองโหลดใหม่
            </button>
          </div>
        ) : loadingCampus ? (
          <div className="catalog-state-box">กำลังโหลดรายวิชาของวิทยาเขตที่เลือก...</div>
        ) : filteredSubjects.length === 0 ? (
          <div className="empty-catalog">
            ไม่พบรายวิชาที่ตรงกับเงื่อนไข{query ? ` “${query}”` : ''}
          </div>
        ) : (
          <>
            {visibleSubjects.map((subj) => {
              const activeSec = enrolledSecMap.get(subj.id);
              const hasOnlineSection = subj.sections?.some((sec) => sec.isOnline);
              const hasPrereqCodes = Array.isArray(subj.prerequisites) && subj.prerequisites.length > 0;
              const hasPrereqTextOnly =
                !hasPrereqCodes && subj.prerequisiteText && subj.prerequisiteText !== '-';

              return (
                <article
                  key={subj.id}
                  className={`course-card${activeSec ? ' is-enrolled' : ''}`}
                  data-subject-code={subj.code}
                >
                  <div className="course-card-top">
                    <span className="course-code">{subj.code}</span>
                    <div className="course-card-badges">
                      {hasOnlineSection && <span className="course-online-tag">ออนไลน์/ไม่ระบุห้อง</span>}
                      <span className="course-campus-tag">{subj.campus}</span>
                    </div>
                  </div>
                  <div className="course-name-en">{subj.nameEn}</div>
                  <div className="course-name-th">{subj.nameTh}</div>
                  <div className="course-credits">{subj.credits}</div>
                  {subj.faculty && subj.faculty !== '-' && (
                    <div className="course-faculty" title={`${subj.faculty} · ${subj.dept}`}>
                      {subj.faculty}
                    </div>
                  )}

                  {(hasPrereqCodes || hasPrereqTextOnly) && (
                    <div className="prereq-row">
                      <span className="prereq-label">บังคับก่อน:</span>
                      {hasPrereqCodes ? (
                        subj.prerequisites.map((reqCode) => (
                          <button
                            key={reqCode}
                            type="button"
                            className="prereq-badge"
                            onClick={() => handleJumpToPrereq(reqCode)}
                            title={`คลิกเพื่อค้นหารายวิชาบังคับก่อน ${reqCode}`}
                          >
                            {reqCode}
                          </button>
                        ))
                      ) : (
                        <span className="prereq-note" title={subj.prerequisiteText}>
                          {subj.prerequisiteText}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="sec-buttons">
                    {(subj.sections || []).map((section) => {
                      const isSelected = activeSec === section.sec;
                      const instructorsText =
                        section.instructors && section.instructors.length > 0
                          ? section.instructors.join(', ')
                          : '-';

                      return (
                        <button
                          key={section.sec}
                          type="button"
                          className={`btn-sec${isSelected ? ' is-selected' : ''}`}
                          data-subject-code={subj.code}
                          data-sec={section.sec}
                          aria-pressed={isSelected}
                          title={`${section.dayTime} | ห้อง: ${section.room} | ผู้สอน: ${instructorsText} | ผู้เรียน: ${section.group} | ${section.seats}`}
                          onClick={() => onToggleCourseSec(subj, section)}
                        >
                          <span className="sec-main">
                            <span className="sec-num">Sec {section.sec}</span>
                            <span className="sec-time">
                              {section.slots?.length > 0 ? section.dayTime : 'ไม่ระบุเวลา'}
                            </span>
                          </span>
                          <span className="sec-side">
                            <span className="sec-room-pill">
                              {section.room && section.room !== '-' ? section.room : section.isOnline ? 'ONLINE' : '-'}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}

            {visibleCount < filteredSubjects.length && (
              <button
                type="button"
                className="btn-load-more"
                onClick={() => setVisibleCount((prev) => prev + VISIBLE_STEP)}
              >
                แสดงเพิ่ม ({visibleSubjects.length.toLocaleString()} /{' '}
                {filteredSubjects.length.toLocaleString()})
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
