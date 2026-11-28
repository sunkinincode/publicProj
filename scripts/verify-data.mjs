import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'public', 'data', 'manifest.json');

function main() {
  assert.ok(fs.existsSync(MANIFEST_PATH), `Missing manifest.json at ${MANIFEST_PATH}`);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

  assert.ok(manifest.updatedAt, 'manifest.updatedAt must be set');
  assert.ok(Array.isArray(manifest.semesters) && manifest.semesters.length > 0, 'manifest.semesters must be non-empty');

  const expectedCampuses = ['01', '02', '03', '04', '05'];
  console.log(`Manifest updatedAt: ${manifest.updatedAt}`);
  console.log(`Default: semester=${manifest.defaultSemester}, campus=${manifest.defaultCampus}\n`);

  for (const sem of manifest.semesters) {
    console.log(`=== ภาคการศึกษา ${sem.label} (${sem.id}) ===`);
    const campusCodes = sem.campuses.map((c) => c.code);
    for (const code of expectedCampuses) {
      assert.ok(campusCodes.includes(code), `Semester ${sem.id} missing campus ${code}`);
    }

    let semTotal = 0;
    for (const cEntry of sem.campuses) {
      const filePath = path.join(ROOT_DIR, 'public', cEntry.file);
      assert.ok(fs.existsSync(filePath), `Missing campus data file: ${filePath}`);
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const subjects = payload.subjects || [];

      assert.ok(subjects.length > 0, `Campus ${cEntry.code} (${cEntry.name}) has 0 subjects`);
      assert.equal(subjects.length, cEntry.subjectCount, `Count mismatch in manifest for campus ${cEntry.code}`);

      const seenIds = new Set();
      let sectionCount = 0;
      let onlineSubjectCount = 0;
      let prereqSubjectCount = 0;

      for (const s of subjects) {
        assert.ok(s.id && s.code && s.nameTh, `Missing id/code/nameTh on subject ${JSON.stringify(s).slice(0, 120)}`);
        assert.ok(!seenIds.has(s.id), `Duplicate subject id ${s.id} in campus ${cEntry.code}`);
        seenIds.add(s.id);

        assert.ok(typeof s.creditNum === 'number' && !Number.isNaN(s.creditNum), `Invalid creditNum on ${s.code}`);
        assert.ok(Array.isArray(s.prerequisites), `prerequisites must be array on ${s.code}`);
        assert.ok(Array.isArray(s.sections), `sections must be array on ${s.code}`);

        if (s.prerequisites.length > 0) prereqSubjectCount += 1;
        if (s.sections.some((sec) => sec.isOnline)) onlineSubjectCount += 1;

        for (const sec of s.sections) {
          sectionCount += 1;
          assert.ok(sec.sec, `Missing sec number on ${s.code}`);
          assert.ok(typeof sec.isOnline === 'boolean', `Missing isOnline boolean on ${s.code}`);
          assert.ok(typeof sec.isRestrictedGroup === 'boolean', `Missing isRestrictedGroup boolean on ${s.code}`);
          assert.ok(Array.isArray(sec.slots), `slots must be array on ${s.code} Sec ${sec.sec}`);
          for (const sl of sec.slots) {
            assert.ok(sl.day >= 0 && sl.day <= 6, `Invalid slot.day=${sl.day} on ${s.code}`);
            assert.ok(sl.start < sl.end, `Invalid slot time ${sl.start}-${sl.end} on ${s.code}`);
          }
        }
      }

      semTotal += subjects.length;
      const sizeKb = (fs.statSync(filePath).size / 1024).toFixed(1);
      console.log(
        `  [${cEntry.code}] ${cEntry.name.padEnd(22)} | ${String(subjects.length).padStart(5)} วิชา | ${String(sectionCount).padStart(5)} sec | ออนไลน์/ไม่ระบุห้อง ${String(onlineSubjectCount).padStart(4)} | บังคับก่อน ${String(prereqSubjectCount).padStart(3)} | ${sizeKb} KB`
      );
    }

    assert.equal(semTotal, sem.totalSubjects, `Semester totalSubjects mismatch for ${sem.id}`);
    console.log(`  รวมทั้งหมด: ${semTotal} วิชา (ทุกวิทยาเขตผ่านการตรวจสอบ)\n`);
  }
}

main();
