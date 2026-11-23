import React from 'react';
import { DAYS, HOURS } from '../../data/mockSubjects';

const START_MINUTE = 8 * 60; // 08:00
const TOTAL_MINUTES = 13 * 60; // 08:00 - 21:00 (13 ช่องชั่วโมง)

/**
 * โมดูลส่วนที่ 3 : ตารางเรียนรายสัปดาห์ (Starter Working Base)
 *
 * ฟีเจอร์ที่มีให้ใน Base นี้:
 * - แสดงตารางวันจันทร์ - ศุกร์ เวลา 08:00 - 20:00
 * - แสดงบล็อกรายวิชาที่เลือกมาจากฝั่งค้นหา พร้อมปุ่ม × สำหรับเอาออกจากตาราง
 * - แสดงรายชื่อวิชาออนไลน์ที่ไม่มีวัน-เวลาตายตัวไว้ด้านล่างตาราง
 *
 * TODO (คนที่ 3 - Timetable, Clash Detection & Auto-Scheduler Lead):
 * 1. เพิ่มระบบตรวจจับ "เวลาเรียนชน" และ "วันสอบ Midterm/Final ชน" พร้อมไฮไลต์สีแดง/แยกเลนอัตโนมัติ
 * 2. เพิ่มระบบลากวางบล็อกรายวิชา (Drag & Drop) เพื่อสลับไปลง Section อื่นของวิชานั้นๆ
 * 3. เพิ่มแถบนับหน่วยกิตรวม (พร้อมเตือนเมื่อน้อยกว่า 9 หรือเกิน 22 หน่วยกิต)
 * 4. เพิ่มระบบแจ้งเตือนเมื่อเลือก Section ที่จำกัดกลุ่มผู้เรียน (isRestrictedGroup) และเช็กรายวิชาบังคับก่อน (prerequisites)
 * 5. สร้างปุ่ม "จัดตารางอัตโนมัติ (Auto-Scheduler)" จากรายวิชาที่ผู้ใช้เลือก
 */
export function TimetableGrid({ enrolledCourses, onRemoveCourse, onClearSchedule }) {
  const unscheduledCourses = enrolledCourses.filter(
    (item) => !item.section.slots || item.section.slots.length === 0
  );

  return (
    <section className="timetable-stage" aria-label="ตารางเรียน">
      <div className="sheet-card">
        <div className="sheet-header">
          <div className="sheet-header-left">
            <h2 className="sheet-title">ตารางเรียน (Starter Base)</h2>
            <span className="sheet-count-pill">{enrolledCourses.length} วิชา</span>
          </div>
          {enrolledCourses.length > 0 && (
            <button type="button" className="btn-clear-all" onClick={onClearSchedule}>
              ล้างตาราง
            </button>
          )}
        </div>

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
                    dayBlocks.push({ course, slot, key: `${course.subjectId}-${idx}` });
                  }
                });
              });

              return (
                <div key={day.id} className="grid-day-row">
                  <div className="grid-day-label">
                    <span className="day-full">{day.nameTh}</span>
                    <span className="day-short">{day.shortTh}</span>
                  </div>

                  <div className="grid-day-track">
                    {HOURS.map((h) => (
                      <div key={h} className="grid-hour-bg" />
                    ))}

                    {dayBlocks.map(({ course, slot, key }) => {
                      const leftPct = ((slot.start - START_MINUTE) / TOTAL_MINUTES) * 100;
                      const widthPct = ((slot.end - slot.start) / TOTAL_MINUTES) * 100;
                      return (
                        <div
                          key={key}
                          className="course-block"
                          data-subject-code={course.code}
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                          }}
                          title={`${course.code} ${course.nameTh} (Sec ${course.sec}) · ${slot.timeText} · ห้อง ${course.section.room}`}
                        >
                          <div className="block-top">
                            <span className="block-code">{course.code}</span>
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
              {unscheduledCourses.map((course) => (
                <div
                  key={course.subjectId}
                  className="unscheduled-card"
                  data-subject-code={course.code}
                >
                  <div className="unscheduled-card-top">
                    <span className="course-code">{course.code}</span>
                    <span className="sec-badge">Sec {course.sec}</span>
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
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
