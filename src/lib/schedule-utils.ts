/**
 * Utility to calculate the next occurrence of a recurring schedule.
 */
export function calculateNextOccurrence(rec: any, sh: number, sm: number, ss: number) {
  let nextDate = new Date(rec.date);
  const now = new Date();

  // Set the time correctly for comparison
  nextDate.setHours(sh, sm, ss, 0);

  // Safety loop: keep rolling forward until the date is actually in the future.
  // This prevents 'zombie' tasks from starting if they were created with a past date.
  let safetyCounter = 0;
  while (nextDate <= now && safetyCounter < 100) {
    safetyCounter++;
    if (rec.recurrence === "weekday") {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (rec.recurrence === "monthday") {
      const targetDay = rec.recurrenceDay;
      if (targetDay) {
        let year = nextDate.getFullYear();
        let monthIdx = nextDate.getMonth() + 1; // Roll to next month
        let next = new Date(year, monthIdx, targetDay);
        // Handle months shorter than targetDay (e.g. Feb 30th)
        while (next.getDate() !== targetDay && safetyCounter < 100) {
          safetyCounter++;
          monthIdx++;
          next = new Date(year, monthIdx, targetDay);
        }
        nextDate.setTime(next.getTime());
      } else {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
    } else {
      break; // non-recurring
    }
    // Re-ensure time is correct after date manipulation
    nextDate.setHours(sh, sm, ss, 0);
  }
  return nextDate;
}
