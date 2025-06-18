import type { EventLogs } from '@vechain/sdk-network';

export type PatchedEventLogs = EventLogs & { meta: EventLogs['meta'] & { txIndex: number, logIndex: number } }