import React, { useEffect, useMemo, useState } from 'react';
import {
  CREDIT_MAX,
  CREDIT_MIN,
  generateAutoSchedules,
} from './scheduleUtils';

export function AutoSchedulerModal({
  isOpen,
  onClose,
  subjects = [],
  enrolledCourses = [],
  onApplySchedule,
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [avoidExamClash, setAvoidExamClash] = useState(true);
  const [avoidRestricted, setAvoidRestricted] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(enrolledCourses.map((course) => course.subjectId));
    }
  }, [isOpen, enrolledCourses]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedSubjects = useMemo(
    () => subjects.filter((subject) => selectedSet.has(subject.id)),
    [subjects, selectedSet]
  );

  const selectedCredits = useMemo(
    () =>
      selectedSubjects.reduce(
        (sum, subject) => sum + (Number(subject.creditNum) || 0),
        0
      ),
    [selectedSubjects]
  );

  const scheduleOutput = useMemo(
    () =>
      generateAutoSchedules(selectedSubjects, {
        avoidExamClash,
        avoidRestricted,
      }),
    [selectedSubjects, avoidExamClash, avoidRestricted]
  );

  if (!isOpen) {
    return null;
  }

  function handleToggleSubject(subjectId) {
    setSelectedIds((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  }

  function handleSelectAll() {
    setSelectedIds(subjects.map((subject) => subject.id));
  }

  function handleClearSelection() {
    setSelectedIds([]);
  }

  const creditStatus =
    selectedCredits === 0
      ? 'empty'
      : selectedCredits < CREDIT_MIN
        ? 'low'
        : selectedCredits > CREDIT_MAX
          ? 'high'
          : 'ok';

  return (
    <div
      className="scheduler-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="autoSchedulerTitle"
      onClick={onClose}
    >
      <div className="scheduler-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="scheduler-header">
          <div>
            <h3 id="autoSchedulerTitle" className="scheduler-title">
              จัดตารางเรียนอัตโนมัติ (Auto-Scheduler)
            </h3>
            <p className="scheduler-subtitle">
              เลือกรายวิชาที่ต้องการลง ระบบจะจับคู่ Section ที่เวลาเรียนไม่ชนกันให้อัตโนมัติ
            </p>
          </div>
          <button
            type="button"
            className="scheduler-close"
            onClick={onClose}
            aria-label="ปิดหน้าต่างจัดตารางอัตโนมัติ"
          >
            ×
          </button>
        </div>

        <div className="scheduler-body">
          {/* ฝั่งซ้าย: เลือกรายวิชา & เงื่อนไข */}
          <div className="scheduler-sidebar">
            <div className="scheduler-section-head">
              <span className="scheduler-section-label">
                รายวิชา ({selectedSubjects.length}/{subjects.length})
              </span>
              <div className="scheduler-bulk-actions">
                <button
                  type="button"
                  className="btn-scheduler-link"
                  onClick={handleSelectAll}
                >
                  เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  className="btn-scheduler-link"
                  onClick={handleClearSelection}
                >
                  ล้างที่เลือก
                </button>
              </div>
            </div>

            <div className={`scheduler-credit-bar is-${creditStatus}`}>
              เลือกแล้ว {selectedSubjects.length} วิชา · {selectedCredits} หน่วยกิต
              {creditStatus === 'low' && ` (ต่ำกว่า ${CREDIT_MIN})`}
              {creditStatus === 'high' && ` (เกิน ${CREDIT_MAX})`}
            </div>

            <div className="scheduler-subject-list">
              {subjects.map((subject) => {
                const checked = selectedSet.has(subject.id);
                return (
                  <label
                    key={subject.id}
                    className={`scheduler-subject-item${checked ? ' is-checked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleSubject(subject.id)}
                    />
                    <div className="scheduler-subject-info">
                      <div className="scheduler-subject-top">
                        <span className="course-code">{subject.code}</span>
                        <span className="scheduler-subject-credits">
                          {subject.creditNum} นก. · {subject.sections.length} Sec
                        </span>
                      </div>
                      <div className="scheduler-subject-name">{subject.nameTh}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="scheduler-options">
              <label className="scheduler-option-check">
                <input
                  type="checkbox"
                  checked={avoidExamClash}
                  onChange={(event) => setAvoidExamClash(event.target.checked)}
                />
                <span>หลีกเลี่ยงวันสอบ Midterm / Final ชน</span>
              </label>

              <label className="scheduler-option-check">
                <input
                  type="checkbox"
                  checked={avoidRestricted}
                  onChange={(event) => setAvoidRestricted(event.target.checked)}
                />
                <span>หลีกเลี่ยง Section จำกัดกลุ่มผู้เรียน</span>
              </label>
            </div>
          </div>

          {/* ฝั่งขวา: ผลลัพธ์ตารางที่ไม่ชนกัน */}
          <div className="scheduler-results">
            {scheduleOutput.reason === 'empty' && (
              <div className="scheduler-empty">
                กรุณาเลือกรายวิชาอย่างน้อย 1 วิชาทางด้านซ้าย เพื่อสร้างตารางอัตโนมัติ
              </div>
            )}

            {scheduleOutput.reason === 'no_sections' && (
              <div className="scheduler-empty is-warning">
                วิชา {scheduleOutput.blockingSubject?.code}{' '}
                {scheduleOutput.blockingSubject?.nameTh} ไม่มี Section
                ที่ตรงกับเงื่อนไข (ลองยกเลิกตัวกรอง &ldquo;หลีกเลี่ยง Section
                จำกัดกลุ่มผู้เรียน&rdquo;)
              </div>
            )}

            {scheduleOutput.reason === 'no_combination' && (
              <div className="scheduler-empty is-warning">
                ไม่พบชุด Section ที่เวลาเรียน (หรือวันสอบ) ไม่ชนกัน
                ลองนำรายวิชาที่ชนออกหรือปรับตัวเลือกเงื่อนไข
              </div>
            )}

            {scheduleOutput.reason === 'ok' && (
              <>
                <div className="scheduler-results-header">
                  พบตัวเลือกตารางที่ไม่ชนกัน {scheduleOutput.results.length} แบบ
                </div>
                <div className="scheduler-cards">
                  {scheduleOutput.results.map((option, index) => (
                    <div key={option.id} className="scheduler-card">
                      <div className="scheduler-card-head">
                        <div className="scheduler-card-meta">
                          <span className="scheduler-rank">แบบที่ {index + 1}</span>
                          <span className="scheduler-pill">
                            เรียน {option.studyDays} วัน/สัปดาห์
                          </span>
                          <span className="scheduler-pill">
                            {option.totalCredits} หน่วยกิต
                          </span>
                          {option.restrictedCount > 0 && (
                            <span className="scheduler-pill is-warn">
                              เฉพาะกลุ่ม {option.restrictedCount}
                            </span>
                          )}
                          {option.examClashCount > 0 && (
                            <span className="scheduler-pill is-danger">
                              สอบชน {option.examClashCount}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn-apply-schedule"
                          onClick={() => {
                            onApplySchedule?.(option.courses);
                            onClose();
                          }}
                        >
                          ใช้ตารางนี้
                        </button>
                      </div>

                      <div className="scheduler-card-courses">
                        {option.courses.map((course) => (
                          <div key={course.subjectId} className="scheduler-course-row">
                            <span className="course-code">{course.code}</span>
                            <span className="scheduler-course-name">{course.nameTh}</span>
                            <span className="sec-badge">Sec {course.sec}</span>
                            <span className="scheduler-course-time">
                              {course.section.dayTime}
                            </span>
                            <span className="scheduler-course-room">
                              {course.section.room}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
