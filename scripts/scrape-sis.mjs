import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, 'public', 'data');

export const CAMPUSES = [
  { code: '01', name: 'วิทยาเขตหาดใหญ่', shortName: 'หาดใหญ่' },
  { code: '02', name: 'วิทยาเขตปัตตานี', shortName: 'ปัตตานี' },
  { code: '03', name: 'วิทยาเขตภูเก็ต', shortName: 'ภูเก็ต' },
  { code: '04', name: 'วิทยาเขตสุราษฎร์ธานี', shortName: 'สุราษฎร์ธานี' },
  { code: '05', name: 'วิทยาเขตตรัง', shortName: 'ตรัง' },
];

const CAMPUS_BY_CODE = new Map(CAMPUSES.map((c) => [c.code, c]));
const CAMPUS_BY_NAME = new Map(CAMPUSES.map((c) => [c.name, c.code]));

const DAY_PATTERNS = [
  { re: /(จันทร์|จ\.)/g, day: 0, dayName: 'จันทร์' },
  { re: /(อังคาร|อ\.)/g, day: 1, dayName: 'อังคาร' },
  { re: /(พฤหัสบดี|พฤหัส|พฤ\.)/g, day: 3, dayName: 'พฤหัสบดี' },
  { re: /(พุธ|พ\.)/g, day: 2, dayName: 'พุธ' },
  { re: /(ศุกร์|ศ\.)/g, day: 4, dayName: 'ศุกร์' },
  { re: /(เสาร์|ส\.)/g, day: 5, dayName: 'เสาร์' },
  { re: /(อาทิตย์|อา\.)/g, day: 6, dayName: 'อาทิตย์' },
];

function parseCliArgs(argv) {
  const config = {
    term: '2',
    year: '2569',
    campuses: CAMPUSES.map((c) => c.code),
    concurrency: 8,
    force: false,
    buildOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--term' && argv[i + 1]) config.term = String(argv[++i]).trim();
    else if (arg === '--year' && argv[i + 1]) config.year = String(argv[++i]).trim();
    else if (arg === '--campus' && argv[i + 1]) {
      config.campuses = String(argv[++i])
        .split(',')
        .map((c) => c.trim().padStart(2, '0'))
        .filter((c) => CAMPUS_BY_CODE.has(c));
    } else if (arg === '--concurrency' && argv[i + 1]) {
      const n = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 16) config.concurrency = n;
    } else if (arg === '--force') config.force = true;
    else if (arg === '--build-only') config.buildOnly = true;
  }

  return config;
}

function pad2(num) {
  return String(num).padStart(2, '0');
}

function formatTime(minutes) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/**
 * แปลงข้อความวันและเวลาเรียน เช่น "อังคาร 08:00–09:50, พุธ 13:00–14:50" เป็น slots[]
 */
