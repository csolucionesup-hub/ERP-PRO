/** Retorna timestamp MySQL: 'YYYY-MM-DD HH:MM:SS' */
export function nowSQL(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** Retorna fecha MySQL: 'YYYY-MM-DD' */
export function todaySQL(): string {
  return new Date().toISOString().split('T')[0];
}
