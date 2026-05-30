import { QueueItemStatus, STATUS_LABELS } from '@/lib/queueStatus';

interface QueueStatusBadgeProps {
  status?: QueueItemStatus;
  compact?: boolean;
}

export default function QueueStatusBadge({ status, compact }: QueueStatusBadgeProps) {
  const key = status ?? 'unchanged';
  const meta = STATUS_LABELS[key];
  return (
    <span
      className={`queue-status-badge ${meta.className}${compact ? ' queue-status-badge--compact' : ''}`}
      title={meta.label}
    >
      {compact ? meta.short : meta.label}
    </span>
  );
}
