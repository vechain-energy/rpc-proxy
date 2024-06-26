#! /usr/bin/env node

import { Command, Option } from "commander"
import figlet from "figlet"
import chalk from 'chalk'
import express from 'express'
import cors from 'cors'
import { ThorClient, VeChainProvider } from '@vechain/sdk-network';
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
    .addOption(new Option('-v, --verbose', 'Enables more detailed logging'))
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
    console.log("")

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

            let result
            // https://github.com/vechain/vechain-sdk-js/issues/1015
            if (method === 'eth_getLogs' && Array.isArray(params[0].topics[0])) {
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
                result = results.flat();
            }
            else {
                result = await provider.request({ method, params }) as any
            }

            // https://github.com/vechain/vechain-sdk-js/issues/1014
            if (['eth_getBlockByNumber', 'eth_getBlockByHash'].includes(method) && params[1] === false) {
                result.transactions = result.transactions.map((tx: any) => typeof (tx) !== 'string' ? tx.hash : tx)
            }

            if (options.verbose) {
                console.log(chalk.grey('<-'), chalk.grey(JSON.stringify(result)))
            }

            res.json({ jsonrpc: "2.0", id: req.body.id, result })
        }
        catch (e: any) {
            if ('data' in e && typeof (e.data) === 'string') {

                if (options.verbose) {
                    console.log(chalk.grey('<-'), chalk.grey(e.data))
                }
                res.json({ jsonrpc: "2.0", id: req.body.id, result: e.data })
            }
            else if ('data' in e && typeof (e.data) !== 'string' && e.data !== undefined) {
                let { method } = req.body
                const result = `the method ${method} does not exist/is not available`
                if (options.verbose) {
                    console.log(chalk.grey('<-'), chalk.grey(result))
                }
                res.json({ jsonrpc: "2.0", id: req.body.id, result })
            }
            else {
                console.error(chalk.red('<!'), chalk.red(e))
                res.json({ jsonrpc: "2.0", id: req.body.id, error: e })
            }
        }
    }
}

startProxy().catch(console.error)
