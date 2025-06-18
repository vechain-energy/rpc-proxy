import { getCriteriaSetForInput, type LogsRPC } from '@vechain/sdk-network';
import type { PatchedEventLogs } from "./types"

type ethGetLogsParams = {
    address?: string | string[] | null;
    fromBlock?: string;
    toBlock?: string;
    topics?: string[] | string[][];
    blockhash?: string;
}

const MAX_LIMIT = 1000

async function fetchLogsWithPagination(nodeUrl: string, body: any): Promise<PatchedEventLogs[]> {
    let allLogs: PatchedEventLogs[] = [];
    let offset = 0;
    
    while (true) {
        const currentBody = {
            ...body,
            options: {
                ...body.options,
                offset
            }
        };

        const logs: PatchedEventLogs[] = await fetch(`${nodeUrl}/logs/event`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(currentBody)
        }).then(res => res.json());

        allLogs = [...allLogs, ...logs];

        // If we got less than MAX_LIMIT logs, we've reached the end
        if (logs.length < MAX_LIMIT) {
            break;
        }

        offset += MAX_LIMIT;
    }

    return allLogs;
}

export async function ethGetLogs({ params: [filterOptions], nodeUrl }: { method: 'eth_getLogs', params: ethGetLogsParams[], nodeUrl: string }): Promise<LogsRPC[]> {
    const criteriaSet = getCriteriaSetForInput({
        address:
            filterOptions.address !== null
                ? filterOptions.address
                : undefined,
        topics: filterOptions.topics
    });

    const body = {
        range: {
            unit: 'block',
            from:
                filterOptions.fromBlock !== undefined
                    ? parseInt(filterOptions.fromBlock, 16)
                    : undefined,
            to:
                filterOptions.toBlock !== undefined
                    ? parseInt(filterOptions.toBlock, 16)
                    : undefined
        },
        criteriaSet,
        options: {
            offset: 0,
            limit: MAX_LIMIT,
            includeIndexes: true
        },
        order: 'asc'
    }

    const logs = await fetchLogsWithPagination(nodeUrl, body);
    return formatToLogsRPC(logs);
}

const formatToLogsRPC = (eventLogs: PatchedEventLogs[]): LogsRPC[] => {
    return eventLogs.map(eventLog => {
        return {
            address: eventLog.address,
            blockHash: eventLog.meta.blockID,
            blockNumber: `0x${Number(eventLog.meta.blockNumber).toString(16)}`,
            data: eventLog.data,
            // Always false for now
            removed: false,
            topics: eventLog.topics,
            transactionHash: eventLog.meta.txID,
            transactionIndex: `0x${Number(eventLog.meta.txIndex).toString(16)}`,
            logIndex: `0x${Number(eventLog.meta.logIndex).toString(16)}`
        } satisfies LogsRPC;
    });
};