export function parseDayTimeSlots(dayTimeText) {
  if (!dayTimeText || typeof dayTimeText !== 'string') return [];
  const normalized = dayTimeText
    .replace(/\u2013|\u2014|−/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || normalized === '-' || normalized.includes('ยังไม่มีตารางเรียน')) {
    return [];
  }

  const slots = [];
  const seen = new Set();
  const segments = normalized.split(/[,;\n]+/);

  for (const rawSeg of segments) {
    const seg = rawSeg.trim();
    if (!seg) continue;

    // หาช่วงเวลา (รองรับทั้ง 08:00-09:50 และ 08.00-09.50)
    const timeMatches = [...seg.matchAll(/(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/g)];
    if (timeMatches.length === 0) continue;

    const matchedDays = [];
    for (const dp of DAY_PATTERNS) {
      if (dp.re.test(seg)) {
        matchedDays.push({ day: dp.day, dayName: dp.dayName });
      }
      dp.re.lastIndex = 0;
    }
    if (matchedDays.length === 0) continue;

    for (const tm of timeMatches) {
      const start = Number(tm[1]) * 60 + Number(tm[2]);
      const end = Number(tm[3]) * 60 + Number(tm[4]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
      const timeText = `${formatTime(start)}–${formatTime(end)}`;

      for (const d of matchedDays) {
        const key = `${d.day}-${start}-${end}`;
        if (!seen.has(key)) {
          seen.add(key);
          slots.push({
            day: d.day,
            dayName: d.dayName,
            start,
            end,
            timeText,
          });
        }
      }
    }
  }

  return slots;
}

/**
 * สกัดรายวิชาบังคับก่อน (prerequisites) จากคำอธิบายรายวิชาและข้อความเมตา
 */
export function extractPrerequisites(desc, selfCode = '') {
  if (!desc || typeof desc !== 'string') {
    return { prerequisites: [], prerequisiteText: '-' };
  }

  const match = desc.match(
    /(?:^|[\r\n]|\s)(?:รายวิชาบังคับก่อน|วิชาบังคับก่อน|เงื่อนไขรายวิชา|Prerequisite|PREREQUISITE)[^\S\r\n]*[:：][^\S\r\n]*([^\n\r]*)/i
  );
  if (!match) {
    return { prerequisites: [], prerequisiteText: '-' };
  }

  let raw = match[1].trim();
  if (!desc.includes('\n') && raw.includes('กรรมการบริหารหลักสูตรฯ')) {
    const idx = raw.indexOf('กรรมการบริหารหลักสูตรฯ') + 'กรรมการบริหารหลักสูตรฯ'.length;
    raw = raw.slice(0, idx).trim();
  }

  if (!raw || raw === '-' || raw === '–' || /^ไม่มี\.?$/i.test(raw) || /^none\.?$/i.test(raw)) {
    return { prerequisites: [], prerequisiteText: '-' };
  }

  const codes = (raw.match(/\b\d{3}-\w{2,6}\b/g) || []).filter((c) => c !== selfCode);
  const prerequisites = Array.from(new Set(codes));
  return {
    prerequisites,
    prerequisiteText: raw,
  };
}

/**
 * ตรวจสอบว่า Section เป็นวิชาออนไลน์หรือไม่ระบุห้องเรียน/วันเวลา
 */
export function detectOnlineOrNoRoom({ room, group, badges, slots }) {
  const roomStr = (room || '').trim();
  const groupStr = (group || '').trim();
  const badgeStr = (badges || []).join(' ');

  if (/ONLINE|LMS|ZOOM|MOOC|TEAMS|MEET|WEBEX|E-?LEARNING|ออนไลน์/i.test(`${roomStr} ${badgeStr}`)) {
    return true;
  }
  if (/ออนไลน์|LMS/i.test(groupStr)) {
    return true;
  }
  if (!roomStr || roomStr === '-' || roomStr === '–' || roomStr === '---' || roomStr.toLowerCase() === 'null') {
    return true;
  }
  if (!slots || slots.length === 0) {
    return true;
  }
  return false;
}

/**
 * ตรวจสอบว่า Section จำกัดกลุ่มผู้เรียน (ไม่ใช่กลุ่มทั่วไป)
 */
export function detectRestrictedGroup(groupText) {
  const g = (groupText || '').trim();
  if (!g || g === '-' || g === '–') return false;
  if (/^(นักศึกษา)?ทั่วไป/i.test(g) && !/เฉพาะ/.test(g)) return false;
  if (/^ทุกคณะ|^ทุกหลักสูตร|^นักศึกษาทั่วไปทุก/.test(g)) return false;
  return /เฉพาะ|รหัส\s*\d{2}|ชั้นปีที่|หลักสูตร|สาขาวิชา|วท\.|วศ\.|บธ\.|ศศ\.|พยบ\.|^[A-Z0-9]{2,}/.test(g);
}

export function parseCreditNum(creditsText) {
  if (!creditsText) return 0;
  const match = String(creditsText).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

async function extractSubjectListOnPage(page, fallbackCampusCode) {
  return page.$$eval(
    'a.public-subject-row',
    (rows, campusCodeArg) =>
      rows.map((row) => {
        const href = row.getAttribute('href') || '';
        const match = href.match(/\/explore\/subjects\/([^/?]+)\/(\d+)\/(\d+)\/([^/?]+)/);
        const offerId = match ? match[1] : href;

        const code = row.querySelector('[data-slot="desktop"] [data-slot="code"]')?.textContent?.trim() || '';
        const nameTh = row.querySelector('[data-slot="desktop"] [data-slot="name"]')?.textContent?.trim() || '';
        const subText = row.querySelector('[data-slot="desktop"] [data-slot="sub"]')?.textContent?.trim() || '';
        const subParts = subText.split('·').map((s) => s.trim());
        const nameEn = subParts[0] || '';
        const faculty = subParts.slice(1).join(' · ') || '';

        const pills = Array.from(row.querySelectorAll('[data-slot="desktop"] [data-slot="tags"] .sis-pill-label')).map(
          (el) => el.textContent?.trim() || ''
        );
        const campusName = pills[0] || '';
        const credits = pills[1] || '';

        return {
          offerId,
          code,
          nameTh,
          nameEn,
          faculty,
          campusName,
          campusCode: campusCodeArg,
          credits,
          detailUrl: href ? new URL(href, 'https://sis.psu.ac.th').href : '',
        };
      }),
    fallbackCampusCode
  );
}

async function phase1CollectAllSubjects(browser, config, indexFile) {
  if (!config.force && fs.existsSync(indexFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      const coveredCampuses = new Set(existing.map((s) => s.campusCode));
      if (existing.length > 0 && config.campuses.every((c) => coveredCampuses.has(c))) {
        console.log(`[Phase 1] Loaded cached index with ${existing.length} subjects (${config.campuses.join(',')}).`);
        return existing;
      }
    } catch {
      // Rebuild index if cache file is unreadable
    }
  }

  console.log(`[Phase 1] Collecting subjects for term ${config.term}/${config.year}, campuses: ${config.campuses.join(', ')}...`);
  const context = await browser.newContext({ locale: 'th-TH' });
  await context.route('**/*.{png,jpg,jpeg,webp,svg,woff,woff2,ttf,gif,ico}', (route) => route.abort());

  const results = [];
  const pageTasks = [];

  // Step 1A: Probe page 1 of each requested campus in parallel
  const initPage = await context.newPage();
  for (const campusCode of config.campuses) {
    const campusMeta = CAMPUS_BY_CODE.get(campusCode);
    const url = `https://sis.psu.ac.th/explore/subject?term=${config.term}&year=${config.year}&c=${campusCode}&page=1`;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await initPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await initPage
          .locator('#recordCount, .sis-empty-state--tone-neutral')
          .first()
          .waitFor({ state: 'visible', timeout: 18000 });

        if ((await initPage.locator('#recordCount').count()) === 0) {
          console.log(`  [Campus ${campusCode}] ${campusMeta?.name}: 0 subjects`);
          break;
        }

        await initPage.locator('a.public-subject-row').first().waitFor({ state: 'visible', timeout: 12000 });
        const countText = (await initPage.locator('#recordCount').textContent())?.trim() || '';
        const match = countText.match(/จาก\s+([\d,]+)\s+รายวิชา/);
        const total = match ? Number.parseInt(match[1].replace(/,/g, ''), 10) : 0;
        const totalPages = Math.ceil(total / 10);

        const items = await extractSubjectListOnPage(initPage, campusCode);
        results.push(...items);
        console.log(`  [Campus ${campusCode}] ${campusMeta?.name}: ${total} subjects (${totalPages} pages)`);

        for (let p = 2; p <= totalPages; p += 1) {
          pageTasks.push({ campusCode, p });
        }
        break;
      } catch (err) {
        if (attempt === 3) {
          throw new Error(`Phase 1A failed on campus ${campusCode}: ${err.message}`);
        }
      }
    }
  }
  await initPage.close();

  // Step 1B: Fetch remaining list pages concurrently
  console.log(`[Phase 1B] Fetching ${pageTasks.length} pagination pages with ${config.concurrency} workers...`);
  let pIdx = 0;
  let pagesDone = 0;

  async function paginationWorker() {
    let page = await context.newPage();
    while (pIdx < pageTasks.length) {
      const task = pageTasks[pIdx++];
      const url = `https://sis.psu.ac.th/explore/subject?term=${config.term}&year=${config.year}&c=${task.campusCode}&page=${task.p}`;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.locator('a.public-subject-row').first().waitFor({ state: 'visible', timeout: 15000 });
          const items = await extractSubjectListOnPage(page, task.campusCode);
          results.push(...items);
          pagesDone += 1;
          if (pagesDone % 50 === 0 || pagesDone === pageTasks.length) {
            console.log(`  [Pagination ${pagesDone}/${pageTasks.length}] Collected ${results.length} rows`);
          }
          break;
        } catch (err) {
          try {
            await page.close();
          } catch {}
          page = await context.newPage();
          if (attempt === 3) {
            console.error(`  Failed list page c=${task.campusCode} page=${task.p}: ${err.message}`);
          }
        }
      }
    }
    try {
      await page.close();
    } catch {}
  }

  await Promise.all(Array.from({ length: config.concurrency }, () => paginationWorker()));
  await context.close();

  const uniqueMap = new Map();
  for (const item of results) {
    if (!uniqueMap.has(`${item.campusCode}:${item.offerId}`)) {
      uniqueMap.set(`${item.campusCode}:${item.offerId}`, item);
    }
  }
  const uniqueSubjects = Array.from(uniqueMap.values());
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  fs.writeFileSync(indexFile, JSON.stringify(uniqueSubjects, null, 2), 'utf-8');
  console.log(`[Phase 1 Complete] Saved ${uniqueSubjects.length} unique subjects to ${indexFile}`);
  return uniqueSubjects;
}

