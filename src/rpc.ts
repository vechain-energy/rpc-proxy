#! /usr/bin/env node

import { Command, Option } from "commander"
import figlet from "figlet"
import chalk from 'chalk'
import express from 'express'
import cors from 'cors'
import { type ExpandedBlockDetail, ThorClient, VeChainProvider } from '@vechain/sdk-network';
import LRUCache from 'mnemonist/lru-cache';

const version = require('../package.json').version;
BigInt.prototype.toJSON = function () { return this.toString(); }

console.log(chalk.keyword('orange')(figlet.textSync(`rpc ${version}`)))
console.log("")

const program = new Command()
program
    .version(version)
    .description("vechain rpc proxy")
    .addOption(new Option('-n, --node <url>', 'Node URL of the blockchain').env('NODE_URL').default('https://node-mainnet.vechain.energy'))
    .addOption(new Option('-p, --port <port>', 'Port to listen on').env('PORT').default('8545'))
    .addOption(new Option('-v, --verbose', 'Enables more detailed logging').env('VERBOSE').default(false))
    .addOption(new Option('--disable-cache', 'Disable caching for immutable results').env('DISABLE_CACHE'))
    .addOption(new Option('--cache-items <number>', 'Number of maximum cacheabled items').env('CACHE_ITEMS').default(100000).conflicts('disableCache'))
    .parse(process.argv)

const options = program.opts()

if (!options.node) {
    console.log('Please provide all required options. Use --help for more information')
    process.exit(1)
}

