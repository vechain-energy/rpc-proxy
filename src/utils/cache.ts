import type { OptionValues } from "commander"
import Axios, { type AxiosInstance } from 'axios'
import { setupCache, buildMemoryStorage, buildKeyGenerator, buildStorage, canStale, type StorageValue, type AxiosStorage, } from 'axios-cache-interceptor/dev';
import hash from "object-hash";
import Redis from 'ioredis';


export async function fetchCacheStorage(options: OptionValues): Promise<AxiosStorage> {

    if (options.cacheStorage.startsWith('redis')) {
        const client = new Redis(options.cacheStorage);
        return buildStorage({
            async find(key) {
                const value = await client.get(`axios-cache-${key}`)
                if (!value) { return undefined }
                return JSON.parse(value) as StorageValue
            },

            async set(key, value, req) {
                await client.set(`axios-cache-${key}`, JSON.stringify(value), "EX",
                    // We don't want to keep indefinitely values in the storage if
                    // their request don't finish somehow. Either set its value as
                    // the TTL or 1 minute.
                    value.state === 'loading'
                        ?
                        req?.cache && typeof req.cache.ttl === 'number'
                            ? req.cache.ttl
                            : 60000
                        : // When a stale state has a determined value to expire, we can use it.
                        //   Or if the cached value cannot enter in stale state.
                        (value.state === 'stale' && value.ttl) ||
                            (value.state === 'cached' && !canStale(value))
                            ? value.ttl!
                            : 0
                );
            },

            async remove(key) {
                await client.del(`axios-cache-${key}`);
            }
        });
    }

    return buildMemoryStorage(false, 10000, options.cacheLimit)
}

export async function fetchAxiosInstance(options: OptionValues): Promise<AxiosInstance> {
    if (options.disableCache) {
        return Axios.create({
            baseURL: options.node,
        })
    }

    return setupCache(
        Axios.create({ baseURL: options.node }),
        {
            debug: options.verbose ? ({ id, msg }) => console.log(id, msg) : undefined,
            methods: ['get', 'post', 'options'],
            storage: await fetchCacheStorage(options),
            ttl: Number(options.cacheLimit) * 1000,
            generateKey: buildKeyGenerator(({ id, baseURL, url, method, params, data }) => {
                if (id) { return id }
                return hash({
                    url: baseURL + (baseURL && url ? '/' : '') + url,
                    params: params,
                    method: method,
                    data: data
                })
            }),
            cachePredicate: {
                responseMatch(res) {
                    if (options.verbose) {
                        console.log(res.id, res.request?.method, res.request?.path)
                    }
                    try {
                        // do not cache log requests that extend to latest blocks
                        if (res.request.path.includes('/logs/')) {
                            const requestBody = JSON.parse(String(res.config.data))
                            if (requestBody?.range?.unit === 'time' || !requestBody?.range?.to) {
                                throw new Error('logs with latest block should not be cached')
                            }
                        }

                        return true
                    }
                    catch {
                        return false
                    }
                },
                ignoreUrls: [
                    /\/best/,                       // latest block, will update every new block
                    /\/accounts(?!.*revision)/,     // accounts show latest block data, except when revision is given
                    /\?pending/,                    // pending data can always be replaced
                ]
            }
        });
}