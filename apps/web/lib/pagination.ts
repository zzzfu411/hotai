export const MAX_PAGE = 1000;
export function parsePage(raw?: string): number {
  if (!raw || !/^[1-9]\d{0,3}$/.test(raw)) return 1;
  return Math.min(MAX_PAGE, Number(raw));
}