async function startProxy() {
    console.log(chalk.green("Starting Vechain RPC-Proxy"))
    console.log("")
    console.log("Node:", chalk.grey(options.node))
    console.log("Port:", chalk.grey(options.port))
    console.log("Cache:", chalk.grey(options.disableCache ? 'Disabled' : `${options.cacheItems} items`))
    console.log("")

    const thorClient = ThorClient.fromUrl(options.node)
    const provider = new VeChainProvider(thorClient);
    const blockCache = new LRUCache<string, ExpandedBlockDetail>(Number(100000));

    // setup webserver to listen for request
    const app = express()
    app.use(cors())
    app.use(express.json())

    app.post('*', handleRequest);
    app.get('*', handleRequest);

    app.listen(options.port)

    // This function handles incoming requests, processes them using the provider, and returns the appropriate response.
    async function handleRequest(req: express.Request, res: express.Response) {
        try {
            let { method, params } = req.body
            console.log(chalk.grey('->'), method, chalk.grey(JSON.stringify(params)))

            if (method === 'eth_getBlockByNumber' && typeof (params[0]) === 'number') {
                params[0] = `0x${Number(params[0]).toString(16)}`
            }

            let result

            // https://github.com/vechain/vechain-sdk-js/issues/1016
            if (method === 'eth_getLogs' && params[0].address === null) {
                if (options.verbose) { console.log(chalk.bgRed.grey('-> Patch #1016')) }
                delete params[0].address
            }

            // https://github.com/vechain/vechain-sdk-js/issues/1015
            if (method === 'eth_getLogs' && Array.isArray(params[0].topics[0])) {
                if (options.verbose) { console.log(chalk.bgRed.grey('-> Patch #1015')) }
                const results = await Promise.all(params[0].topics[0].map(topicHash =>
                    provider.request({
                        method,
                        params: [
                            {
                                ...params[0],
                                topics: [
                                    topicHash,
                                    ...params[0].topics.slice(1)
                                ]
                            }
                        ]
                    }) as any))
                result = results.flat()
            }
            else {
                result = await provider.request({ method, params }) as any
            }

            // https://github.com/vechain/vechain-sdk-js/issues/1014
            if (['eth_getBlockByNumber', 'eth_getBlockByHash'].includes(method) && params[1] === false) {
                if (options.verbose) { console.log(chalk.bgRed.grey('-> Patch #1014')) }
                result.transactions = result.transactions.map((tx: any) => typeof (tx) !== 'string' ? tx.hash : tx)
            }

            // Fix missing logIndex, huge performance hit but neccessary for compatibility
            if (method === 'eth_getLogs') {
                if (options.verbose) { console.log(chalk.bgRed.grey('-> Patch: logIndex and transactionIndex injection')) }
                // will use transactionReceipts instead of accessing getBlockExpanded, to rely on existing rpc convertion
                // @TODO: decide about approach based on stability (existing rpc functions) or speed  (direct node access)
                const blockTransactionMap: Record<string, string[]> = {};
                for (const log of result) {
                    const { blockHash, transactionHash } = log;
                    if (!blockTransactionMap[blockHash]) {
                        blockTransactionMap[blockHash] = [];
                    }
                    blockTransactionMap[blockHash].push(transactionHash);
                }

                const uniqueBlockHashes = Object.keys(blockTransactionMap);
                for (const blockIndex in uniqueBlockHashes) {
                    const blockHash = uniqueBlockHashes[blockIndex]
                    if (options.verbose) { console.log(chalk.bgRed.grey(`-> Patch: logIndex and transactionIndex injection (Block ${Number(blockIndex) + 1}/${uniqueBlockHashes.length})`)) }

                    const isCached = !options.disableCache && blockCache.has(blockHash)
                    const block = isCached
                        ? blockCache.get(blockHash)
                        : await thorClient.blocks.getBlockExpanded(blockHash)

                    if (!block) { throw new Error(`Unable to load block details for "${blockHash}`) }
                    if (!options.disableCache && !isCached) blockCache.set(blockHash, block)

                    for (const transactionHash of blockTransactionMap[blockHash]) {
                        const transactionIndex = `0x${Number(getTransactionIndexIntoBlock(block, transactionHash)).toString(16)}`
                        const logIndexOffset = getNumberOfLogsAheadOfTransactionIntoBlockExpanded(block, transactionHash);
                        const transaction = block.transactions.find(tx => tx.id === transactionHash)
                        if (!transaction) { throw new Error(`Unable to load transaction details for "${transactionHash}`) }

                        let logIndex = logIndexOffset
                        for (const clauseOutput of transaction.outputs) {
                            for (const event of clauseOutput.events) {
                                const index = result.findIndex((resultLog: any) =>
                                    resultLog.logIndex === '0x0' &&
                                    resultLog.transactionIndex === '0x0' &&
                                    resultLog.blockHash === blockHash &&
                                    resultLog.transactionHash === transactionHash &&
                                    resultLog.address === event.address &&
                                    JSON.stringify(resultLog.topics) === JSON.stringify(event.topics) &&
                                    resultLog.data === event.data &&
                                    !resultLog._patched
                                )
                                if (index !== -1) {
                                    result[index].logIndex = `0x${Number(logIndex).toString(16)}`
                                    result[index].transactionIndex = transactionIndex
                                    result[index]._patched = true
                                }
                                logIndex += 1
                            }
                        }
                    }
                }

                result = result
                    // remove unwanted data from result
                    .map(({ _patched, ...log }: any) => log)

                    // ensure logical sorting by txIndex + logIndex
                    .sort((a: any, b: any) => {
                        const txIndexA = parseInt(a.transactionIndex, 16);
                        const txIndexB = parseInt(b.transactionIndex, 16);
                        if (txIndexA !== txIndexB) {
                            return txIndexA - txIndexB;
                        }
                        const logIndexA = parseInt(a.logIndex, 16);
                        const logIndexB = parseInt(b.logIndex, 16);
                        return logIndexA - logIndexB;
                    });
            }

            if (options.verbose) { console.log(chalk.grey('<-'), chalk.grey(JSON.stringify(result))) }
            res.json({ jsonrpc: "2.0", id: req.body.id, result })
        }
        catch (e: any) {
            let error = e
            if ('data' in e && typeof (e.data) === 'string') {
                error = e.data
            }
            else if ('data' in e && typeof (e.data) !== 'string' && e.data !== undefined) {
                error = `the method ${req.body.method ?? 'unknown'} does not exist/is not available`
            }

            if (options.verbose) { console.log(chalk.red('<- error:'), chalk.grey(e.data)) }
            res.json({ jsonrpc: "2.0", id: req.body.id, error })
        }
    }
}

startProxy().catch(console.error)


const getTransactionIndexIntoBlock = (blockExpanded: ExpandedBlockDetail, hash: string): number => {
    const idx = blockExpanded.transactions.findIndex(
        (tx) => tx.id === hash
    )

    if (idx === -1) { throw new Error(`Could not locate transactionIndex for "${hash}"`) }
    return idx;
};

const getNumberOfLogsAheadOfTransactionIntoBlockExpanded = (
    blockExpanded: ExpandedBlockDetail,
    transactionId: string
): number => {
    // Get transaction index into the block
    const transactionIndex = getTransactionIndexIntoBlock(blockExpanded, transactionId);

    let logIndex = 0;

    // Iterate over the transactions into the block bounded by the transaction index
    for (let i = 0; i < transactionIndex; i++) {
        const currentTransaction = blockExpanded.transactions[i];

        // Iterate over the outputs of the current transaction
        for (const output of currentTransaction.outputs) {
            logIndex += output.events.length;
        }
    }

    return logIndex;
};
