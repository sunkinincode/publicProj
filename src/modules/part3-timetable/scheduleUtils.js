export const CREDIT_MIN = 9;
export const CREDIT_MAX = 22;

const EXAM_WINDOW_RE = /^(.+?)\s+(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})$/;

function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatRange(start, end) {
  return `${formatMinutes(start)}–${formatMinutes(end)}`;
}

function toCourseRef(course) {
  return {
    subjectId: course.subjectId,
    code: course.code,
    nameTh: course.nameTh,
    sec: course.sec,
  };
}

/**
 * แปลงคู่ (subject, section) เป็นออบเจ็กต์รายวิชาที่ลงทะเบียนในรูปแบบเดียวกับ App.jsx
 */
export function toEnrolledCourse(subject, section) {
  return {
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
}

/**
 * สรุปจำนวนหน่วยกิตรวมและสถานะเกณฑ์ลงทะเบียน (9–22 หน่วยกิต)
 */
export function getCreditSummary(enrolledCourses = []) {
  const totalCredits = (enrolledCourses || []).reduce(
    (sum, course) => sum + (Number(course?.creditNum) || 0),
    0
  );

  if (totalCredits === 0) {
    return {
      totalCredits: 0,
      status: 'empty',
      message: 'ยังไม่ได้เลือกรายวิชาลงตาราง',
    };
  }

  if (totalCredits < CREDIT_MIN) {
    return {
      totalCredits,
      status: 'low',
      message: `หน่วยกิตรวม ${totalCredits} หน่วยกิต — ต่ำกว่าเกณฑ์ขั้นต่ำ (${CREDIT_MIN} หน่วยกิต)`,
    };
  }

  if (totalCredits > CREDIT_MAX) {
    return {
      totalCredits,
      status: 'high',
      message: `หน่วยกิตรวม ${totalCredits} หน่วยกิต — เกินเกณฑ์สูงสุด (${CREDIT_MAX} หน่วยกิต)`,
    };
  }

  return {
    totalCredits,
    status: 'ok',
    message: `หน่วยกิตรวม ${totalCredits} หน่วยกิต (อยู่ในเกณฑ์ ${CREDIT_MIN}–${CREDIT_MAX} หน่วยกิต)`,
  };
}

/**
 * แปลงข้อความวัน-เวลาสอบ เช่น "10 ม.ค. 2570 09:00–12:00" เป็นช่วงเวลาเทียบชน
 */
export function parseExamWindow(examText) {
  if (!examText || typeof examText !== 'string') {
    return null;
  }

  const trimmed = examText.trim();
  if (!trimmed || trimmed === '-') {
    return null;
  }

  const match = trimmed.match(EXAM_WINDOW_RE);
  if (!match) {
    return null;
  }

  const dateKey = match[1].trim().replace(/\s+/g, ' ');
  const start = Number(match[2]) * 60 + Number(match[3]);
  const end = Number(match[4]) * 60 + Number(match[5]);

  if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
    return null;
  }

  return {
    dateKey,
    start,
    end,
    raw: trimmed,
  };
}

function sectionsHaveClassClash(sectionA, sectionB) {
  const slotsA = sectionA?.slots || [];
  const slotsB = sectionB?.slots || [];

  for (const slotA of slotsA) {
    for (const slotB of slotsB) {
      if (slotA.day === slotB.day && slotA.start < slotB.end && slotB.start < slotA.end) {
        return true;
      }
    }
  }
  return false;
}

function sectionsHaveExamClash(sectionA, sectionB) {
  for (const type of ['midterm', 'final']) {
    const windowA = parseExamWindow(sectionA?.[type]);
    const windowB = parseExamWindow(sectionB?.[type]);
    if (
      windowA &&
      windowB &&
      windowA.dateKey === windowB.dateKey &&
      windowA.start < windowB.end &&
      windowB.start < windowA.end
    ) {
      return true;
    }
  }
  return false;
}

/**
 * ตรวจจับเวลาเรียนที่ทับซ้อนกันระหว่างรายวิชาในตาราง
 */
