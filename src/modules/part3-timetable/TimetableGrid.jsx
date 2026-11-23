import React, { useMemo } from 'react';
import { DAYS, HOURS } from '../../data/mockSubjects';
import {
  CREDIT_MAX,
  assignDayLanes,
  detectClassClashes,
  detectExamClashes,
  getCreditSummary,
  getRestrictedCourses,
} from './scheduleUtils';
import './timetable.css';

const START_MINUTE = 8 * 60; // 08:00
const TOTAL_MINUTES = 13 * 60; // 08:00 - 21:00 (13 ช่องชั่วโมง)

/**
 * โมดูลส่วนที่ 3 : ตารางเรียนรายสัปดาห์ (Timetable, Clash Detection & Credit Summary)
 *
 * ฟีเจอร์ที่เพิ่มในรอบแรก (Sprint 1 Demo):
 * - ตรวจจับ "เวลาเรียนชน" พร้อมไฮไลต์สีแดงและแยกเลนแนวตั้งอัตโนมัติ
 * - ตรวจจับ "วันสอบ Midterm / Final ชน" พร้อมแถบแจ้งเตือนรายละเอียดรายวิชา
 * - แถบนับหน่วยกิตรวม (แจ้งเตือนเมื่อต่ำกว่า 9 หรือเกิน 22 หน่วยกิต)
 * - แจ้งเตือนเมื่อเลือก Section ที่จำกัดกลุ่มผู้เรียน (isRestrictedGroup)
 *
 * TODO (คนที่ 3 - Sprint 2 ถัดไป):
 * 1. เพิ่มระบบลากวางบล็อกรายวิชา (Drag & Drop) เพื่อสลับไปลง Section อื่นของวิชานั้นๆ
 * 2. เพิ่มระบบเช็กรายวิชาบังคับก่อน (prerequisites)
 * 3. สร้างปุ่ม "จัดตารางอัตโนมัติ (Auto-Scheduler)" จากรายวิชาที่ผู้ใช้เลือก
 */
export function TimetableGrid({ enrolledCourses, onRemoveCourse, onClearSchedule }) {
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

  const hasCreditAlert = creditSummary.status === 'low' || creditSummary.status === 'high';
  const hasAlerts =
    classClashes.length > 0 ||
    examClashes.length > 0 ||
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
          {enrolledCourses.length > 0 && (
            <button type="button" className="btn-clear-all" onClick={onClearSchedule}>
              ล้างตาราง
            </button>
          )}
        </div>

        {hasAlerts && (
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
          </div>
        )}

        <div className="timetable-scroll">
          <div className="timetable-grid" id="timetableGrid">
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

                    {laidOutBlocks.map(({ course, slot, key, isClash, laneIndex, laneCount }) => {
                      const leftPct = ((slot.start - START_MINUTE) / TOTAL_MINUTES) * 100;
                      const widthPct = ((slot.end - slot.start) / TOTAL_MINUTES) * 100;
                      const isRestricted = course.section?.isRestrictedGroup === true;

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
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <div
                          key={key}
                          className={blockClasses}
                          data-subject-code={course.code}
                          style={blockStyle}
                          title={`${course.code} ${course.nameTh} (Sec ${course.sec}) · ${slot.timeText} · ห้อง ${course.section.room}${
                            isRestricted ? ` · ${course.section.group}` : ''
                          }`}
                        >
                          <div className="block-top">
                            <div className="block-top-left">
                              <span className="block-code">{course.code}</span>
                              {(isClash || isRestricted) && (
                                <span className="block-badges">
                                  {isClash && (
                                    <span className="block-badge-clash">เวลาชน</span>
                                  )}
                                  {isRestricted && (
                                    <span className="block-badge-restricted">เฉพาะกลุ่ม</span>
                                  )}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="block-remove"
                              onClick={() => onRemoveCourse(course.subjectId)}
                              aria-label={`ลบวิชา ${course.code}`}
                            >
                              ×
                            </button>
                          </div>
                          <div className="block-title">{course.nameTh}</div>
                          <div className="block-meta">
                            <span>Sec {course.sec}</span>
                            <span>{course.section.room}</span>
                          </div>
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
                return (
                  <div
                    key={course.subjectId}
                    className={`unscheduled-card${isRestricted ? ' is-restricted' : ''}`}
                    data-subject-code={course.code}
                    title={isRestricted ? course.section.group : undefined}
                  >
                    <div className="unscheduled-card-top">
                      <span className="course-code">{course.code}</span>
                      <span className="sec-badge">Sec {course.sec}</span>
                      {isRestricted && (
                        <span className="block-badge-restricted">เฉพาะกลุ่ม</span>
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
                    <div className="unscheduled-title">{course.nameTh}</div>
                    <div className="unscheduled-room">{course.section.room}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
