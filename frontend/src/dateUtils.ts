/**
 * Helper utilities to avoid timezone shifts when dealing with date-only strings (YYYY-MM-DD)
 * in Javascript Date objects.
 */

export const parseLocalDate = (dateStr: string | Date | null | undefined): Date => {
  let year: number;
  let month: number; // 0-indexed
  let day: number;

  if (!dateStr) {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
    day = now.getDate();
  } else if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth();
      day = now.getDate();
    } else {
      year = dateStr.getFullYear();
      month = dateStr.getMonth();
      day = dateStr.getDate();
    }
  } else {
    const cleanStr = typeof dateStr === 'string' && dateStr.includes('T') 
      ? dateStr.split('T')[0] 
      : String(dateStr);

    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const parsedYear = parseInt(parts[0], 10);
      const parsedMonth = parseInt(parts[1], 10);
      const parsedDay = parseInt(parts[2], 10);
      if (!isNaN(parsedYear) && !isNaN(parsedMonth) && !isNaN(parsedDay)) {
        year = parsedYear;
        month = parsedMonth - 1; // JS months are 0-based
        day = parsedDay;
      } else {
        const parsed = new Date(dateStr);
        if (isNaN(parsed.getTime())) {
          const now = new Date();
          year = now.getFullYear();
          month = now.getMonth();
          day = now.getDate();
        } else {
          year = parsed.getFullYear();
          month = parsed.getMonth();
          day = parsed.getDate();
        }
      }
    } else {
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth();
        day = now.getDate();
      } else {
        year = parsed.getFullYear();
        month = parsed.getMonth();
        day = parsed.getDate();
      }
    }
  }

  // Normalise to 12:00 UTC to avoid timezone offset shifts
  return new Date(Date.UTC(year, month, day, 12));
};

export const toISODateString = (d: Date | null | undefined): string => {
  if (!d || isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
