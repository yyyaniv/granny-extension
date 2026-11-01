const DAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];
const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

export const DAY_NAMES_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function formatTime(d) {
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}

export function formatDateUk(d) {
  const x = new Date(d);
  return `${DAYS[x.getDay()]}, ${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}
