const campusCache = new Map();
let manifestPromise = null;

function resolveDataUrl(relativePath) {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${String(relativePath || '').replace(/^\/+/, '')}`;
}

/**
 * โหลดไฟล์ดัชนีกลาง manifest.json แบบ Cache ในหน่วยความจำ
 */
export function loadCatalogManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(resolveDataUrl('data/manifest.json'))
      .then((res) => {
        if (!res.ok) {
          throw new Error(`โหลด manifest.json ไม่สำเร็จ (HTTP ${res.status})`);
        }
        return res.json();
      })
      .catch((err) => {
        manifestPromise = null;
        throw err;
      });
  }
  return manifestPromise;
}

/**
 * โหลดข้อมูลรายวิชารายวิทยาเขตแบบ Lazy Load พร้อม Deduplicate คำขอที่กำลังโหลดและ Cache ผลลัพธ์
 */
export function loadCampusCatalog(filePath) {
  if (!filePath) {
    return Promise.resolve({ subjects: [] });
  }

  if (campusCache.has(filePath)) {
    return campusCache.get(filePath);
  }

  const pending = fetch(resolveDataUrl(filePath))
    .then((res) => {
      if (!res.ok) {
        throw new Error(`โหลดข้อมูลรายวิชาไม่สำเร็จ (HTTP ${res.status})`);
      }
      return res.json();
    })
    .catch((err) => {
      campusCache.delete(filePath);
      throw err;
    });

  campusCache.set(filePath, pending);
  return pending;
}
