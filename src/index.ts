import Spider from './spider';

// Configuration (optional)
const options = {
    udpPort: 6881,       // Port for the DHT spider to listen on
    debugMode: false,     // Enable verbose logging
    concurrency: 50,     // Number of concurrent node lookups
    v1Only: false,       // Set to true to only track v1 infohashes
    disableEnsureHash: false // Set to true to disable 'ensureHash' events (only get 'unensureHash')
};

// Create a new spider instance
const spider = new Spider(options);

// Listen for 'ensureHash' events (when a peer announces)
spider.on('ensureHash', (infoHash, payload) => {
    console.log(`[+] Announce Peer: ${infoHash} (v${payload.version}) from ${payload.address}:${payload.port}`);
    // Here you would typically store or process the infohash
});

// Listen for 'unensureHash' events (when a peer requests an infohash)
spider.on('unensureHash', (infoHash, version) => {
    console.log(`[?] Get Peers: ${infoHash} (v${version})`);
    // Useful for tracking interest in specific infohashes
});

// Listen for 'nodes' events (useful for debugging/visualizing the DHT)
spider.on('nodes', (nodes) => {
    if (options.debugMode) {
       // console.log(`[Nodes Event] Received ${nodes.length} nodes.`);
    }
});

// Start the spider
console.log("Starting DHT Spider...");
spider.listen();

// Graceful shutdown handling
const shutdown = () => {
    console.log("\nShutting down DHT Spider...");
    spider.stop();
    process.exit(0);
};

process.on('SIGINT', shutdown);  // Catch Ctrl+C
process.on('SIGTERM', shutdown); // Catch kill signals 