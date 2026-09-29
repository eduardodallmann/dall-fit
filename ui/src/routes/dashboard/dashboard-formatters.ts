export function formatDashboardDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

export function formatDashboardDateTime(
  value: string,
  timezone: string,
): string {
  const result = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
  return result;
}

export function formatDashboardWeek(
  startDate: string,
  endDate: string,
): string {
  const format = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
  const result = `${format.format(new Date(`${startDate}T00:00:00Z`))} – ${format.format(new Date(`${endDate}T00:00:00Z`))}`;
  return result;
}
