A simple RPC proxy to access Vechain nodes via RPC calls. It does **not** support publishing transactions.

**Setup**

```shell
npm install -g @vechain.energy/vet-rpc
vet-rpc --node https://node-mainnet.vechain.energy --port 8545
```


**Run locally**

```shell
$ vet-rpc --help
                  
                    _  _____ ___  
  _ __ _ __   ___  / ||___  / _ \ 
 | '__| '_ \ / __| | |   / / | | |
 | |  | |_) | (__  | |_ / /| |_| |
 |_|  | .__/ \___| |_(_)_(_)\___/ 
      |_|                         

Usage: rpc [options]

vechain rpc proxy

Options:
  -V, --version              output the version number
  -n, --node <url>           Node URL of the blockchain (default: "https://node-mainnet.vechain.energy", env:
                             NODE_URL)
  -pn, --patched-node <url>  Patched Node URL of the blockchain (env: PATCHED_NODE_URL)
  -p, --port <port>          Port to listen on (default: "8545", env: PORT)
  -v, --verbose              Enables more detailed logging (default: false, env: VERBOSE)
  -h, --help                 display help for command

```

**Run as daemon from code**

```shell
$ NODE_URL="https://node-testnet.vechain.energy" yarn daemon:up --name rpc
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

**Run as docker**

Build yourself:

```shell
docker build . -t vet-rpc
docker run -p 8545:8545 -t vet-rpc --help
```

From docker hub:

```shell
docker run -p 8454:8545 -t ifavo/vet-rpc --help
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