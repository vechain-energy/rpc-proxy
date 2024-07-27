#! /usr/bin/env node

import { Command, Option } from "commander"
import figlet from "figlet"
import chalk from 'chalk'
import express from 'express'
import cors from 'cors'
import { ThorClient, VeChainProvider } from '@vechain/sdk-network';
import { ethGetLogs } from "./patchedNode/ethGetLogs"
import { testPatchedNode } from './patchedNode/testPatchedNode'

const version = require('../package.json').version;
BigInt.prototype.toJSON = function () { return this.toString(); }

console.log(chalk.keyword('orange')(figlet.textSync(`rpc ${version}`)))
console.log("")

const program = new Command()
program
    .version(version)
    .description("vechain rpc proxy")
    .addOption(new Option('-n, --node <url>', 'Node URL of the blockchain').env('NODE_URL').default('https://node-mainnet.vechain.energy'))
    .addOption(new Option('-pn, --patched-node <url>', 'Patched Node URL of the blockchain').env('PATCHED_NODE_URL'))
    .addOption(new Option('-p, --port <port>', 'Port to listen on').env('PORT').default('8545'))
    .addOption(new Option('-v, --verbose', 'Enables more detailed logging').env('VERBOSE').default(false))
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
    console.log("Patched Node:", chalk.grey(options.patchedNode ?? '–'))
    console.log("Port:", chalk.grey(options.port))
    console.log("")

    const isPatchedNode = options.patchedNode ? await testPatchedNode(options.patchedNode) : await testPatchedNode(options.node)
    if (isPatchedNode) {
        console.log(chalk.green("» detected patched pode, will leverage it for eth_getLogs"))
        console.log("")
    }


    // create vechain provider connected to the given node
    const thorClient = ThorClient.fromUrl(options.node)
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

            let result: any
            if (method === 'eth_getLogs' && isPatchedNode) {
                if (options.verbose) { console.log(chalk.bgRed.grey('-> Using Patched Node')) }
                result = await ethGetLogs({ method, params, nodeUrl: options.patchedNode ?? options.node }) as any
            }
            else {
                result = await provider.request({ method, params }) as any
            }

            // Fix missing logIndex, huge performance hit but neccessary for compatibility
            if (method === 'eth_getLogs' && !isPatchedNode) {
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

                    const blockReceipts = await provider.request({ method: 'eth_getBlockReceipts', params: [blockHash] }) as any
                    if (!blockReceipts) { throw new Error(`Unable to load block details for "${blockHash}`) }

                    for (const transaction of blockReceipts) {
                        for (const log of transaction.logs) {
                            const index = result.findIndex((resultLog: any) =>
                                !resultLog._patched &&
                                resultLog.logIndex === '0x0' &&
                                resultLog.transactionIndex === '0x0' &&
                                resultLog.blockNumber === log.blockNumber &&
                                resultLog.blockHash === log.blockHash &&
                                resultLog.blockHash === blockHash &&
                                resultLog.transactionHash === log.transactionHash &&
                                resultLog.address === log.address &&
                                resultLog.data === log.data &&
                                JSON.stringify(resultLog.topics) === JSON.stringify(log.topics)
                            )
                            if (index !== -1) {
                                result[index].logIndex = log.logIndex
                                result[index].transactionIndex = log.transactionIndex
                                result[index]._patched = true
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
                error = `the method ${req.body.method ?? 'unknown'} does not exist/is not available (params: ${JSON.stringify(req.body.params)})`
            }

            if (options.verbose) {
                console.error(error)
                console.log(chalk.red('<- error:'), chalk.grey(e.data))
            }
            res.json({ jsonrpc: "2.0", id: req.body.id, error })
        }
    }
}

startProxy().catch(console.error)