#! /usr/bin/env node

import { Command, Option } from "commander"
import figlet from "figlet"
import chalk from 'chalk'
import express from 'express'
import cors from 'cors'
import { type ExpandedBlockDetail, ThorClient, VeChainProvider, HttpClient } from '@vechain/sdk-network';
import Axios from 'axios'
import { setupCache, buildMemoryStorage, buildKeyGenerator } from 'axios-cache-interceptor';
import hash from "object-hash";
const MAX_PARALLEL_INJECTION_REQUESTS = 10

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


    const axiosInstance = options.disableCache
        ? Axios.create({
            baseURL: options.node,
        })
        : setupCache(
            Axios.create({
                baseURL: options.node,
            }),
            {
                // debug: ({ id, msg }) => console.log(id, msg),
                methods: ['get', 'post', 'options'],
                storage: buildMemoryStorage(false, 10000, options.cacheItems),
                ttl: 86400 * 1000,
                generateKey: buildKeyGenerator(({ id, baseURL, url, method, params, data }) => {
                    if (id) { return id }
                    return hash({
                        url: baseURL + (baseURL && url ? '/' : '') + url,
                        params: params,
                        method: method,
                        data: data
                    })
                }),
                cachePredicate: {
                    responseMatch(res) {
                        // console.log(res.id, res.request?.method, res.request?.path)
                        try {
                            // do not cache log requests that extend to latest blocks
                            if (res.request.path.includes('/logs/')) {
                                const requestBody = JSON.parse(String(res.config.data))
                                if (requestBody?.range?.unit === 'time' || !requestBody?.range?.to) {
                                    throw new Error('logs with latest block should not be cached')
                                }
                            }

                            return true
                        }
                        catch {
                            return false
                        }
                    },
                    ignoreUrls: [
                        /\/best/,                       // latest block, will update every new block
                        /\/accounts(?!.*revision)/,     // accounts show latest block data, except when revision is given
                        /\?pending/,                    // pending data can always be replaced
                    ]
                }
            });

    const httpClient = new HttpClient(options.node, { axiosInstance })
    const thorClient = new ThorClient(httpClient)
    const provider = new VeChainProvider(thorClient);

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

            let result: any | any[] = []

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
                let activePromises: Promise<void>[] = [];
                for (let i = 0; i < uniqueBlockHashes.length; i++) {
                    const blockHash = uniqueBlockHashes[i];
                    const promise = (async (blockHash, blockIndex) => {
                        if (options.verbose) { console.log(chalk.bgRed.grey(`-> Patch: logIndex and transactionIndex injection (Block ${Number(blockIndex + 1)}/${uniqueBlockHashes.length})`)) }

                        const block = await thorClient.blocks.getBlockExpanded(blockHash)
                        if (!block) { throw new Error(`Unable to load block details for "${blockHash}`) }

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
                    })(blockHash, i);

                    activePromises.push(promise);

                    if (activePromises.length >= MAX_PARALLEL_INJECTION_REQUESTS) {
                        await Promise.race(activePromises);
                        activePromises = activePromises.filter(p => p !== promise);
                    }
                }

                await Promise.all(activePromises);

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
