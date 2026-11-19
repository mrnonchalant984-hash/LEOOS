export type WorkflowSchedule =
  | { type: 'interval'; every_minutes: number }
  | { type: 'daily'; time: string; timezone: string }
  | { type: 'weekly'; time: string; timezone: string; weekday: number };

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
function getLocalParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second) };
}
function localToUtc(parts: LocalParts, timezone: string): Date {
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let candidate = new Date(wallClock);
  for (let index = 0; index < 3; index += 1) {
    const actual = getLocalParts(candidate, timezone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate = new Date(candidate.getTime() + wallClock - represented);
  }
  return candidate;
}
export function nextWorkflowRunAt(schedule: WorkflowSchedule, from = new Date()): string {
  if (schedule.type === 'interval') {
    if (!Number.isInteger(schedule.every_minutes) || schedule.every_minutes < 15 || schedule.every_minutes > 1440) throw new Error('Invalid workflow interval.');
    return new Date(from.getTime() + schedule.every_minutes * 60_000).toISOString();
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) throw new Error('Schedule time must use HH:mm.');
  const current = getLocalParts(from, schedule.timezone);
  const [hour, minute] = schedule.time.split(':').map(Number);
  const localDate = new Date(Date.UTC(current.year, current.month - 1, current.day));
  let daysAhead = 0;
  if (schedule.type === 'daily') {
    const today = localToUtc({ ...current, hour, minute, second: 0 }, schedule.timezone);
    if (today.getTime() > from.getTime()) return today.toISOString();
    daysAhead = 1;
  } else {
    if (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6) throw new Error('Weekday must be between 0 and 6.');
    daysAhead = (schedule.weekday - localDate.getUTCDay() + 7) % 7;
    const target = localToUtc({ ...current, hour, minute, second: 0 }, schedule.timezone);
    if (daysAhead === 0 && target.getTime() <= from.getTime()) daysAhead = 7;
  }
  localDate.setUTCDate(localDate.getUTCDate() + daysAhead);
  return localToUtc({ ...current, year: localDate.getUTCFullYear(), month: localDate.getUTCMonth() + 1, day: localDate.getUTCDate(), hour, minute, second: 0 }, schedule.timezone).toISOString();
}
