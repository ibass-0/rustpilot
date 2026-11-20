import { createStore } from 'solid-js/store';

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';
export interface Notification { id: number; level: NotificationLevel; message: string; count: number; time: number }
const [state, setState] = createStore<{ items: Notification[] }>({ items: [] });
export const notifications = state;
let nextId = 1;

export function notify(level: NotificationLevel, message: string): void {
  const existing = state.items.find((item) => item.level === level && item.message === message);
  if (existing) { setState('items', existing.id, 'count', existing.count + 1); setState('items', existing.id, 'time', Date.now()); return; }
  setState('items', (items) => [{ id: nextId++, level, message, count: 1, time: Date.now() }, ...items].slice(0, 50));
}
export function dismissNotification(id: number): void { setState('items', (items) => items.filter((item) => item.id !== id)); }
export function clearNotifications(): void { setState('items', []); }
