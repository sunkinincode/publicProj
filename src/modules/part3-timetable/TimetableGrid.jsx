import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DAYS, HOURS, MOCK_SUBJECTS } from '../../data/mockSubjects';
import { AutoSchedulerModal } from './AutoSchedulerModal';
import {
  CREDIT_MAX,
  assignDayLanes,
  detectClassClashes,
  detectExamClashes,
  detectPrerequisiteWarnings,
  getAlternativeSections,
  getCreditSummary,
  getRestrictedCourses,
} from './scheduleUtils';
import { usePointerSectionDrag } from './usePointerSectionDrag';
import './timetable.css';

const START_MINUTE = 8 * 60; // 08:00
const TOTAL_MINUTES = 13 * 60; // 08:00 - 21:00 (13 ช่องชั่วโมง)
const PASSED_PREREQS_STORAGE_KEY = 'psu-timetable-passed-prereqs';
const LANDING_HIGHLIGHT_MS = 620;

function loadPassedPrereqs() {
  try {
    const raw = window.localStorage.getItem(PASSED_PREREQS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function savePassedPrereqs(codes) {
  try {
    window.localStorage.setItem(PASSED_PREREQS_STORAGE_KEY, JSON.stringify(codes));
  } catch {
    // ignore storage quota/privacy errors
  }
}

/**
 * โมดูลส่วนที่ 3 : ตารางเรียนรายสัปดาห์ (Timetable, Clash Detection, Pointer Drag & Auto-Scheduler)
 */
export function TimetableGrid({
  subjects = MOCK_SUBJECTS,
  enrolledCourses,
  onToggleCourseSec,
  onReplaceSchedule,
  onRemoveCourse,
  onClearSchedule,
}) {
  const [passedCodes, setPassedCodes] = useState(loadPassedPrereqs);
  const [pickSubjectId, setPickSubjectId] = useState(null);
  const [hoverPickSec, setHoverPickSec] = useState(null);
  const [justLanded, setJustLanded] = useState(null);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);

  const landedTimerRef = useRef(null);

  useEffect(() => {
    savePassedPrereqs(passedCodes);
  }, [passedCodes]);

  useEffect(() => {
    return () => {
      if (landedTimerRef.current !== null) {
        window.clearTimeout(landedTimerRef.current);
      }
    };
  }, []);

  const unscheduledCourses = useMemo(
    () =>
      enrolledCourses.filter(
        (item) => !item.section.slots || item.section.slots.length === 0
      ),
    [enrolledCourses]
  );

  const creditSummary = useMemo(
    () => getCreditSummary(enrolledCourses),
    [enrolledCourses]
  );

  const { clashingSlotKeys, classClashes } = useMemo(
    () => detectClassClashes(enrolledCourses),
    [enrolledCourses]
  );

  const examClashes = useMemo(
    () => detectExamClashes(enrolledCourses),
    [enrolledCourses]
  );

  const restrictedCourses = useMemo(
    () => getRestrictedCourses(enrolledCourses),
    [enrolledCourses]
  );

  const { warnings: prereqWarnings, warningSubjectIds: prereqWarningSubjectIds } = useMemo(
    () => detectPrerequisiteWarnings(enrolledCourses, subjects, passedCodes),
    [enrolledCourses, subjects, passedCodes]
  );

  const subjectById = useMemo(() => {
    const map = new Map();
    for (const subject of subjects) {
      map.set(subject.id, subject);
    }
    return map;
  }, [subjects]);

  const handleCommitSwitch = useCallback(
    (subjectId, targetSec) => {
      if (!subjectId || !targetSec || !onToggleCourseSec) {
        return;
      }

      const subject = subjectById.get(subjectId);
      const targetSection = subject?.sections?.find((sec) => sec.sec === targetSec);
      if (!subject || !targetSection) {
        return;
      }

      const currentCourse = enrolledCourses.find((c) => c.subjectId === subjectId);
      const alts = getAlternativeSections(
        subject,
        currentCourse?.sec,
        enrolledCourses
      );
      const matchedAlt = alts.find((alt) => alt.section.sec === targetSec);
      const isClash = Boolean(
        matchedAlt && (matchedAlt.hasClassClash || matchedAlt.hasExamClash)
      );

      onToggleCourseSec(subject, targetSection);
      setPickSubjectId(null);
      setHoverPickSec(null);

      if (landedTimerRef.current !== null) {
        window.clearTimeout(landedTimerRef.current);
      }
      setJustLanded({ subjectId, sec: targetSec, isClash });
      landedTimerRef.current = window.setTimeout(() => {
        landedTimerRef.current = null;
        setJustLanded(null);
      }, LANDING_HIGHLIGHT_MS);
    },
    [enrolledCourses, onToggleCourseSec, subjectById]
  );

  const { dragState, startPointerTracking } = usePointerSectionDrag({
    onCommitSwitch: handleCommitSwitch,
  });

  const activeSubjectId = dragState?.subjectId ?? pickSubjectId;
  const activeHoverSec = dragState?.hoverSec ?? hoverPickSec;

  const switchedCourse = useMemo(
    () =>
      activeSubjectId
        ? enrolledCourses.find((course) => course.subjectId === activeSubjectId) || null
        : null,
    [activeSubjectId, enrolledCourses]
  );

  const switchedSubject = switchedCourse ? subjectById.get(switchedCourse.subjectId) : null;

  const alternativeSections = useMemo(
    () =>
      switchedSubject && switchedCourse
        ? getAlternativeSections(switchedSubject, switchedCourse.sec, enrolledCourses)
        : [],
    [switchedSubject, switchedCourse, enrolledCourses]
  );

  const hoveredDragAlt = useMemo(() => {
    if (!dragState?.hoverSec) return null;
    return alternativeSections.find((alt) => alt.section.sec === dragState.hoverSec) || null;
  }, [alternativeSections, dragState]);

  const isSpotlightActive = Boolean(
    dragState?.phase === 'dragging' || (pickSubjectId && switchedCourse)
  );

  function handleConfirmPassed(reqCode) {
    setPassedCodes((prev) => (prev.includes(reqCode) ? prev : [...prev, reqCode]));
  }

  function handleRemovePassed(reqCode) {
    setPassedCodes((prev) => prev.filter((code) => code !== reqCode));
  }

  const hasCreditAlert = creditSummary.status === 'low' || creditSummary.status === 'high';
  const hasAlerts =
    classClashes.length > 0 ||
    examClashes.length > 0 ||
    prereqWarnings.length > 0 ||
    restrictedCourses.length > 0 ||
    hasCreditAlert;

  return (
    <section className="timetable-stage" aria-label="ตารางเรียน">
      <div className="sheet-card">
        <div className="sheet-header">
          <div className="sheet-header-left">
            <h2 className="sheet-title">ตารางเรียน</h2>
            <span className="sheet-count-pill">{enrolledCourses.length} วิชา</span>
            <span
              className={`credit-pill is-${creditSummary.status}`}
              title={creditSummary.message}
            >
              {creditSummary.totalCredits} / {CREDIT_MAX} หน่วยกิต
            </span>
          </div>

          <div className="sheet-header-actions">
            {subjects.length > 0 && onReplaceSchedule && (
              <button
                type="button"
                className="btn-auto-schedule"
                onClick={() => setIsSchedulerOpen(true)}
              >
                จัดตารางอัตโนมัติ
              </button>
            )}
            {enrolledCourses.length > 0 && (
              <button type="button" className="btn-clear-all" onClick={onClearSchedule}>
                ล้างตาราง
              </button>
            )}
          </div>
        </div>

        {(hasAlerts || passedCodes.length > 0) && (
          <div className="timetable-alerts" role="status" aria-live="polite">
            {classClashes.map((clash) => (
              <div key={clash.id} className="alert-item is-danger">
                <span className="alert-badge">เวลาเรียนชน</span>
                <span className="alert-text">
                  วัน{clash.dayName}: {clash.courseA.code} (Sec {clash.courseA.sec} ·{' '}
                  {clash.timeA}) ชนกับ {clash.courseB.code} (Sec {clash.courseB.sec} ·{' '}
                  {clash.timeB})
                </span>
              </div>
            ))}

            {examClashes.map((clash) => (
              <div key={clash.id} className="alert-item is-danger">
                <span className="alert-badge">วันสอบชน</span>
                <span className="alert-text">
                  {clash.typeLabel} {clash.dateKey}: {clash.courseA.code} (Sec{' '}
                  {clash.courseA.sec} · {clash.timeA}) ชนกับ {clash.courseB.code} (Sec{' '}
                  {clash.courseB.sec} · {clash.timeB})
                </span>
              </div>
            ))}

            {prereqWarnings.map((warning) => (
              <div
                key={warning.id}
                className={`alert-item ${
                  warning.type === 'concurrent' ? 'is-danger' : 'is-warning'
                }`}
              >
                <span className="alert-badge">บังคับก่อน</span>
                <span className="alert-text">{warning.message}</span>
                {warning.type === 'unverified' && (
                  <button
                    type="button"
                    className="btn-confirm-prereq"
                    onClick={() => handleConfirmPassed(warning.reqCode)}
                  >
                    ยืนยันว่าผ่านแล้ว
                  </button>
                )}
              </div>
            ))}

            {hasCreditAlert && (
              <div
                className={`alert-item ${
                  creditSummary.status === 'high' ? 'is-danger' : 'is-warning'
                }`}
              >
                <span className="alert-badge">หน่วยกิต</span>
                <span className="alert-text">{creditSummary.message}</span>
              </div>
            )}

            {restrictedCourses.map((item) => (
              <div key={item.subjectId} className="alert-item is-warning">
                <span className="alert-badge">เฉพาะกลุ่ม</span>
                <span className="alert-text">
                  {item.code} {item.nameTh} (Sec {item.sec}) — {item.group}
                </span>
              </div>
            ))}

            {passedCodes.length > 0 && (
              <div className="passed-prereqs-bar">
                <span className="passed-prereqs-label">ยืนยันวิชาบังคับก่อนที่ผ่านแล้ว:</span>
                {passedCodes.map((code) => (
                  <span key={code} className="passed-chip">
                    {code}
                    <button
                      type="button"
                      className="passed-chip-remove"
                      onClick={() => handleRemovePassed(code)}
                      aria-label={`ยกเลิกการยืนยันวิชา ${code}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {switchedCourse && switchedSubject && alternativeSections.length > 0 && (
          <div className="drag-switch-bar">
            <div className="drag-switch-info">
              <strong>
                สลับ Section: {switchedCourse.code} {switchedCourse.nameTh} (Sec{' '}
                {switchedCourse.sec})
              </strong>
              <span className="drag-switch-hint">
                ลากไปวางบนช่องสีฟ้าในตาราง หรือคลิกเลือก Section ด้านขวา
              </span>
            </div>

            <div className="drag-switch-pills">
              {alternativeSections.map((alt) => {
                const isClashTarget = alt.hasClassClash || alt.hasExamClash;
                const isOver = activeHoverSec === alt.section.sec;
                const timeSummary =
                  alt.section.slots && alt.section.slots.length > 0
                    ? alt.section.dayTime
                    : 'ออนไลน์ (ไม่ระบุเวลา)';

                return (
                  <button
                    key={alt.section.sec}
                    type="button"
                    data-drop-sec={alt.section.sec}
                    className={[
                      'drag-target-pill',
                      isClashTarget ? 'is-clash-target' : '',
                      isOver ? 'is-drag-over' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleCommitSwitch(switchedSubject.id, alt.section.sec)}
                    onMouseEnter={() => !dragState && setHoverPickSec(alt.section.sec)}
                    onMouseLeave={() => !dragState && setHoverPickSec(null)}
                    title={`${timeSummary} · ${alt.section.room}`}
                  >
                    <span>Sec {alt.section.sec}</span>
                    <span>· {timeSummary}</span>
                    {alt.hasClassClash && <span>(ชนเวลา)</span>}
                    {!alt.hasClassClash && alt.hasExamClash && <span>(ชนสอบ)</span>}
                    {alt.isRestricted && <span>(เฉพาะกลุ่ม)</span>}
                  </button>
                );
              })}
              {pickSubjectId && !dragState && (
                <button
                  type="button"
                  className="btn-close-switch"
                  onClick={() => {
                    setPickSubjectId(null);
                    setHoverPickSec(null);
                  }}
                >
                  ปิด
                </button>
              )}
            </div>
          </div>
        )}

        <div className="timetable-scroll">
          <div
            className={`timetable-grid${isSpotlightActive ? ' is-drag-active' : ''}`}
            id="timetableGrid"
          >
            {/* แถวหัวเวลา 08:00 - 20:00 */}
            <div className="grid-header-row">
              <div className="grid-corner">วัน / เวลา</div>
              {HOURS.map((h) => (
                <div key={h} className="grid-hour-cell">
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* แถวรายวัน จันทร์ - ศุกร์ */}
            {DAYS.map((day) => {
              const dayBlocks = [];
              enrolledCourses.forEach((course) => {
                (course.section.slots || []).forEach((slot, idx) => {
                  if (slot.day === day.id) {
                    const key = `${course.subjectId}-${idx}`;
                    dayBlocks.push({
                      course,
                      slot,
                      key,
                      isClash: clashingSlotKeys.has(key),
                    });
                  }
                });
              });

              const { laidOutBlocks, maxLanes } = assignDayLanes(dayBlocks);

              const dayDropTargets = [];
              if (switchedSubject && alternativeSections.length > 0) {
                alternativeSections.forEach((alt) => {
                  (alt.section.slots || []).forEach((slot, idx) => {
                    if (slot.day === day.id) {
                      dayDropTargets.push({
                        alt,
                        slot,
                        key: `drop-${switchedSubject.id}-${alt.section.sec}-${idx}`,
                      });
                    }
                  });
                });
              }

              return (
                <div
                  key={day.id}
                  className="grid-day-row"
                  style={maxLanes > 1 ? { minHeight: `${maxLanes * 66}px` } : undefined}
                >
                  <div className="grid-day-label">
                    <span className="day-full">{day.nameTh}</span>
                    <span className="day-short">{day.shortTh}</span>
                  </div>

                  <div className="grid-day-track">
                    {HOURS.map((h) => (
                      <div key={h} className="grid-hour-bg" />
                    ))}

                    {laidOutBlocks.map(
                      ({ course, slot, key, isClash, laneIndex, laneCount }) => {
                        const leftPct = ((slot.start - START_MINUTE) / TOTAL_MINUTES) * 100;
                        const widthPct = ((slot.end - slot.start) / TOTAL_MINUTES) * 100;
                        const isRestricted = course.section?.isRestrictedGroup === true;
                        const hasPrereqWarning = prereqWarningSubjectIds.has(
                          course.subjectId
                        );
                        const subject = subjectById.get(course.subjectId);
                        const canSwitchSec = Boolean(
                          subject && subject.sections.length > 1 && onToggleCourseSec
                        );
                        const isDragSource = switchedCourse?.subjectId === course.subjectId;
                        const isLandedMatch =
                          justLanded &&
                          justLanded.subjectId === course.subjectId &&
                          justLanded.sec === course.sec;

                        const blockStyle = {
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                        };

                        if (laneCount > 1) {
                          blockStyle.top = `calc(${(laneIndex / laneCount) * 100}% + 3px)`;
                          blockStyle.height = `calc(${100 / laneCount}% - 6px)`;
                          blockStyle.bottom = 'auto';
                        }

                        const blockClasses = [
                          'course-block',
                          isRestricted ? 'is-restricted' : '',
                          isClash ? 'is-clash' : '',
                          laneCount > 1 ? 'is-multi-lane' : '',
                          canSwitchSec ? 'is-draggable' : '',
                          isDragSource ? 'is-drag-source' : '',
                          isLandedMatch && !justLanded.isClash ? 'is-just-landed' : '',
                          isLandedMatch && justLanded.isClash ? 'is-just-landed-clash' : '',
                        ]
                          .filter(Boolean)
                          .join(' ');

                        return (
                          <div
                            key={key}
                            className={blockClasses}
                            data-subject-code={course.code}
                            style={blockStyle}
                            onPointerDown={(event) => {
                              if (canSwitchSec) {
                                startPointerTracking(event, { course, subject });
                              }
                            }}
                            onContextMenu={(event) => {
                              if (canSwitchSec && dragState) {
                                event.preventDefault();
                              }
                            }}
                            title={`${course.code} ${course.nameTh} (Sec ${course.sec}) · ${slot.timeText} · ห้อง ${course.section.room}${
                              canSwitchSec ? ' · ลาก (หรือกดค้างบนมือถือ) เพื่อสลับ Sec' : ''
                            }`}
                          >
                            <div className="block-top">
                              <div className="block-top-left">
                                <span className="block-code">{course.code}</span>
                                {(isClash || isRestricted || hasPrereqWarning) && (
                                  <span className="block-badges">
                                    {isClash && (
                                      <span className="block-badge-clash">เวลาชน</span>
                                    )}
                                    {isRestricted && (
                                      <span className="block-badge-restricted">
                                        เฉพาะกลุ่ม
                                      </span>
                                    )}
                                    {hasPrereqWarning && (
                                      <span className="block-badge-prereq">
                                        บังคับก่อน
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>

                              <div className="block-top-actions">
                                {canSwitchSec && (
                                  <button
                                    type="button"
                                    className="block-switch-btn"
                                    onClick={() => {
                                      setPickSubjectId((prev) =>
                                        prev === course.subjectId ? null : course.subjectId
                                      );
                                      setHoverPickSec(null);
                                    }}
                                    title="สลับ Section ของวิชานี้"
                                  >
                                    สลับ
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="block-remove"
                                  onClick={() => onRemoveCourse(course.subjectId)}
                                  aria-label={`ลบวิชา ${course.code}`}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                            <div className="block-title">{course.nameTh}</div>
                            <div className="block-meta">
                              <span>Sec {course.sec}</span>
                              <span>{course.section.room}</span>
                            </div>
                          </div>
                        );
                      }
                    )}

                    {dayDropTargets.map(({ alt, slot, key }) => {
                      const leftPct = ((slot.start - START_MINUTE) / TOTAL_MINUTES) * 100;
                      const widthPct = ((slot.end - slot.start) / TOTAL_MINUTES) * 100;
                      const isClashTarget = alt.hasClassClash || alt.hasExamClash;
                      const isDragOver = activeHoverSec === alt.section.sec;

                      return (
                        <div
                          key={key}
                          data-drop-sec={alt.section.sec}
                          className={[
                            'drop-zone-slot',
                            isClashTarget ? 'is-clash-target' : '',
                            isDragOver ? 'is-drag-over' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          onClick={() =>
                            handleCommitSwitch(switchedSubject.id, alt.section.sec)
                          }
                          onMouseEnter={() =>
                            !dragState && setHoverPickSec(alt.section.sec)
                          }
                          onMouseLeave={() => !dragState && setHoverPickSec(null)}
                          title={`วางเพื่อสลับเป็น Sec ${alt.section.sec} (${slot.timeText} · ${alt.section.room})`}
                        >
                          <span className="drop-zone-title">Sec {alt.section.sec}</span>
                          <span className="drop-zone-meta">
                            {alt.hasClassClash
                              ? 'ชนเวลาเรียน'
                              : alt.hasExamClash
                                ? 'ชนวันสอบ'
                                : alt.section.room}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* โซนแสดงรายวิชาออนไลน์หรือวิชาที่ยังไม่ระบุวัน-เวลาเรียน */}
        {unscheduledCourses.length > 0 && (
          <div className="unscheduled-box" id="unscheduledBox">
            <div className="unscheduled-header">
              รายวิชาออนไลน์ / ไม่ระบุวัน-เวลาเรียน ({unscheduledCourses.length} วิชา)
            </div>
            <div className="unscheduled-list">
              {unscheduledCourses.map((course) => {
                const isRestricted = course.section?.isRestrictedGroup === true;
                const hasPrereqWarning = prereqWarningSubjectIds.has(course.subjectId);
                const subject = subjectById.get(course.subjectId);
                const canSwitchSec = Boolean(
                  subject && subject.sections.length > 1 && onToggleCourseSec
                );
                const isLandedMatch =
                  justLanded &&
                  justLanded.subjectId === course.subjectId &&
                  justLanded.sec === course.sec;

                const cardClasses = [
                  'unscheduled-card',
                  isRestricted ? 'is-restricted' : '',
                  isLandedMatch && !justLanded.isClash ? 'is-just-landed' : '',
                  isLandedMatch && justLanded.isClash ? 'is-just-landed-clash' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <div
                    key={course.subjectId}
                    className={cardClasses}
                    data-subject-code={course.code}
                    title={isRestricted ? course.section.group : undefined}
                  >
                    <div className="unscheduled-card-top">
                      <span className="course-code">{course.code}</span>
                      <span className="sec-badge">Sec {course.sec}</span>
                      {isRestricted && (
                        <span className="block-badge-restricted">เฉพาะกลุ่ม</span>
                      )}
                      {hasPrereqWarning && (
                        <span className="block-badge-prereq">บังคับก่อน</span>
                      )}
                      <div className="unscheduled-card-actions">
                        {canSwitchSec && (
                          <button
                            type="button"
                            className="block-switch-btn"
                            onClick={() => {
                              setPickSubjectId((prev) =>
                                prev === course.subjectId ? null : course.subjectId
                              );
                              setHoverPickSec(null);
                            }}
                          >
                            สลับ Sec
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-remove-inline"
                          onClick={() => onRemoveCourse(course.subjectId)}
                          aria-label={`ลบวิชา ${course.code}`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="unscheduled-title">{course.nameTh}</div>
                    <div className="unscheduled-room">{course.section.room}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* การ์ดลอยตามเมาส์/นิ้วระหว่างลากสลับ Section */}
      {dragState && (
        <div
          className={[
            'floating-drag-card',
            dragState.phase === 'snapping' ? 'is-snapping' : '',
            dragState.phase === 'returning' ? 'is-returning' : '',
            hoveredDragAlt && !(hoveredDragAlt.hasClassClash || hoveredDragAlt.hasExamClash)
              ? 'is-over-valid'
              : '',
            hoveredDragAlt && (hoveredDragAlt.hasClassClash || hoveredDragAlt.hasExamClash)
              ? 'is-over-clash'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            width: `${dragState.width}px`,
            height: `${dragState.height}px`,
            transform: `translate3d(${dragState.x}px, ${dragState.y}px, 0)`,
          }}
          aria-hidden="true"
        >
          <div
            className="floating-drag-inner"
            style={{
              transform: `rotate(${dragState.tilt}deg) scale(${
                dragState.phase === 'dragging' ? 1.035 : 1
              })`,
            }}
          >
            <div className="floating-drag-top">
              <span className="block-code">{dragState.course.code}</span>
              {dragState.hoverSec && (
                <span
                  className={`floating-drag-target${
                    hoveredDragAlt &&
                    (hoveredDragAlt.hasClassClash || hoveredDragAlt.hasExamClash)
                      ? ' is-clash'
                      : ''
                  }`}
                >
                  → Sec {dragState.hoverSec}
                  {hoveredDragAlt?.hasClassClash
                    ? ' · ชนเวลา'
                    : hoveredDragAlt?.hasExamClash
                      ? ' · ชนสอบ'
                      : ''}
                </span>
              )}
            </div>
            <div className="block-title">{dragState.course.nameTh}</div>
            <div className="block-meta">
              <span>Sec {dragState.course.sec}</span>
              <span>{dragState.course.section.room}</span>
            </div>
          </div>
        </div>
      )}

      <AutoSchedulerModal
        isOpen={isSchedulerOpen}
        onClose={() => setIsSchedulerOpen(false)}
        subjects={subjects}
        enrolledCourses={enrolledCourses}
        onApplySchedule={(nextCourses) => onReplaceSchedule?.(nextCourses)}
      />
    </section>
  );
}
