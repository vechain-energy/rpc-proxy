import type { EventLogs } from '@vechain/sdk-network';

export type PatchedEventLogs = EventLogs & { meta: EventLogs['meta'] & { txIndex: number, logIndex: number } }

export interface ThorEvent {
    address: string;
    topics: string[];
    data: string;
    logIndex: number;
}

export interface ThorOutput {
    contractAddress: string | null;
    events: ThorEvent[];
}

export interface ThorClause {
    to: string | null;
    value: string;
    data: string;
}

export interface ThorTransaction {
    id: string;
    origin: string;
    gasUsed: number;
    reverted: boolean;
    clauses: ThorClause[];
    outputs: ThorOutput[];
    meta: {
        blockID: string;
        blockNumber: number;
        txIndex: number;
    };
}

export interface ThorBlock {
    number: number;
    id: string;
    transactions: ThorTransaction[];
    gasUsed: number;
    stateRoot: string;
}