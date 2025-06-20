#! /usr/bin/env node

import { Command, Option } from "commander";
import figlet from "figlet";
import chalk from "chalk";
import express from "express";
import cors from "cors";
import { ThorClient, VeChainProvider } from "@vechain/sdk-network";
import { ethGetLogs } from "./customRequests/ethGetLogs";
import { isBlockHash } from "./utils";

const version = require("../package.json").version;
BigInt.prototype.toJSON = function () {
  return this.toString();
};

console.log(chalk.keyword("orange")(figlet.textSync(`rpc ${version}`)));
console.log("");

const program = new Command();
program
  .version(version)
  .description("vechain rpc proxy")
  .addOption(
    new Option("-n, --node <url>", "Node URL of the blockchain")
      .env("NODE_URL")
      .default("https://node-mainnet.vechain.energy"),
  )
  .addOption(
    new Option("-p, --port <port>", "Port to listen on")
      .env("PORT")
      .default("8545"),
  )
  .addOption(
    new Option("-v, --verbose", "Enables more detailed logging")
      .env("VERBOSE")
      .default(false),
  )
  .parse(process.argv);

const options = program.opts();

if (!options.node) {
  console.log(
    "Please provide all required options. Use --help for more information",
  );
  process.exit(1);
}

async function startProxy() {
  console.log(chalk.green("Starting Vechain RPC-Proxy"));
  console.log("");
  console.log("Node:", chalk.grey(options.node));
  console.log("Port:", chalk.grey(options.port));
  console.log("");

  // create vechain provider connected to the given node
  const thorClient = ThorClient.fromUrl(options.node);
  const provider = new VeChainProvider(thorClient);

  // setup webserver to listen for request
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post("*", handleRequest);
  app.get("*", handleRequest);

  app.listen(options.port);

  // This function handles incoming requests, processes them using the provider, and returns the appropriate response.
  async function handleRequest(req: express.Request, res: express.Response) {
    try {
      let { method, params } = req.body;
      console.log(chalk.grey("->"), method, chalk.grey(JSON.stringify(params)));

      if (method === "eth_getBlockByNumber" && typeof params[0] === "number") {
        params[0] = `0x${Number(params[0]).toString(16)}`;
      }

      if (method === "eth_call" && params[1]) {
        let blockHash: string | undefined;

        if (
          typeof params[1] === "object" &&
          params[1] !== null &&
          "blockHash" in params[1] &&
          isBlockHash(params[1].blockHash)
        ) {
          blockHash = params[1].blockHash;
        } else if (isBlockHash(params[1])) {
          blockHash = params[1];
        }

        if (blockHash) {
          if (options.verbose) {
            console.log(
              chalk.blue(
                `compat(eth_call): detected block hash, converting to block number for hash ${blockHash}`,
              ),
            );
          }
          const block = await thorClient.blocks.getBlockCompressed(blockHash);
          if (block) {
            params[1] = `0x${block.number.toString(16)}`;
          } else {
            throw new Error(`Block with hash ${blockHash} not found`);
          }
        }
      }

      if (method === "eth_getBlockReceipts") {
        throw new Error("eth_getBlockReceipts is not supported");
      }

      let result: any;
      if (method === "eth_getLogs") {
        if (options.verbose) {
          console.log(chalk.bgRed.grey("-> Using fetch request"));
        }
        result = (await ethGetLogs({
          method,
          params,
          nodeUrl: options.patchedNode ?? options.node,
        })) as any;
      } else {
        result = (await provider.request({ method, params })) as any;
      }

      if (
        (method === "eth_getBlockByHash" ||
          method === "eth_getBlockByNumber") &&
        result?.transactions
      ) {
        for (const tx of result.transactions) {
          if (tx.value === "") {
            tx.value = "0x0";
          }
          if (tx.input === "") {
            tx.input = "0x";
          }
        }
      }

      if (options.verbose) {
        console.log(chalk.grey("<-"), chalk.grey(JSON.stringify(result)));
      }
      res.json({ jsonrpc: "2.0", id: req.body.id, result });
    } catch (e: any) {

      if (e.message.includes('Method "eth_call" failed when simulating the transaction.')) {
        if (options.verbose) {
          console.log(chalk.grey("<-"), chalk.grey("eth_call failed, returning 0x"));
        }

        res.json({ jsonrpc: "2.0", id: req.body.id, result: "0x" });
        return
      }

      let error = e;
      if ("data" in e && typeof e.data === "string") {
        error = e.data;
      } else if (
        "data" in e &&
        typeof e.data !== "string" &&
        e.data !== undefined
      ) {
        error = `the method ${req.body.method ?? "unknown"} does not exist/is not available (params: ${JSON.stringify(req.body.params)}) (${String(e.message)})`;
      }
      else {
        error = String(e.message)
      }

      if (options.verbose) {
        console.error(error);
        console.log(chalk.red("<- error:"), chalk.grey(e.data));
      }
      res.json({ jsonrpc: "2.0", id: req.body.id, error });
    }
  }
}

startProxy().catch(console.error);
