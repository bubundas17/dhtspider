'use strict'

const crypto = require('crypto')

class Node {
	static generateID() {
		return crypto.createHash('sha1').update(`${(new Date).getTime()}:${Math.random()*99999}`).digest()
	}

	constructor(id) {
		this.id = id || Node.generateNodeID()
	}

	static neighbor(target, id) {
		return Buffer.concat([target.slice(0, 6), id.slice(6)])
	}

	static encodeNodes(nodes) {
		return Buffer.concat(nodes.map((node)=> Buffer.concat([node.id, Node.encodeIP(node.address), Node.encodePort(node.port)])))
	}

	static decodeNodes(data) {
		const nodes = []
		for (let i = 0; i + 26 <= data.length; i += 26) {
			nodes.push({
				id: data.slice(i, i + 20),
				address: `${data[i + 20]}.${data[i + 21]}.${data[i + 22]}.${data[i + 23]}`,
				port: data.readUInt16BE(i + 24)
			})
		}
		return nodes
	}

	static encodeIP(ip) {
		return Buffer.from(ip.split('.').map((i)=>parseInt(i)))
	}

	static encodePort(port) {
		const data = Buffer.alloc(2)
		data.writeUInt16BE(port, 0)
		return data
	}
}

class Table {
	constructor(cap) {
		this.id = Node.generateID()
		this.nodes = []
		this.caption = cap
		this.nodeMap = new Map() // For fast duplicate lookup
		this.batchSize = 8 // Default batch size for first() method
	}
	
	add(node) {
		// Fast duplicate check using the node's ID as a string key
		const nodeKey = node.id.toString('hex')
		
		// Only add if not already in the table and we have space
		if (!this.nodeMap.has(nodeKey) && this.nodes.length < this.caption) {
			this.nodes.push(node)
			this.nodeMap.set(nodeKey, true)
			return true
		}
		return false
	}
	
	shift() {
		if (this.nodes.length === 0) return null
		
		const node = this.nodes.shift()
		// Remove from the map when we take a node out
		if (node) {
			this.nodeMap.delete(node.id.toString('hex'))
		}
		return node
	}
	
	// Get multiple nodes at once for batch processing
	shiftBatch(count) {
		const batch = []
		for (let i = 0; i < count && this.nodes.length > 0; i++) {
			batch.push(this.shift())
		}
		return batch
	}
	
	first() {
		if (this.nodes.length >= this.batchSize) {
			return this.nodes.slice(0, this.batchSize)
		} else if (this.nodes.length > 0) {
			// Fill with copies of the first node to reach batch size
			return Array(this.batchSize).fill().map(() => this.nodes[0])
		}
		return []
	}
	
	// Get the current size of the table
	size() {
		return this.nodes.length
	}
	
	// Clear the table
	clear() {
		this.nodes = []
		this.nodeMap.clear()
	}
}

module.exports = {Table, Node}