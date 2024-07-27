import type { EventLogs } from '@vechain/sdk-network';

export type PatchedEventLogs = EventLogs & { meta: EventLogs['meta'] & { transactionIndex: number, logIndex: number } }