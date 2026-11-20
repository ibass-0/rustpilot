import { For, Show, type JSX } from 'solid-js';
import { clearNotifications, dismissNotification, notifications } from '../../application/notificationStore';

export function NotificationsPanel(): JSX.Element {
  return <div class="notifications-panel">
    <div class="notifications-toolbar"><button type="button" class="button" disabled={!notifications.items.length} onClick={clearNotifications}>Clear All</button></div>
    <Show when={notifications.items.length > 0} fallback={<div class="empty-state">No notifications.</div>}>
      <For each={notifications.items}>{(item) => <article class={`notification notification-${item.level}`}>
        <div class="notification-content"><strong>{item.level.toUpperCase()}</strong><span>{item.message}</span><Show when={item.count > 1}><small>×{item.count}</small></Show></div>
        <button type="button" class="notification-dismiss" aria-label="Dismiss notification" onClick={() => dismissNotification(item.id)}>×</button>
      </article>}</For>
    </Show>
  </div>;
}