export function detectClassClashes(enrolledCourses = []) {
  const courses = enrolledCourses || [];
  const clashingSlotKeys = new Set();
  const classClashes = [];
  const seenPairsByDay = new Set();

  for (let i = 0; i < courses.length; i += 1) {
    const courseA = courses[i];
    const slotsA = courseA?.section?.slots || [];

    for (let j = i + 1; j < courses.length; j += 1) {
      const courseB = courses[j];
      if (courseA.subjectId === courseB.subjectId) {
        continue;
      }

      const slotsB = courseB?.section?.slots || [];

      for (let idxA = 0; idxA < slotsA.length; idxA += 1) {
        const slotA = slotsA[idxA];
        for (let idxB = 0; idxB < slotsB.length; idxB += 1) {
          const slotB = slotsB[idxB];

          if (slotA.day !== slotB.day) {
            continue;
          }

          const overlaps = slotA.start < slotB.end && slotB.start < slotA.end;
          if (!overlaps) {
            continue;
          }

          clashingSlotKeys.add(`${courseA.subjectId}-${idxA}`);
          clashingSlotKeys.add(`${courseB.subjectId}-${idxB}`);

          const [firstId, secondId] =
            String(courseA.subjectId) < String(courseB.subjectId)
              ? [courseA.subjectId, courseB.subjectId]
              : [courseB.subjectId, courseA.subjectId];
          const pairKey = `${slotA.day}-${firstId}-${secondId}`;

          if (!seenPairsByDay.has(pairKey)) {
            seenPairsByDay.add(pairKey);
            classClashes.push({
              id: pairKey,
              day: slotA.day,
              dayName: slotA.dayName || slotB.dayName || '',
              courseA: toCourseRef(courseA),
              courseB: toCourseRef(courseB),
              timeA: slotA.timeText || formatRange(slotA.start, slotA.end),
              timeB: slotB.timeText || formatRange(slotB.start, slotB.end),
            });
          }
        }
      }
    }
  }

  return { clashingSlotKeys, classClashes };
}

/**
 * ตรวจจับวัน-เวลาสอบ Midterm และ Final ที่ชนกัน
 */
export function detectExamClashes(enrolledCourses = []) {
  const courses = enrolledCourses || [];
  const examTypes = [
    { type: 'midterm', typeLabel: 'สอบกลางภาค (Midterm)' },
    { type: 'final', typeLabel: 'สอบปลายภาค (Final)' },
  ];
  const examClashes = [];

  for (const { type, typeLabel } of examTypes) {
    for (let i = 0; i < courses.length; i += 1) {
      const courseA = courses[i];
      const windowA = parseExamWindow(courseA?.section?.[type]);
      if (!windowA) {
        continue;
      }

      for (let j = i + 1; j < courses.length; j += 1) {
        const courseB = courses[j];
        if (courseA.subjectId === courseB.subjectId) {
          continue;
        }

        const windowB = parseExamWindow(courseB?.section?.[type]);
        if (!windowB || windowA.dateKey !== windowB.dateKey) {
          continue;
        }

        const overlaps = windowA.start < windowB.end && windowB.start < windowA.end;
        if (!overlaps) {
          continue;
        }

        examClashes.push({
          id: `${type}-${courseA.subjectId}-${courseB.subjectId}`,
          type,
          typeLabel,
          dateKey: windowA.dateKey,
          courseA: toCourseRef(courseA),
          courseB: toCourseRef(courseB),
          timeA: formatRange(windowA.start, windowA.end),
          timeB: formatRange(windowB.start, windowB.end),
        });
      }
    }
  }

  return examClashes;
}

/**
 * ดึงรายวิชาที่เลือก Section แบบจำกัดกลุ่มผู้เรียน (isRestrictedGroup)
 */
export function getRestrictedCourses(enrolledCourses = []) {
  return (enrolledCourses || [])
    .filter((course) => course?.section?.isRestrictedGroup === true)
    .map((course) => ({
      subjectId: course.subjectId,
      code: course.code,
      nameTh: course.nameTh,
      sec: course.sec,
      group: course.section?.group || 'จำกัดกลุ่มผู้เรียน',
    }));
}

/**
 * ตรวจสอบรายวิชาบังคับก่อน (prerequisites) ของวิชาที่เลือกอยู่ในตาราง
 */
