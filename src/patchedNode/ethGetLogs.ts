import { getCriteriaSetForInput, type LogsRPC } from '@vechain/sdk-network';
import type { PatchedEventLogs } from "./types"

type ethGetLogsParams = {
    address?: string | string[] | null;
    fromBlock?: string;
    toBlock?: string;
    topics?: string[] | string[][];
    blockhash?: string;
}
export async function ethGetLogs({ params: [filterOptions], nodeUrl }: { method: 'eth_getLogs', params: ethGetLogsParams[], nodeUrl: string }): Promise<LogsRPC[]> {
    const criteriaSet = getCriteriaSetForInput({
        address:
            filterOptions.address !== null
                ? filterOptions.address
                : undefined,
        topics: filterOptions.topics
    });

    const logs: PatchedEventLogs[] = await fetch(`${nodeUrl}/logs/event`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
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
            order: 'asc'
        })
    }).then(res => res.json())

    return formatToLogsRPC(logs)
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
            transactionIndex: `0x${Number(eventLog.meta.transactionIndex).toString(16)}`,
            logIndex: `0x${Number(eventLog.meta.logIndex).toString(16)}`
        } satisfies LogsRPC;
    });
};