async function extractSubjectDetail(page, detailUrl) {
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('.sdh-card').waitFor({ state: 'visible', timeout: 12000 });
  await page
    .locator('article.sis-section-row, .scl-empty, .sis-empty-state')
    .first()
    .waitFor({ state: 'visible', timeout: 4000 })
    .catch(() => {});

  return page.evaluate(() => {
    const getMetaValue = (label) => {
      const dts = Array.from(document.querySelectorAll('.sdv-grid dt'));
      const dt = dts.find((el) => el.textContent?.trim() === label);
      return dt?.nextElementSibling?.textContent?.trim() || '';
    };

    const descriptionTh = document.querySelector('.sdd-text')?.textContent?.trim() || '';

    const sections = Array.from(document.querySelectorAll('article.sis-section-row')).map((sec) => {
      const sectionId = sec.getAttribute('id') || '';
      const title = sec.querySelector('[data-slot="title"]')?.textContent?.trim() || '';
      const seats = sec.querySelector('[data-slot="seat-desktop"] .sis-pill-label')?.textContent?.trim() || '-';
      const badges = Array.from(sec.querySelectorAll('[data-slot="badges-header"] .sis-pill-label')).map(
        (b) => b.textContent?.trim() || ''
      );
      const studentGroup =
        sec.querySelector('[data-slot="group-desktop"] [data-slot="group-value"]')?.textContent?.trim() || 'ทั่วไป';

      const schedules = Array.from(sec.querySelectorAll('table[data-slot="schedule-desktop"] tbody tr')).map((tr) => {
        const tds = tr.querySelectorAll('td');
        return {
          dayTime: tds[0]?.textContent?.trim() || '',
          room: tds[1]?.textContent?.trim() || '',
          instructors: (tds[2]?.textContent?.trim() || '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => Boolean(s) && s !== '-'),
        };
      });

      const examSpans = Array.from(sec.querySelectorAll('[data-slot="exams"] span')).map(
        (s) => s.textContent?.trim() || ''
      );
      const midtermExam =
        examSpans.find((s) => s.startsWith('สอบกลางภาค:'))?.replace('สอบกลางภาค:', '').trim() || '-';
      const finalExam =
        examSpans.find((s) => s.startsWith('สอบปลายภาค:'))?.replace('สอบปลายภาค:', '').trim() || '-';

      return {
        section: sectionId || title.replace(/Section\s+/i, '').trim() || '01',
        seats,
        badges,
        studentGroup,
        schedules,
        midtermExam,
        finalExam,
      };
    });

    return {
      semester: getMetaValue('ภาคการศึกษา'),
      faculty: getMetaValue('คณะ'),
      department: getMetaValue('ภาควิชา'),
      campus: getMetaValue('วิทยาเขต'),
      descriptionTh,
      sections,
    };
  });
}

async function phase2ScrapeDetails(browser, config, allSubjects, detailsFile) {
  const completedKeys = new Set();
  if (!config.force && fs.existsSync(detailsFile)) {
    const raw = fs.readFileSync(detailsFile, 'utf-8').replace(/\0/g, '');
    const validLines = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.offerId && !obj.error) {
          completedKeys.add(`${obj.campusCode || ''}:${obj.offerId}`);
          validLines.push(JSON.stringify(obj));
        }
      } catch {}
    }
    fs.writeFileSync(detailsFile, validLines.join('\n') + (validLines.length ? '\n' : ''), 'utf-8');
  } else if (config.force && fs.existsSync(detailsFile)) {
    fs.unlinkSync(detailsFile);
  }

  const targetCampuses = new Set(config.campuses);
  const pending = allSubjects.filter(
    (s) => targetCampuses.has(s.campusCode) && !completedKeys.has(`${s.campusCode}:${s.offerId}`)
  );
  console.log(`[Phase 2] Total: ${allSubjects.length}, Already done: ${completedKeys.size}, Pending: ${pending.length}`);
  if (pending.length === 0) return;

  const context = await browser.newContext({ locale: 'th-TH' });
  await context.route('**/*.{png,jpg,jpeg,webp,svg,woff,woff2,ttf,gif,ico}', (route) => route.abort());

  let idx = 0;
  let doneCount = 0;
  const startTime = Date.now();

  async function detailWorker() {
    let page = await context.newPage();
    while (idx < pending.length) {
      const subj = pending[idx++];
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const detail = await Promise.race([
            extractSubjectDetail(page, subj.detailUrl),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Subject detail timeout 22s')), 22000)),
          ]);
          const merged = {
            ...subj,
            ...detail,
            faculty: detail.faculty || subj.faculty,
            campus: detail.campus || subj.campusName,
          };
          fs.appendFileSync(detailsFile, `${JSON.stringify(merged)}\n`, 'utf-8');
          doneCount += 1;
          if (doneCount % 100 === 0 || doneCount === pending.length) {
            const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
            const rate = (doneCount / elapsedSec).toFixed(1);
            console.log(`  [Details ${doneCount}/${pending.length}] (${rate} subj/s, ${elapsedSec.toFixed(0)}s) ${subj.code}`);
          }
          break;
        } catch (err) {
          try {
            await page.close();
          } catch {}
          page = await context.newPage();
          if (attempt === 3) {
            console.error(`  Failed detail ${subj.code} (${subj.offerId}): ${err.message}`);
            const fallback = { ...subj, descriptionTh: '', sections: [], error: err.message };
            fs.appendFileSync(detailsFile, `${JSON.stringify(fallback)}\n`, 'utf-8');
          }
        }
      }
    }
    try {
      await page.close();
    } catch {}
  }

  await Promise.all(Array.from({ length: config.concurrency }, () => detailWorker()));
  await context.close();
  console.log('[Phase 2 Complete]');
}