export function detectPrerequisiteWarnings(
  enrolledCourses = [],
  subjects = [],
  passedCodes = []
) {
  const enrolled = enrolledCourses || [];
  const enrolledByCode = new Map();
  for (const course of enrolled) {
    if (course?.code) {
      enrolledByCode.set(course.code, course);
    }
  }

  const subjectByCode = new Map();
  for (const subject of subjects || []) {
    if (subject?.code) {
      subjectByCode.set(subject.code, subject);
    }
  }

  const passedSet = new Set(passedCodes || []);
  const warnings = [];
  const warningSubjectIds = new Set();

  for (const course of enrolled) {
    const prereqs = course?.prerequisites || [];
    for (const reqCode of prereqs) {
      const reqSubject = subjectByCode.get(reqCode) || enrolledByCode.get(reqCode);
      const reqNameTh = reqSubject?.nameTh || '';
      const reqLabel = reqNameTh ? `${reqCode} (${reqNameTh})` : reqCode;

      if (enrolledByCode.has(reqCode)) {
        warningSubjectIds.add(course.subjectId);
        warnings.push({
          id: `concurrent-${course.subjectId}-${reqCode}`,
          type: 'concurrent',
          subjectId: course.subjectId,
          code: course.code,
          nameTh: course.nameTh,
          sec: course.sec,
          reqCode,
          reqNameTh,
          message: `${course.code} ${course.nameTh} ต้องสอบผ่าน ${reqLabel} มาก่อน (ไม่สามารถลงเรียนพร้อมกันในเทอมเดียวกันได้)`,
        });
      } else if (!passedSet.has(reqCode)) {
        warningSubjectIds.add(course.subjectId);
        warnings.push({
          id: `unverified-${course.subjectId}-${reqCode}`,
          type: 'unverified',
          subjectId: course.subjectId,
          code: course.code,
          nameTh: course.nameTh,
          sec: course.sec,
          reqCode,
          reqNameTh,
          message: `${course.code} ${course.nameTh} มีวิชาบังคับก่อนคือ ${reqLabel}`,
        });
      }
    }
  }

  return { warnings, warningSubjectIds };
}

/**
 * คืนรายการ Section อื่นของวิชานี้ พร้อมสถานะชนเวลา/ชนสอบ/จำกัดกลุ่ม เมื่อเทียบกับวิชาอื่นในตาราง
 */
export function getAlternativeSections(subject, currentSec, enrolledCourses = []) {
  if (!subject || !Array.isArray(subject.sections)) {
    return [];
  }

  const otherCourses = (enrolledCourses || []).filter(
    (course) => course.subjectId !== subject.id
  );

  return subject.sections
    .filter((section) => section.sec !== currentSec)
    .map((section) => {
      let hasClassClash = false;
      let hasExamClash = false;

      for (const other of otherCourses) {
        if (sectionsHaveClassClash(section, other.section)) {
          hasClassClash = true;
        }
        if (sectionsHaveExamClash(section, other.section)) {
          hasExamClash = true;
        }
        if (hasClassClash && hasExamClash) {
          break;
        }
      }

      return {
        section,
        hasClassClash,
        hasExamClash,
        isRestricted: section.isRestrictedGroup === true,
      };
    });
}

function computeScheduleMetrics(courses) {
  const totalCredits = courses.reduce(
    (sum, course) => sum + (Number(course?.creditNum) || 0),
    0
  );

  const slotsByDay = new Map();
  let restrictedCount = 0;

  for (const course of courses) {
    if (course.section?.isRestrictedGroup === true) {
      restrictedCount += 1;
    }
    for (const slot of course.section?.slots || []) {
      if (!slotsByDay.has(slot.day)) {
        slotsByDay.set(slot.day, []);
      }
      slotsByDay.get(slot.day).push(slot);
    }
  }

  const studyDays = slotsByDay.size;
  let gapMinutes = 0;

  for (const daySlots of slotsByDay.values()) {
    let minStart = Infinity;
    let maxEnd = -Infinity;
    let classMinutes = 0;

    for (const slot of daySlots) {
      if (slot.start < minStart) minStart = slot.start;
      if (slot.end > maxEnd) maxEnd = slot.end;
      classMinutes += Math.max(0, slot.end - slot.start);
    }

    if (maxEnd > minStart) {
      gapMinutes += Math.max(0, maxEnd - minStart - classMinutes);
    }
  }

  const examClashCount = detectExamClashes(courses).length;

  return {
    totalCredits,
    studyDays,
    restrictedCount,
    examClashCount,
    gapMinutes,
  };
}

/**
 * จัดตารางอัตโนมัติ (Auto-Scheduler) จากรายวิชาที่ผู้ใช้เลือก
 */
