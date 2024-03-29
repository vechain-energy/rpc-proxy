#! /usr/bin/env node

import { Command, Option } from "commander"
import figlet from "figlet"
import chalk from 'chalk'
import { Driver, SimpleNet } from '@vechain/connex-driver'
import { ProviderWeb3 } from './web3-providers-connex'
import { Framework } from '@vechain/connex-framework'
import express from 'express'
import cors from 'cors'
BigInt.prototype.toJSON = function () { return this.toString(); }


console.log(chalk.keyword('orange')(figlet.textSync("rpc")))
console.log("")

const program = new Command()
program
    .version("1.0.0")
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

    // vechain connex
    const net = new SimpleNet(options.node)
    const driver = await Driver.connect(net)
    const connex = new Framework(driver)

    // web3 provider relying on connex
    const provider = new ProviderWeb3({ connex, net: net })

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

            if (method === 'eth_call' && params.length === 2 && params[1].blockHash) {
                params[1] = params[1].blockHash
            }

            let result = await provider.request({ method, params })
            if (method === 'eth_chainId') {
                result = `0x${BigInt(result).toString(16).slice(-8)}`
            }

            // expand transactions if requested
            else if (['eth_getBlockByNumber', 'eth_getBlockByHash'].includes(method) && params[1] === true) {
                // temporarily remove failing formatter: <! Error: Cannot read properties of undefined (reading 'to')
                // curl -XPOST "http://localhost:8545" -H "content-type: application/json" -d '{ "jsonrpc": "2.0", "method": "eth_getBlockByHash", "params": ["0x00b3e1bd924f9d5243792b4361f1c509473bdfdd5418be8a738a31ffa3bedada",true], "id": "1" }'
                result.transactions = (await Promise.all(result.transactions.map(async (txId: string) => {
                    try {
                        return await provider.request({ method: 'eth_getTransactionByHash', params: [txId] })
                    }
                    catch {
                        return null
                    }
                })))
                    .filter((tx: any) => tx !== null)
            }

            if (options.verbose) {
                console.log(chalk.grey('<-'), chalk.grey(JSON.stringify(result)))
            }
            res.json({ jsonrpc: "2.0", id: req.body.id, result })
        }
        catch (e: any) {
            if ('data' in e) {

                if (options.verbose) {
                    console.log(chalk.grey('<-'), chalk.grey(JSON.stringify(e.data)))
                }
                res.json({ jsonrpc: "2.0", id: req.body.id, result: e.data })
            }
            else {
                console.error(chalk.red('<!'), chalk.red(e))
                res.json({ jsonrpc: "2.0", id: req.body.id, error: e })
            }
        }
    }
}

startProxy().catch(console.error)
