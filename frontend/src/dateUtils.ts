/**
 * Helper utilities to avoid timezone shifts when dealing with date-only strings (YYYY-MM-DD)
 * in Javascript Date objects.
 */

export const parseLocalDate = (dateStr: string | Date | null | undefined): Date => {
  let date: Date;
  if (!dateStr) {
    date = new Date();
  } else if (dateStr instanceof Date) {
    date = new Date(dateStr.getTime());
  } else {
    // Handle case where we might have a full ISO string (e.g. from an existing Date.toISOString())
    const cleanStr = typeof dateStr === 'string' && dateStr.includes('T') 
      ? dateStr.split('T')[0] 
      : String(dateStr);

    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        // Month is 0-indexed in JS Date constructor
        date = new Date(year, month - 1, day);
      } else {
        const parsed = new Date(dateStr);
        date = isNaN(parsed.getTime()) ? new Date() : parsed;
      }
    } else {
      const parsed = new Date(dateStr);
      date = isNaN(parsed.getTime()) ? new Date() : parsed;
    }
  }
  date.setHours(12, 0, 0, 0);
  return date;
};

export const toISODateString = (d: Date | null | undefined): string => {
  if (!d || isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
