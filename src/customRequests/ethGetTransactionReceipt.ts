export type VeChainRPCLog = {
    address: string;
    topics: string[];
    data: string;
    logIndex: string;
    blockNumber: string;
    blockHash: string;
    transactionHash: string;
    transactionIndex: string;
}

export type VeChainRPCReceipt = {
    blockHash: string;
    blockNumber: string;
    contractAddress: string | null;
    cumulativeGasUsed: string;
    from: string;
    gasUsed: string;
    logs: VeChainRPCLog[];
    logsBloom: string;
    root: string;
    status: string;
    to: string | null;
    transactionHash: string;
    transactionIndex: string;
}

/**
 * Implements the custom `eth_getTransactionReceipt` RPC method.
 * This function handles cases where the transaction doesn't exist or has no clauses/events/outputs/logs.
 * @param request The request object containing the RPC method's parameters.
 * @param nodeUrl The VeChain node URL.
 * @returns A promise that resolves to a transaction receipt or null if not found.
 */
export const ethGetTransactionReceipt = async (
    { nodeUrl, params }: { params: any[], nodeUrl: string }
): Promise<VeChainRPCReceipt | null> => {
    const [txHash] = params;

    if (!txHash || typeof txHash !== 'string') {
        return null;
    }

    try {
        // Try to fetch the transaction from the node
        const response = await fetch(`${nodeUrl}/transactions/${txHash}?expanded=true`);
        
        if (!response.ok) {
            // If the transaction doesn't exist, return null
            return null;
        }

        const tx: any = await response.json();
        if (!tx || !tx.meta) {
            return null;
        }

        const gasUsed = tx.gasUsed || 0;
        const txMeta = {
            blockHash: tx.meta.blockID,
            blockNumber: `0x${tx.meta.blockNumber.toString(16)}`,
            transactionHash: tx.id,
            transactionIndex: tx.meta.txIndex !== undefined ? `0x${tx.meta.txIndex.toString(16)}` : '0x0',
        };

        // Collect all events from all outputs, if present
        const allEvents: VeChainRPCLog[] = [];
        if (Array.isArray(tx.outputs)) {
            let eventIndex = 0;
            tx.outputs.forEach((output: any) => {
                if (output.events) {
                    output.events.forEach((event: any) => {
                        allEvents.push({
                            address: event.address,
                            topics: event.topics,
                            data: event.data,
                            logIndex: `0x${eventIndex.toString(16)}`,
                            blockNumber: txMeta.blockNumber,
                            blockHash: txMeta.blockHash,
                            transactionHash: txMeta.transactionHash,
                            transactionIndex: txMeta.transactionIndex,
                        });
                        eventIndex++;
                    });
                }
            });
        }

        return {
            blockHash: txMeta.blockHash,
            blockNumber: txMeta.blockNumber,
            contractAddress: Array.isArray(tx.outputs) && tx.outputs[0]?.contractAddress ? tx.outputs[0].contractAddress : null,
            cumulativeGasUsed: `0x${gasUsed.toString(16)}`,
            from: tx.origin,
            gasUsed: `0x${gasUsed.toString(16)}`,
            logs: allEvents,
            logsBloom: '0x' + '0'.repeat(512),
            root: '', // This would need to be fetched from the block if needed
            status: tx.reverted ? '0x0' : '0x1',
            to: Array.isArray(tx.clauses) && tx.clauses.length > 0 ? tx.clauses[0]?.to ?? null : null,
            transactionHash: txMeta.transactionHash,
            transactionIndex: txMeta.transactionIndex,
        };
    } catch (error) {
        // If any error occurs during the request, return null
        console.warn(`Error fetching transaction receipt for ${txHash}:`, error);
        return null;
    }
}; 