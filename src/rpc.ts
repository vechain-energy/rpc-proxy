#! /usr/bin/env node

import { Command, Option } from "commander"
import figlet from "figlet"
import chalk from 'chalk'
import express from 'express'
import cors from 'cors'
import { HttpClient, ThorClient } from '@vechain/sdk-network';
import { VechainProvider } from '@vechain/sdk-provider';
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

    const thorClient = new ThorClient(new HttpClient(options.node))
    const provider = new VechainProvider(thorClient);

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

            if (method === 'eth_estimateGas' && params.length === 1) {
                params[1] = 'latest'
            }

            let result = await provider.request({ method, params }) as any

            if (options.verbose) {
                console.log(chalk.grey('<-'), chalk.grey(JSON.stringify(result)))
            }
            res.json({ jsonrpc: "2.0", id: req.body.id, result })
        }
        catch (e: any) {
            if ('data' in e && e.data !== undefined) {

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
