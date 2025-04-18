'use strict'

const Spider = require('../lib/spider')

// Create a spider with debugging enabled and support for v2 hashes
const spider = new Spider({
    debugMode: true,
    v1Only: false,           // Enable InfoHash v2 support
    tableCaption: 100,       // Use a smaller table for testing
    concurrency: 5,          // Reduced concurrency for testing
    joinIntervalTime: 5000,  // Longer join interval for testing
})

// Handle both v1 and v2 infohashes
spider.on('ensureHash', (hash, addr) => {
    const version = addr.version || 1
    
    if (version === 2) {
        console.log(`InfoHash v2 (SHA-256): magnet:?xt=urn:btih:${hash}`)
    } else {
        console.log(`InfoHash v1 (SHA-1): magnet:?xt=urn:btih:${hash}`)
    }
})

// Start the spider
console.log("Starting DHT spider with InfoHash v2 detection enabled...")
console.log("Will display statistics every 30 seconds")
spider.listen(6339)

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log("Stopping DHT spider...")
    spider.stop()
    process.exit(0)
}) 