export function generateAutoSchedules(selectedSubjects = [], options = {}) {
  const {
    avoidExamClash = true,
    avoidRestricted = true,
    maxResults = 30,
  } = options;

  const subjects = (selectedSubjects || []).filter(Boolean);
  if (subjects.length === 0) {
    return { results: [], reason: 'empty' };
  }

  const prepared = [];
  for (let orderIdx = 0; orderIdx < subjects.length; orderIdx += 1) {
    const subject = subjects[orderIdx];
    const candidates = (subject.sections || []).filter(
      (section) => !avoidRestricted || !section.isRestrictedGroup
    );

    if (candidates.length === 0) {
      return {
        results: [],
        reason: 'no_sections',
        blockingSubject: subject,
      };
    }

    prepared.push({ subject, candidates, orderIdx });
  }

  const ordered = [...prepared].sort(
    (a, b) => a.candidates.length - b.candidates.length
  );

  const MAX_COLLECT = 100;
  const rawCombinations = [];
  const chosen = new Array(ordered.length);

  function backtrack(depth) {
    if (rawCombinations.length >= MAX_COLLECT) {
      return;
    }

    if (depth === ordered.length) {
      const inOriginalOrder = new Array(subjects.length);
      for (let i = 0; i < ordered.length; i += 1) {
        inOriginalOrder[ordered[i].orderIdx] = toEnrolledCourse(
          ordered[i].subject,
          chosen[i]
        );
      }
      rawCombinations.push(inOriginalOrder);
      return;
    }

    const { candidates } = ordered[depth];
    for (const candidate of candidates) {
      let conflict = false;
      for (let prev = 0; prev < depth; prev += 1) {
        const prevSec = chosen[prev];
        if (sectionsHaveClassClash(candidate, prevSec)) {
          conflict = true;
          break;
        }
        if (avoidExamClash && sectionsHaveExamClash(candidate, prevSec)) {
          conflict = true;
          break;
        }
      }

      if (!conflict) {
        chosen[depth] = candidate;
        backtrack(depth + 1);
      }
    }
  }

  backtrack(0);

  if (rawCombinations.length === 0) {
    return { results: [], reason: 'no_combination' };
  }

  const scored = rawCombinations.map((courses) => {
    const metrics = computeScheduleMetrics(courses);
    return {
      id: courses.map((c) => `${c.code}:${c.sec}`).join('|'),
      courses,
      ...metrics,
    };
  });

  scored.sort((a, b) => {
    if (a.examClashCount !== b.examClashCount) {
      return a.examClashCount - b.examClashCount;
    }
    if (a.restrictedCount !== b.restrictedCount) {
      return a.restrictedCount - b.restrictedCount;
    }
    if (a.studyDays !== b.studyDays) {
      return a.studyDays - b.studyDays;
    }
    return a.gapMinutes - b.gapMinutes;
  });

  return {
    results: scored.slice(0, maxResults),
    reason: 'ok',
  };
}

/**
 * จัดแบ่งเลนแนวตั้งภายในวันเดียวกันเพื่อไม่ให้บล็อกที่เวลาชนกันซ้อนทับจนมองไม่เห็น
 */
export function assignDayLanes(dayBlocks = []) {
  if (!dayBlocks || dayBlocks.length === 0) {
    return { laidOutBlocks: [], maxLanes: 0 };
  }

  const sorted = [...dayBlocks].sort((a, b) => {
    if (a.slot.start !== b.slot.start) {
      return a.slot.start - b.slot.start;
    }
    if (b.slot.end !== a.slot.end) {
      return b.slot.end - a.slot.end;
    }
    return String(a.key).localeCompare(String(b.key));
  });

  const clusters = [];
  for (const block of sorted) {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster || block.slot.start >= lastCluster.maxEnd) {
      clusters.push({
        items: [block],
        maxEnd: block.slot.end,
      });
    } else {
      lastCluster.items.push(block);
      lastCluster.maxEnd = Math.max(lastCluster.maxEnd, block.slot.end);
    }
  }

  const laidOutBlocks = [];
  let maxLanes = 1;

  for (const cluster of clusters) {
    const laneEnds = [];
    const placed = [];

    for (const block of cluster.items) {
      let laneIndex = laneEnds.findIndex((endMin) => endMin <= block.slot.start);
      if (laneIndex === -1) {
        laneIndex = laneEnds.length;
        laneEnds.push(block.slot.end);
      } else {
        laneEnds[laneIndex] = block.slot.end;
      }
      placed.push({ block, laneIndex });
    }

    const laneCount = laneEnds.length;
    if (laneCount > maxLanes) {
      maxLanes = laneCount;
    }

    for (const { block, laneIndex } of placed) {
      laidOutBlocks.push({
        ...block,
        laneIndex,
        laneCount,
      });
    }
  }

  return { laidOutBlocks, maxLanes };
}
