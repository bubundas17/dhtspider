# DHT Spider

A high-performance BitTorrent DHT network spider for discovering and crawling infohashes.

This library implements the [DHT protocol](http://www.bittorrent.org/beps/bep_0005.html) to discover torrents in the BitTorrent network.

## Features

- High-performance DHT crawler with optimized network handling
- Support for both InfoHash v1 (SHA-1) and v2 (SHA-256)
- Configurable crawling parameters
- TypeScript support
- Modern JavaScript (ES2020)
- Dual ESM and CommonJS support

## Requirements

- Node.js 16.0+
- Bun 1.0+ (for development)

## Installation

```bash
# Using npm
npm install dhtspider

# Using Bun
bun add dhtspider
```

## Usage

### Basic Example

#### CommonJS (require)

```javascript
'use strict'

const Spider = require('dhtspider')

const spider = new Spider()

// Listen for confirmed infohashes
spider.on('ensureHash', (hash, addr) => {
  console.log(`Discovered torrent: magnet:?xt=urn:btih:${hash}`)
  console.log(`From: ${addr.address}:${addr.port} (InfoHash v${addr.version})`)
})

// Start listening on port 6339
spider.listen(6339)
```

#### ES Modules (import)

```javascript
import Spider from 'dhtspider'

const spider = new Spider()

// Listen for confirmed infohashes
spider.on('ensureHash', (hash, addr) => {
  console.log(`Discovered torrent: magnet:?xt=urn:btih:${hash}`)
  console.log(`From: ${addr.address}:${addr.port} (InfoHash v${addr.version})`)
})

// Start listening on port 6339
spider.listen(6339)
```

### Advanced Configuration

```javascript
// For CommonJS: const Spider = require('dhtspider')
// For ESM: import Spider from 'dhtspider'

const spider = new Spider({
  tableCaption: 1000,       // Size of the routing table
  concurrency: 20,          // Process 20 nodes at once
  joinIntervalTime: 1000,   // Rejoin DHT every second
  walkIntervalTime: 1,      // Walk interval in ms
  debugMode: true,          // Enable debug logging
  v1Only: false             // Process both v1 and v2 infohashes
})

// Listen for all events
spider.on('unensureHash', (hash, version) => {
  console.log(`Unconfirmed hash: ${hash} (v${version})`)
})

spider.on('nodes', (nodes) => {
  console.log(`Discovered ${nodes.length} new DHT nodes`)
})

spider.on('ensureHash', (hash, addr) => {
  console.log(`Confirmed hash: ${hash} (v${addr.version}) from ${addr.address}:${addr.port}`)
})

spider.listen(6339)
```

## API

### Class: Spider(options)

Creates a new DHT spider instance.

#### Options

- **tableCaption** (default: 600) - Routing table size
- **bootstraps** (default: common DHT bootstrap nodes) - Entry points to the DHT network
- **concurrency** (default: 10) - Number of nodes to process in each walk cycle
- **joinIntervalTime** (default: 1000) - How often to rejoin the DHT network (ms)
- **walkIntervalTime** (default: 1) - How fast to walk through the DHT node table (ms)
- **debugMode** (default: false) - Enable additional logging
- **v1Only** (default: true) - Only process InfoHash v1 (SHA-1)

### Methods

#### spider.listen(port)

Starts the spider listening on the specified port.

### Events

#### 'unensureHash'

Emitted when an unconfirmed infohash is discovered.
- **hash** - Hex string representing the infohash
- **version** - InfoHash version (1 for SHA-1, 2 for SHA-256)

#### 'nodes'

Emitted when new DHT nodes are discovered.
- **nodes** - Array of node objects

#### 'ensureHash'

Emitted when a confirmed infohash is discovered.
- **hash** - Hex string representing the infohash
- **addr** - Object containing `{address, port, version}`

## Performance Optimization

This spider includes several optimizations:
1. Parallel node processing
2. Fast DHT network rejoining
3. Non-blocking UDP operations
4. Configurable concurrency parameters
5. Optimized routing table

## License

ISC

## Author

Alan Yang 