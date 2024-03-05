A simplified RPC proxy for accessing Vechain nodes via RPC calls. Publishing transactions is **not** supported.

```shell
yarn install
yarn start --node https://node-mainnet.vechain.energy --port 8545
```

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