function normalizeSection(rawSec) {
  const schedules = Array.isArray(rawSec.schedules) ? rawSec.schedules : [];
  const dayTimeParts = [];
  const roomParts = [];
  const instructorSet = new Set();
  const slots = [];
  const slotSeen = new Set();

  for (const sch of schedules) {
    const dt = (sch.dayTime || '').trim();
    if (dt && !dt.includes('ยังไม่มีตารางเรียน') && !dayTimeParts.includes(dt)) {
      dayTimeParts.push(dt);
    }
    const rm = (sch.room || '').trim();
    if (rm && rm !== '-' && rm !== '–' && !roomParts.includes(rm)) {
      roomParts.push(rm);
    }
    for (const ins of sch.instructors || []) {
      if (ins && ins !== '-') instructorSet.add(ins);
    }
    for (const sl of parseDayTimeSlots(dt)) {
      const k = `${sl.day}-${sl.start}-${sl.end}`;
      if (!slotSeen.has(k)) {
        slotSeen.add(k);
        slots.push(sl);
      }
    }
  }

  const dayTime = dayTimeParts.join(', ') || 'ไม่ระบุวัน-เวลา';
  const room = roomParts.join(', ') || '-';
  const group = (rawSec.studentGroup || 'ทั่วไป').trim() || 'ทั่วไป';
  const isOnline = detectOnlineOrNoRoom({ room, group, badges: rawSec.badges, slots });

  return {
    sec: String(rawSec.section || '01').trim(),
    seats: (rawSec.seats || '-').trim(),
    group,
    isRestrictedGroup: detectRestrictedGroup(group),
    dayTime,
    room,
    isOnline,
    instructors: Array.from(instructorSet),
    midterm: (rawSec.midtermExam || '-').trim() || '-',
    final: (rawSec.finalExam || '-').trim() || '-',
    slots,
  };
}

