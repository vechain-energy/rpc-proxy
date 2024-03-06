A simplified RPC proxy for accessing Vechain nodes via RPC calls. Publishing transactions is **not** supported.

**Setup**

```shell
yarn install
yarn start --node https://node-mainnet.vechain.energy --port 8545
```


**Run locally**

```shell
$ yarn start --help
                  
  _ __ _ __   ___ 
 | '__| '_ \ / __|
 | |  | |_) | (__ 
 |_|  | .__/ \___|
      |_|         
Usage: rpc [options]

vechain rpc proxy

Options:
  -V, --version      output the version number
  -n, --node <url>   Node URL of the blockchain (default: "https://node-mainnet.vechain.energy")
  -p, --port <port>  Port to listen on (default: "8545")
  -h, --help         display help for command

```

**Run as daemon**

```shell
$ yarn daemon:up --name rpc -- --node https://node-mainnet.vechain.energy
[PM2] Applying action restartProcessId on app [rpc](ids: [ 0 ])
[PM2] [rpc](0) ✓
[PM2] Process successfully started
┌────┬────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name               │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ rpc                │ fork     │ 1    │ online    │ 0%       │ 1.8mb    │
└────┴────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘

$ yarn daemon:down                                                       
[PM2] Applying action stopProcessId on app [dist/rpc.js](ids: [ 0 ])
[PM2] [rpc](0) ✓
┌────┬────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name               │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ rpc                │ fork     │ 1    │ stopped   │ 0%       │ 0b       │
└────┴────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

## Test

```shell
$ curl -XPOST "http://localhost:8545" -H "content-type: application/json" -d '
{
    "jsonrpc": "2.0",
    "method": "eth_blockNumber",
    "params": [],
    "id": "1"
}
'
{"jsonrpc":2,"result":"0x11148af","id":"1"}

$ curl -XPOST "http://localhost:8545" -H "content-type: application/json" -d '
{
    "jsonrpc": "2.0",
    "method": "eth_chainId",
    "params": [],
    "id": "1"
}
'
{"jsonrpc":2,"result":"14018334920824264832118464179726739019961432051877733167310318607178","id":"1"}
```