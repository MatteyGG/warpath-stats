export function isValidDayInt(dayInt: unknown): dayInt is number {
  if (typeof dayInt !== "number" || !Number.isInteger(dayInt)) return false;

  const s = String(dayInt);
  if (!/^\d{8}$/.test(s)) return false;

  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));

  // быстрые границы
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  // строгая календарная валидация через Date.UTC
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

// безопасная итерация по дням
export function nextDayInt(dayInt: number): number {
  const s = String(dayInt);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));

  const dt = new Date(Date.UTC(y, m - 1, d));
  // шаг +1 день в UTC
  dt.setUTCDate(dt.getUTCDate() + 1); // стандартный способ инкремента даты :contentReference[oaicite:0]{index=0}

  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return Number(`${yy}${mm}${dd}`);
}