function phase3NormalizeAndWrite(config, detailsFile) {
  console.log('[Phase 3] Normalizing records and writing per-campus JSON chunks...');
  if (!fs.existsSync(detailsFile)) {
    throw new Error(`Missing details file: ${detailsFile}`);
  }

  const lines = fs.readFileSync(detailsFile, 'utf-8').split('\n').filter(Boolean);
  const byCampus = new Map(CAMPUSES.map((c) => [c.code, new Map()]));

  for (const line of lines) {
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }

    const campusCode = raw.campusCode || CAMPUS_BY_NAME.get(raw.campusName || raw.campus || '') || '01';
    if (!byCampus.has(campusCode)) continue;

    const campusInfo = CAMPUS_BY_CODE.get(campusCode);
    const semesterLabel = raw.semester || `${config.term}/${config.year}`;
    const desc = (raw.descriptionTh || '').trim();
    const { prerequisites, prerequisiteText } = extractPrerequisites(desc, raw.code);

    const normalizedSubject = {
      id: String(raw.offerId),
      code: (raw.code || '').trim(),
      nameTh: (raw.nameTh || '').trim(),
      nameEn: (raw.nameEn || '').trim(),
      credits: (raw.credits || '').trim(),
      creditNum: parseCreditNum(raw.credits),
      desc: desc || '-',
      prerequisites,
      prerequisiteText,
      dept: (raw.department || '-').trim(),
      faculty: (raw.faculty || '-').trim(),
      campus: (raw.campus || raw.campusName || campusInfo.name).trim(),
      campusCode,
      semester: semesterLabel,
      url: raw.detailUrl || '',
      sections: Array.isArray(raw.sections) ? raw.sections.map(normalizeSection) : [],
    };

    byCampus.get(campusCode).set(normalizedSubject.id, normalizedSubject);
  }

  const semesterId = `${config.year}-${config.term}`;
  const semesterLabel = `${config.term}/${config.year}`;
  const outDir = path.join(PUBLIC_DATA_DIR, semesterId);
  fs.mkdirSync(outDir, { recursive: true });

  const updatedAt = new Date().toISOString();
  const campusEntries = [];

  for (const campus of CAMPUSES) {
    const map = byCampus.get(campus.code);
    const subjects = Array.from(map.values()).sort((a, b) => {
      const codeCmp = a.code.localeCompare(b.code);
      return codeCmp !== 0 ? codeCmp : a.id.localeCompare(b.id);
    });

    const relFile = `data/${semesterId}/${campus.code}.json`;
    const absFile = path.join(ROOT_DIR, 'public', relFile);

    // ถ้าดึงบางวิทยาเขต และไฟล์เดิมมีอยู่แล้ว ให้ใช้ข้อมูลเดิมถ้า map ว่าง
    if (subjects.length === 0 && !config.campuses.includes(campus.code) && fs.existsSync(absFile)) {
      const existing = JSON.parse(fs.readFileSync(absFile, 'utf-8'));
      campusEntries.push({
        code: campus.code,
        name: campus.name,
        shortName: campus.shortName,
        subjectCount: (existing.subjects || []).length,
        file: relFile,
      });
      continue;
    }

    const payload = {
      semester: semesterLabel,
      campusCode: campus.code,
      campusName: campus.name,
      updatedAt,
      subjects,
    };
    fs.writeFileSync(absFile, JSON.stringify(payload), 'utf-8');

    const sectionCount = subjects.reduce((sum, s) => sum + s.sections.length, 0);
    const sizeKb = (fs.statSync(absFile).size / 1024).toFixed(1);
    console.log(`  [${campus.code}] ${campus.name}: ${subjects.length} วิชา, ${sectionCount} sec (${sizeKb} KB)`);

    campusEntries.push({
      code: campus.code,
      name: campus.name,
      shortName: campus.shortName,
      subjectCount: subjects.length,
      file: relFile,
    });
  }

  const manifestFile = path.join(PUBLIC_DATA_DIR, 'manifest.json');
  let manifest = {
    updatedAt,
    defaultSemester: semesterId,
    defaultCampus: '01',
    semesters: [],
  };

  if (fs.existsSync(manifestFile)) {
    try {
      const oldManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
      manifest = {
        ...oldManifest,
        updatedAt,
        defaultSemester: oldManifest.defaultSemester || semesterId,
        defaultCampus: oldManifest.defaultCampus || '01',
        semesters: Array.isArray(oldManifest.semesters) ? oldManifest.semesters : [],
      };
    } catch {}
  }

  const semRecord = {
    id: semesterId,
    label: semesterLabel,
    term: config.term,
    year: config.year,
    totalSubjects: campusEntries.reduce((sum, c) => sum + c.subjectCount, 0),
    campuses: campusEntries,
  };

  const otherSems = manifest.semesters.filter((s) => s.id !== semesterId);
  manifest.semesters = [semRecord, ...otherSems].sort((a, b) => b.id.localeCompare(a.id));

  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[Phase 3 Complete] Wrote manifest to ${manifestFile}`);
}

async function main() {
  const config = parseCliArgs(process.argv.slice(2));
  const cacheDir = path.join(ROOT_DIR, '.cache', 'sis', `${config.year}-${config.term}`);
  const indexFile = path.join(cacheDir, 'index.json');
  const detailsFile = path.join(cacheDir, 'details.jsonl');

  fs.mkdirSync(cacheDir, { recursive: true });

  if (!config.buildOnly) {
    let browser;
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }

    try {
      const allSubjects = await phase1CollectAllSubjects(browser, config, indexFile);
      await phase2ScrapeDetails(browser, config, allSubjects, detailsFile);
    } finally {
      await browser.close();
    }
  }

  phase3NormalizeAndWrite(config, detailsFile);
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main().catch((err) => {
    console.error('[Scrape Failed]', err);
    process.exit(1);
  });
}
