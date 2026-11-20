import type { LineEnding } from '../domain/fs';
import { ports } from './ports';

const KEY = 'rustpilot.recovery.v1';
export interface RecoveryItem { path: string; text: string; lineEnding: LineEnding }

const read = (): RecoveryItem[] => {
  try {
    const value: unknown = JSON.parse(ports().storage.get(KEY) ?? '[]');
    return Array.isArray(value) ? value as RecoveryItem[] : [];
  } catch { return []; }
};
const write = (items: RecoveryItem[]) => ports().storage.set(KEY, JSON.stringify(items));
export const listRecovery = (): RecoveryItem[] => read();
export function saveRecovery(item: RecoveryItem): void {
  const items = [item, ...read().filter((entry) => entry.path !== item.path)].slice(0, 20);
  write(items);
}
export function removeRecovery(path: string): void { write(read().filter((item) => item.path !== path)); }
export function clearRecovery(): void { ports().storage.remove(KEY); }
