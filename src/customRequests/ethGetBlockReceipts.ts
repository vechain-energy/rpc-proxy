import { type VeChainProvider } from "@vechain/sdk-network";
import { isBlockHash } from "../utils";
import { ThorBlock, ThorTransaction } from "./types";

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


type BlockWithTransactionHashes = {
    transactions: string[];
}

/**
 * Implements the custom `eth_getBlockReceipts` RPC method.
 * @param request The request object containing the RPC method's parameters.
 * @param provider The VeChain provider instance.
 * @returns A promise that resolves to an array of transaction receipts for the given block.
 */
export const ethGetBlockReceipts = async (
    {nodeUrl, params} :  { params: any[], nodeUrl: string }
): Promise<VeChainRPCReceipt[]> => {
    const [blockId] = params;

    const thorBlock: ThorBlock = await fetch(`${nodeUrl}/blocks/${blockId}?expanded=true`).then(res => res.json());

    if (!thorBlock || !thorBlock.transactions) {
        return [];
    }

    let cumulativeGasUsed = 0;

    return thorBlock.transactions
        .sort((a, b) => a.meta.txIndex - b.meta.txIndex)
        .map((tx: ThorTransaction): VeChainRPCReceipt => {
            const gasUsed = tx.gasUsed;
            cumulativeGasUsed += gasUsed;

            const txMeta = {
                blockHash: tx.meta.blockID,
                blockNumber: `0x${tx.meta.blockNumber.toString(16)}`,
                transactionHash: tx.id,
                transactionIndex: `0x${tx.meta.txIndex.toString(16)}`,
            };

            return {
                blockHash: txMeta.blockHash,
                blockNumber: txMeta.blockNumber,
                contractAddress: tx.outputs[0]?.contractAddress ?? null,
                cumulativeGasUsed: `0x${cumulativeGasUsed.toString(16)}`,
                from: tx.origin,
                gasUsed: `0x${gasUsed.toString(16)}`,
                logs:
                    tx.outputs[0]?.events.map(
                        (event): VeChainRPCLog => ({
                            address: event.address,
                            topics: event.topics,
                            data: event.data,
                            logIndex: `0x${event.logIndex.toString(16)}`,
                            blockNumber: txMeta.blockNumber,
                            blockHash: txMeta.blockHash,
                            transactionHash: txMeta.transactionHash,
                            transactionIndex: txMeta.transactionIndex,
                        }),
                    ) ?? [],
                logsBloom: '0x' + '0'.repeat(512),
                root: thorBlock.stateRoot,
                status: tx.reverted ? '0x0' : '0x1',
                to: tx.clauses[0]?.to ?? null,
                transactionHash: txMeta.transactionHash,
                transactionIndex: txMeta.transactionIndex,
            };
        });
};
