import { Command } from "commander"
import figlet from "figlet"
import chalk from 'chalk'
import { Driver, SimpleNet } from '@vechain/connex-driver'
import { ProviderWeb3 } from '@vechain/web3-providers-connex'
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
    .option("-n, --node <url>", "Node URL of the blockchain", "https://node-mainnet.vechain.energy")
    .option("-p, --port <port>", "Port to listen on", "8545")
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
            console.log(chalk.grey('->'), req.body.method, chalk.grey(JSON.stringify(req.body.params)))
            const result = await provider.request(req.body)
            console.log(chalk.grey('<-'), chalk.grey(result))

            res.json({ jsonrpc: 2.0, result, id: req.body.id })
        }
        catch (e) {
            console.error(chalk.red('<!'), chalk.red(e))
            res.json({ jsonrpc: 2.0, error: e, id: req.body.id })
        }
    }
}

startProxy().catch(console.error)
