Release checklist

**npmjs**

```shell
npm publish
```

**docker hub**

```shell
export VERSION=$(jq -r '.version' package.json)

docker buildx build ./ --platform linux/amd64 -t ifavo/vet-rpc
docker push ifavo/vet-rpc

docker image tag ifavo/vet-rpc ifavo/vet-rpc:$VERSION
docker push ifavo/vet-rpc:$VERSION
```