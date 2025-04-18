# Nodejs DHT infohash spider
Implements [DHT protocol](http://www.bittorrent.org/beps/bep_0005.html)

## requirement
Node.js 6.0+


## install
```javascript
npm install dhtspider
```


## Useage
```javascript
'use strict'

const spider = new (require('dhtspider'))

spider.on('ensureHash', (hash, addr)=> console.log(`magnet:?xt=urn:btih:${hash}`))

spider.listen(6339)
```

## API
### Class Spider(options)
#### options
##### tableCaption
default is 600, if your server have a lot memory, increasing this value can improve crawl efficiency
##### bootstraps
entry of dht network, default is
```javascript
[{ address: 'router.bittorrent.com', port: 6881}, {address: 'dht.transmissionbt.com',port: 6881}]
```
##### concurrency
default is 10, number of nodes to process in each walk cycle. Increasing this value can improve crawl speed at the cost of more network bandwidth.
##### joinIntervalTime
default is 1000ms (1 second), how often to rejoin the DHT network. Lower values can speed up discovery.
##### walkIntervalTime
default is 1ms, how fast to walk through the DHT node table. Lower values yield faster crawling but consume more CPU.
##### debugMode
default is false, when set to true enables additional logging and statistics about InfoHash v1 and v2 detection
##### v1Only
default is true, when set to true the spider will only process InfoHash v1 (SHA-1) and ignore v2 hashes. Set to false to enable processing both v1 and v2 hashes.

### method spider.listen(port)
start spider on port 

### events
##### 'unensureHash'
Got a unensured info hash, callback has two arguments: first is hex info hash, second is the InfoHash version (1 for SHA-1, 2 for SHA-256).
##### 'nodes'
Got nodes, invoke on find_node success
##### 'ensureHash'
Got a ensured info hash, callback has two arguments: first is hex info hash, second is an object containing a tcp address {address: 'x.x.x.x', port: xxx, version: 1|2} for fetch metainfo of the resource by [Extension for Peers to Send Metadata Files](http://www.bittorrent.org/beps/bep_0009.html). The version field indicates whether it's an InfoHash v1 (SHA-1) or v2 (SHA-256).

### InfoHash v2 Support
This implementation supports both InfoHash v1 (20-byte SHA-1) and InfoHash v2 (32-byte SHA-256) as specified in [BEP 52](http://www.bittorrent.org/beps/bep_0052.html). The 'version' field in event callbacks indicates which version of InfoHash was detected.

By default, the spider only processes InfoHash v1 (SHA-1) for better performance and compatibility with existing applications. To enable both v1 and v2 support:

```javascript
const spider = new (require('dhtspider'))({v1Only: false});
```

Note: InfoHash v2 is still not widely used in the BitTorrent network. You can use the debug mode to monitor statistics on InfoHash versions:
```javascript
const spider = new (require('dhtspider'))({debugMode: true, v1Only: false});
```

### Performance Optimization
The spider now includes several performance optimizations:
1. Parallel node processing - process multiple nodes per walk cycle
2. Faster DHT network rejoining - reduced interval from 3 seconds to 1 second
3. Non-blocking UDP sends - using setImmediate to avoid blocking the event loop
4. Configurable concurrency and intervals - tune based on your hardware capabilities
5. Optimized node table - fast duplicate detection and batch processing
6. Improved message parsing - better error handling and string allocation
7. Efficient buffering - optimized buffer usage for network operations


