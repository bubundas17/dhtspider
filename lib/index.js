var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/bencode/lib/encode.js
var require_encode = __commonJS((exports, module) => {
  function encode(data, buffer, offset) {
    var buffers = [];
    var result = null;
    encode._encode(buffers, data);
    result = Buffer.concat(buffers);
    encode.bytes = result.length;
    if (Buffer.isBuffer(buffer)) {
      result.copy(buffer, offset);
      return buffer;
    }
    return result;
  }
  encode.bytes = -1;
  encode._floatConversionDetected = false;
  encode._encode = function(buffers, data) {
    if (Buffer.isBuffer(data)) {
      buffers.push(new Buffer(data.length + ":"));
      buffers.push(data);
      return;
    }
    switch (typeof data) {
      case "string":
        encode.buffer(buffers, data);
        break;
      case "number":
        encode.number(buffers, data);
        break;
      case "object":
        data.constructor === Array ? encode.list(buffers, data) : encode.dict(buffers, data);
        break;
      case "boolean":
        encode.number(buffers, data ? 1 : 0);
        break;
    }
  };
  var buff_e = new Buffer("e");
  var buff_d = new Buffer("d");
  var buff_l = new Buffer("l");
  encode.buffer = function(buffers, data) {
    buffers.push(new Buffer(Buffer.byteLength(data) + ":" + data));
  };
  encode.number = function(buffers, data) {
    var maxLo = 2147483648;
    var hi = data / maxLo << 0;
    var lo = data % maxLo << 0;
    var val = hi * maxLo + lo;
    buffers.push(new Buffer("i" + val + "e"));
    if (val !== data && !encode._floatConversionDetected) {
      encode._floatConversionDetected = true;
      console.warn('WARNING: Possible data corruption detected with value "' + data + '":', 'Bencoding only defines support for integers, value was converted to "' + val + '"');
      console.trace();
    }
  };
  encode.dict = function(buffers, data) {
    buffers.push(buff_d);
    var j = 0;
    var k;
    var keys = Object.keys(data).sort();
    var kl = keys.length;
    for (;j < kl; j++) {
      k = keys[j];
      encode.buffer(buffers, k);
      encode._encode(buffers, data[k]);
    }
    buffers.push(buff_e);
  };
  encode.list = function(buffers, data) {
    var i = 0, j = 1;
    var c = data.length;
    buffers.push(buff_l);
    for (;i < c; i++) {
      encode._encode(buffers, data[i]);
    }
    buffers.push(buff_e);
  };
  module.exports = encode;
});

// node_modules/bencode/lib/dict.js
var require_dict = __commonJS((exports, module) => {
  var Dict = module.exports = function Dict() {
    Object.defineProperty(this, "_keys", {
      enumerable: false,
      value: []
    });
  };
  Dict.prototype.binaryKeys = function binaryKeys() {
    return this._keys.slice();
  };
  Dict.prototype.binarySet = function binarySet(key, value) {
    this._keys.push(key);
    this[key] = value;
  };
});

// node_modules/bencode/lib/decode.js
var require_decode = __commonJS((exports, module) => {
  var Dict = require_dict();
  function decode(data, start, end, encoding) {
    if (typeof start !== "number" && encoding == null) {
      encoding = start;
      start = undefined;
    }
    if (typeof end !== "number" && encoding == null) {
      encoding = end;
      end = undefined;
    }
    decode.position = 0;
    decode.encoding = encoding || null;
    decode.data = !Buffer.isBuffer(data) ? new Buffer(data) : data.slice(start, end);
    decode.bytes = decode.data.length;
    return decode.next();
  }
  decode.bytes = 0;
  decode.position = 0;
  decode.data = null;
  decode.encoding = null;
  decode.next = function() {
    switch (decode.data[decode.position]) {
      case 100:
        return decode.dictionary();
        break;
      case 108:
        return decode.list();
        break;
      case 105:
        return decode.integer();
        break;
      default:
        return decode.buffer();
        break;
    }
  };
  decode.find = function(chr) {
    var i = decode.position;
    var c = decode.data.length;
    var d = decode.data;
    while (i < c) {
      if (d[i] === chr)
        return i;
      i++;
    }
    throw new Error('Invalid data: Missing delimiter "' + String.fromCharCode(chr) + '" [0x' + chr.toString(16) + "]");
  };
  decode.dictionary = function() {
    decode.position++;
    var dict = new Dict;
    while (decode.data[decode.position] !== 101) {
      dict.binarySet(decode.buffer(), decode.next());
    }
    decode.position++;
    return dict;
  };
  decode.list = function() {
    decode.position++;
    var lst = [];
    while (decode.data[decode.position] !== 101) {
      lst.push(decode.next());
    }
    decode.position++;
    return lst;
  };
  decode.integer = function() {
    var end = decode.find(101);
    var number = decode.data.toString("ascii", decode.position + 1, end);
    decode.position += end + 1 - decode.position;
    return parseInt(number, 10);
  };
  decode.buffer = function() {
    var sep = decode.find(58);
    var length = parseInt(decode.data.toString("ascii", decode.position, sep), 10);
    var end = ++sep + length;
    decode.position = end;
    return decode.encoding ? decode.data.toString(decode.encoding, sep, end) : decode.data.slice(sep, end);
  };
  module.exports = decode;
});

// node_modules/bencode/bencode.js
var require_bencode = __commonJS((exports, module) => {
  var bencode = exports;
  bencode.encode = require_encode();
  bencode.decode = require_decode();
  bencode.byteLength = bencode.encodingLength = function(value) {
    return bencode.encode(value).length;
  };
});

// src/spider.ts
var bencode = __toESM(require_bencode(), 1);
import dgram from "dgram";
import { EventEmitter } from "events";

// src/table.ts
import crypto from "crypto";
class Node {
  id;
  address;
  port;
  static debugMode = false;
  static setDebugMode(debug) {
    Node.debugMode = debug;
  }
  constructor(data) {
    this.id = data?.id || Node.generateID();
    this.address = data?.address || "";
    this.port = data?.port || 0;
  }
  static generateID() {
    const randomData = `${Date.now()}:${Math.random()}`;
    return crypto.createHash("sha1").update(randomData).digest();
  }
  static neighbor(target, id) {
    if (!Buffer.isBuffer(target) || target.length < 6 || !Buffer.isBuffer(id) || id.length < 6) {
      console.warn("[Node.neighbor] Invalid input buffers.");
      return id;
    }
    return Buffer.concat([target.subarray(0, 6), id.subarray(6)]);
  }
  static encodeNodes(nodes) {
    return Buffer.concat(nodes.map((node) => Buffer.concat([
      node.id,
      Node.encodeIP(node.address),
      Node.encodePort(node.port)
    ])));
  }
  static decodeNodes(data) {
    const nodes = [];
    if (!Buffer.isBuffer(data)) {
      if (Node.debugMode)
        console.error("[Node.decodeNodes] Data is not a Buffer");
      return nodes;
    }
    if (Node.debugMode) {
      console.log(`[DecodeNodes] Decoding ${data.length} bytes of node data`);
      console.log(`[DecodeNodes] First bytes: ${data.slice(0, Math.min(40, data.length)).toString("hex")}`);
    }
    if (data.length === 0) {
      if (Node.debugMode)
        console.warn("[Node.decodeNodes] Empty node data");
      return nodes;
    }
    if (data.length % 26 !== 0) {
      if (Node.debugMode)
        console.error(`[Node.decodeNodes] Invalid data length: ${data.length} bytes (not a multiple of 26)`);
      const completeNodeCount = Math.floor(data.length / 26);
      if (completeNodeCount === 0) {
        return nodes;
      }
      if (Node.debugMode)
        console.log(`[DecodeNodes] Trying to extract ${completeNodeCount} complete nodes from invalid data`);
      data = data.slice(0, completeNodeCount * 26);
    }
    try {
      for (let i = 0;i + 26 <= data.length; i += 26) {
        try {
          const id = data.subarray(i, i + 20);
          const ipBytes = data.subarray(i + 20, i + 24);
          const ip = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;
          const port = data.readUInt16BE(i + 24);
          nodes.push({ id, address: ip, port });
        } catch (e) {
          if (Node.debugMode)
            console.error(`[Node.decodeNodes] Error decoding node at index ${i}:`, e);
        }
      }
    } catch (err) {
      if (Node.debugMode)
        console.error("[Node.decodeNodes] Fatal error decoding nodes:", err);
    }
    if (Node.debugMode)
      console.log(`[DecodeNodes] Successfully decoded ${nodes.length} nodes`);
    if (Node.debugMode && nodes.length > 0) {
      const sample = nodes.slice(0, Math.min(3, nodes.length));
      sample.forEach((node, idx) => {
        console.log(`[DecodeNodes] Node ${idx}: ${node.address}:${node.port}`);
      });
    }
    return nodes;
  }
  static encodeIP(ip) {
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      console.warn(`[Node.encodeIP] Invalid IP format: ${ip}. Returning zero buffer.`);
      return Buffer.alloc(4);
    }
    return Buffer.from(ip.split(".").map((i) => parseInt(i, 10)));
  }
  static encodePort(port) {
    const data = Buffer.alloc(2);
    if (port > 0 && port < 65536) {
      data.writeUInt16BE(port, 0);
    } else {
      console.warn(`[Node.encodePort] Invalid port number: ${port}. Using 0.`);
    }
    return data;
  }
}

class Table {
  id;
  nodes;
  capacity;
  nodeMap;
  batchSize = 8;
  debugMode = false;
  constructor(capacity = 600, debugMode = false) {
    this.id = Node.generateID();
    this.nodes = [];
    this.capacity = capacity;
    this.nodeMap = new Map;
    this.debugMode = debugMode;
    Node.setDebugMode(debugMode);
  }
  add(node) {
    if (!node) {
      if (this.debugMode)
        console.warn("[Table.add] Attempted to add null/undefined node");
      return false;
    }
    if (node.id.equals(this.id)) {
      if (this.debugMode)
        console.log("[Table.add] Skipping node with same ID as ours");
      return false;
    }
    const nodeKey = node.id.toString("hex");
    if (this.nodeMap.has(nodeKey)) {
      return false;
    }
    if (this.nodes.length >= this.capacity) {
      if (this.debugMode)
        console.log(`[Table.add] Table is full (${this.capacity} nodes)`);
      return false;
    }
    this.nodes.push(node);
    this.nodeMap.set(nodeKey, true);
    if (this.debugMode)
      console.log(`[Table.add] Added node ${node.address}:${node.port} - Table size: ${this.nodes.length}`);
    return true;
  }
  shift() {
    const node = this.nodes.shift();
    if (node) {
      this.nodeMap.delete(node.id.toString("hex"));
      return node;
    }
    return null;
  }
  shiftBatch(count) {
    const batch = [];
    const numToShift = Math.min(count, this.nodes.length);
    for (let i = 0;i < numToShift; i++) {
      batch.push(this.shift());
    }
    return batch.filter((n) => n !== null);
  }
  first() {
    const count = Math.min(this.nodes.length, this.batchSize);
    if (count === 0)
      return [];
    if (this.nodes.length >= this.batchSize) {
      return this.nodes.slice(0, this.batchSize);
    } else {
      const firstNode = this.nodes[0];
      return Array(this.batchSize).fill(firstNode);
    }
  }
  size() {
    return this.nodes.length;
  }
  clear() {
    this.nodes = [];
    this.nodeMap.clear();
  }
}

// src/token.ts
class Token {
  token;
  intervalId = null;
  constructor() {
    this.token = this.generate();
    this.intervalId = setInterval(() => {
      this.token = this.generate();
    }, 60000 * 15);
  }
  isValid(t) {
    if (!Buffer.isBuffer(t) || !Buffer.isBuffer(this.token)) {
      return false;
    }
    return t.equals(this.token);
  }
  generate() {
    return Buffer.from([Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)]);
  }
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// src/spider.ts
import crypto2 from "crypto";
function isValidPort(port) {
  return Number.isInteger(port) && port > 0 && port < 65536;
}
function isInfoHashV2(infohash) {
  return Buffer.isBuffer(infohash) && infohash.length === 32;
}
function isValidInfoHash(infohash, v1Only = false) {
  if (!Buffer.isBuffer(infohash))
    return false;
  if (infohash.length === 20)
    return true;
  if (infohash.length === 32 && !v1Only)
    return true;
  return false;
}
function generateTid() {
  return Math.random().toString(36).substring(2, 6);
}
var defaultBootstraps = [
  { address: "87.98.162.88", port: 6881 },
  { address: "67.215.246.10", port: 6881 },
  { address: "185.157.221.247", port: 25401 },
  { address: "router.utorrent.com", port: 6881 },
  { address: "router.bittorrent.com", port: 6881 },
  { address: "dht.transmissionbt.com", port: 6881 },
  { address: "dht.aelitis.com", port: 6881 },
  { address: "dht.libtorrent.org", port: 25401 },
  { address: "router.breittorrent.com", port: 6881 },
  { address: "router.experimentalbit.com", port: 6881 },
  { address: "router.utorrent.com", port: 6881 },
  { address: "dht.vuze.com", port: 6881 }
];

class Spider extends EventEmitter {
  udp = null;
  table;
  bootstraps;
  udpPort;
  token;
  walkInterval = null;
  joinInterval = null;
  statsInterval = null;
  concurrency;
  joinIntervalTime;
  walkIntervalTime;
  debugMode;
  v1Count = 0;
  v2Count = 0;
  v1Only;
  disableEnsureHash;
  constructor(options = {}) {
    super();
    this.debugMode = options.debugMode || false;
    this.table = new Table(options.tableCapacity || 1e4, this.debugMode);
    this.bootstraps = options.bootstraps || defaultBootstraps;
    this.udpPort = options.udpPort || 6339;
    this.token = new Token;
    this.concurrency = options.concurrency || 10;
    this.joinIntervalTime = options.joinIntervalTime || 1000;
    this.walkIntervalTime = options.walkIntervalTime || 100;
    this.v1Only = options.v1Only !== undefined ? options.v1Only : false;
    this.disableEnsureHash = options.disableEnsureHash || false;
    if (this.debugMode && !this.v1Only) {
      console.log(`[Spider] BEP-52 (v2 infohash) support enabled`);
    }
  }
  on(event, listener) {
    return super.on(event, listener);
  }
  emit(event, ...args) {
    return super.emit(event, ...args);
  }
  send(message, address) {
    if (!address || typeof address !== "object" || !isValidPort(address.port) || !address.address) {
      if (this.debugMode)
        console.warn(`[Send] Invalid address object:`, address);
      return;
    }
    try {
      const data = bencode.encode(message);
      if (this.debugMode)
        console.log(data);
      setImmediate(() => {
        if (this.udp) {
          this.udp.send(data, 0, data.length, address.port, address.address, (err) => {
            if (err && this.debugMode) {
              console.error(`[Send] UDP send error to ${address.address}:${address.port}:`, err);
              if (err.code === "DNS_ENOTFOUND" && "dnsFailures" in address) {
                const node = address;
                node.dnsFailures = (node.dnsFailures || 0) + 1;
                if (node.dnsFailures >= 3) {
                  this.bootstraps = this.bootstraps.filter((n) => n.address !== node.address || n.port !== node.port);
                  if (this.debugMode) {
                    console.log(`[Blacklist] Removed unreachable node: ${node.address}:${node.port}`);
                  }
                }
              }
            }
          });
        }
      });
    } catch (err) {
      if (this.debugMode) {
        console.error(`[Send] Bencode encoding error:`, err, message);
      }
    }
  }
  findNode(id, address) {
    if (!address || !isValidPort(address.port)) {
      if (this.debugMode)
        console.warn(`[FindNode] Invalid address for findNode:`, address);
      return;
    }
    if (!Buffer.isBuffer(id) || id.length !== 20) {
      if (this.debugMode)
        console.warn(`[FindNode] Invalid ID for findNode: ${id ? "length=" + id.length : "undefined"}`);
      return;
    }
    const isBootstrap = this.bootstraps.some((node) => node.address === address.address && node.port === address.port);
    const target = Node.generateID();
    const message = {
      t: generateTid(),
      y: "q",
      q: "find_node",
      a: {
        id,
        target,
        v2: 1
      }
    };
    if (isBootstrap && this.debugMode) {
      console.log(`[FindNode] Sending to bootstrap ${address.address}:${address.port} with ID=${id.toString("hex").substring(0, 8)}... target=${target.toString("hex").substring(0, 8)}...`);
    }
    this.send(message, address);
  }
  join() {
    if (this.debugMode)
      console.log(`[Join] Sending find_node to ${this.bootstraps.length} bootstrap nodes`);
    const randomTarget = Node.generateID();
    if (this.debugMode)
      console.log(`[Join] Using target ID: ${randomTarget.toString("hex").substring(0, 8)}...`);
    this.bootstraps.forEach((b, index) => {
      if (this.debugMode)
        console.log(`[Join] Sending find_node to bootstrap[${index}]: ${b.address}:${b.port}`);
      const message = {
        t: generateTid(),
        y: "q",
        q: "find_node",
        a: {
          id: this.table.id,
          target: randomTarget,
          v2: 1
        }
      };
      if (this.debugMode)
        console.log(`[Join] Message to ${b.address}:${b.port}: ${JSON.stringify(message, (key, value) => {
          if (Buffer.isBuffer(value)) {
            return `Buffer(${value.length}): ${value.toString("hex").substring(0, 8)}...`;
          }
          return value;
        })}`);
      this.findNode(this.table.id, b);
    });
  }
  walk() {
    if (this.walkInterval) {
      clearTimeout(this.walkInterval);
      this.walkInterval = null;
    }
    if (this.debugMode) {
      console.log(`[Walk] Table size: ${this.table.size()}`);
    }
    if (this.table.size() === 0) {
      this.join();
      this.walkInterval = setTimeout(() => this.walk(), 5000);
      return;
    }
    const nodes = this.table.shiftBatch(this.concurrency);
    if (this.debugMode && nodes.length > 0) {
      console.log(`[Walk] Processing ${nodes.length} nodes from table`);
    }
    if (this.table.size() > 10 && nodes.length > 0 && Math.random() < 0.3) {
      const validNodes = nodes.filter((node) => node && node.address && isValidPort(node.port));
      const nodesToQuery = Math.min(3, validNodes.length);
      for (let i = 0;i < nodesToQuery; i++) {
        const node = validNodes[i];
        if (node) {
          const isV2Query = !this.v1Only && Math.random() < 0.75;
          const randomInfoHash = isV2Query ? crypto2.randomBytes(32) : crypto2.randomBytes(20);
          this.sendGetPeers(node, randomInfoHash);
          if (this.debugMode) {
            console.log(`[GetPeers] Sent random ${isV2Query ? "v2" : "v1"} infohash query to ${node.address}:${node.port}`);
          }
        }
      }
    }
    for (const node of nodes) {
      if (node && node.id && node.address && isValidPort(node.port)) {
        this.findNode(Node.neighbor(node.id, this.table.id), {
          address: node.address,
          port: node.port
        });
        if (!this.v1Only && Math.random() < 0.05) {
          const v2InfoHash = crypto2.randomBytes(32);
          this.sendGetPeers(node, v2InfoHash);
          if (this.debugMode) {
            console.log(`[GetPeers] Additional v2 query to ${node.address}:${node.port}`);
          }
        }
      }
    }
    this.walkInterval = setTimeout(() => this.walk(), this.walkIntervalTime);
  }
  sendGetPeers(node, infoHash) {
    if (!node || !isValidPort(node.port)) {
      return;
    }
    const message = {
      t: generateTid(),
      y: "q",
      q: "get_peers",
      a: {
        id: this.table.id,
        info_hash: infoHash,
        v2: 1
      }
    };
    this.send(message, { address: node.address, port: node.port });
  }
  onFoundNodes(nodesData) {
    if (!Buffer.isBuffer(nodesData)) {
      if (this.debugMode)
        console.error("[OnFoundNodes] Got invalid nodes data (not a buffer)");
      return;
    }
    if (nodesData.length % 26 !== 0) {
      if (this.debugMode) {
        console.error(`[OnFoundNodes] Invalid nodes data length: ${nodesData.length} bytes (not a multiple of 26)`);
        console.error(`[OnFoundNodes] First 40 bytes: ${nodesData.slice(0, 40).toString("hex")}`);
      }
      return;
    }
    const nodeCount = nodesData.length / 26;
    if (this.debugMode)
      console.log(`[OnFoundNodes] Processing ${nodeCount} nodes from ${nodesData.length} bytes`);
    if (nodeCount > 0 && this.debugMode) {
      try {
        const firstNodeData = nodesData.slice(0, 26);
        const nodeId = firstNodeData.slice(0, 20);
        const ip = `${firstNodeData[20]}.${firstNodeData[21]}.${firstNodeData[22]}.${firstNodeData[23]}`;
        const port = firstNodeData.readUInt16BE(24);
        console.log(`[Manual Decode] First node: ID=${nodeId.toString("hex").substring(0, 8)}... IP=${ip} Port=${port}`);
      } catch (err) {
        console.error("[Manual Decode] Failed:", err);
      }
    }
    const decodedNodes = Node.decodeNodes(nodesData);
    if (this.debugMode)
      console.log(`[OnFoundNodes] Successfully decoded ${decodedNodes.length}/${nodeCount} nodes`);
    let addedCount = 0;
    let validNodes = 0;
    if (decodedNodes.length > 0 && this.debugMode) {
      decodedNodes.slice(0, Math.min(3, decodedNodes.length)).forEach((node, idx) => {
        console.log(`[Node ${idx}] ID: ${node.id.toString("hex").substring(0, 8)}... Address: ${node.address}:${node.port}`);
      });
    } else if (decodedNodes.length === 0 && this.debugMode) {
      console.warn("[OnFoundNodes] No valid nodes were decoded");
      return;
    }
    decodedNodes.forEach((node) => {
      if (node.id && node.id.length === 20 && !node.id.equals(this.table.id) && isValidPort(node.port)) {
        validNodes++;
        const result = this.table.add(node);
        if (result) {
          addedCount++;
          this.findNode(Node.neighbor(node.id, this.table.id), node);
        }
      } else if (this.debugMode) {
        console.log(`[Node Validation Failed] ${JSON.stringify({
          hasId: !!node.id,
          idLength: node.id ? node.id.length : 0,
          isSelf: node.id && node.id.equals(this.table.id),
          port: node.port,
          validPort: isValidPort(node.port)
        })}`);
      }
    });
    if (this.debugMode)
      console.log(`[OnFoundNodes] Valid: ${validNodes}/${decodedNodes.length}, Added: ${addedCount}, Table size: ${this.table.size()}`);
    if (decodedNodes.length > 0) {
      this.emit("nodes", decodedNodes);
    }
  }
  onFindNodeRequest(message, rinfo) {
    if (!message.t || !message.a || !Buffer.isBuffer(message.a.id) || message.a.id.length !== 20 || !Buffer.isBuffer(message.a.target) || message.a.target.length !== 20) {
      if (this.debugMode)
        console.warn(`[OnFindNodeRequest] Invalid message format:`, message);
      return;
    }
    const { t: tid, a: { id: nid, target: _target } } = message;
    this.send({
      t: tid,
      y: "r",
      r: {
        id: Node.neighbor(nid, this.table.id),
        nodes: Node.encodeNodes(this.table.first()),
        v2: 1
      }
    }, rinfo);
  }
  onGetPeersRequest(message, rinfo) {
    if (!message.t || !message.a || !message.a.id || !message.a.info_hash) {
      if (this.debugMode)
        console.warn(`[OnGetPeersRequest] Invalid basic message structure:`, message);
      return;
    }
    let validNid = Buffer.isBuffer(message.a.id) && message.a.id.length === 20;
    if (!validNid) {
      if (this.debugMode)
        console.warn(`[OnGetPeersRequest] Invalid node ID format/length. ID: ${message.a.id}`);
      return;
    }
    let validInfohashBuffer = Buffer.isBuffer(message.a.info_hash);
    if (!validInfohashBuffer) {
      if (this.debugMode)
        console.warn(`[OnGetPeersRequest] Infohash is not a buffer. Type: ${typeof message.a.info_hash}`);
      return;
    }
    const { t: tid, a: { id: nid, info_hash: infohash } } = message;
    const infoHashLength = infohash.length;
    let version = 1;
    if (infoHashLength === 32) {
      version = 2;
      this.v2Count++;
      if (this.debugMode) {
        console.log(`[DEBUG] InfoHash v2 (32 bytes) requested: ${infohash.toString("hex").toUpperCase()}`);
      }
    } else if (infoHashLength === 20) {
      this.v1Count++;
    } else {
      if (this.debugMode)
        console.warn(`[OnGetPeersRequest] Unusual infohash length: ${infoHashLength} bytes`);
      this.v1Count++;
    }
    this.send({
      t: tid,
      y: "r",
      r: {
        id: Node.neighbor(nid, this.table.id),
        nodes: Node.encodeNodes(this.table.first()),
        token: this.token.generate(),
        v2: 1
      }
    }, rinfo);
    this.emit("unensureHash", infohash.toString("hex").toUpperCase(), version);
  }
  onAnnouncePeerRequest(message, rinfo) {
    if (!message.t || !message.a || !Buffer.isBuffer(message.a.id) || message.a.id.length !== 20 || !Buffer.isBuffer(message.a.info_hash) || !Buffer.isBuffer(message.a.token)) {
      if (this.debugMode)
        console.warn(`[OnAnnouncePeerRequest] Invalid message format:`, message);
      return;
    }
    const { t: tid, a: { info_hash: infohash, token, id: nid, implied_port, port: queryPort } } = message;
    if (!this.token.isValid(token)) {
      if (this.debugMode)
        console.warn(`[OnAnnouncePeerRequest] Invalid token received.`);
      return;
    }
    let finalPort = implied_port !== undefined && implied_port !== 0 ? rinfo.port : queryPort || 0;
    if (!isValidPort(finalPort)) {
      if (this.debugMode)
        console.warn(`[OnAnnouncePeerRequest] Invalid port derived: ${finalPort}.`);
      return;
    }
    if (!isValidInfoHash(infohash, this.v1Only)) {
      if (this.debugMode)
        console.warn(`[OnAnnouncePeerRequest] Invalid infohash announced:`, infohash.toString("hex"));
      return;
    }
    this.send({ t: tid, y: "r", r: { id: Node.neighbor(nid, this.table.id) } }, rinfo);
    const version = isInfoHashV2(infohash) ? 2 : 1;
    if (version === 2) {
      this.v2Count++;
      if (this.debugMode) {
        console.log(`[DEBUG] InfoHash v2 announced: ${infohash.toString("hex").toUpperCase()} from ${rinfo.address}:${finalPort}`);
      }
    } else {
      this.v1Count++;
    }
    if (!this.disableEnsureHash) {
      this.emit("ensureHash", infohash.toString("hex").toUpperCase(), {
        address: rinfo.address,
        port: finalPort,
        version
      });
    }
  }
  onPingRequest(message, rinfo) {
    if (!message.t || !message.a || !Buffer.isBuffer(message.a.id) || message.a.id.length !== 20) {
      if (this.debugMode)
        console.warn(`[OnPingRequest] Invalid message format:`, message);
      return;
    }
    this.send({
      t: message.t,
      y: "r",
      r: {
        id: Node.neighbor(message.a.id, this.table.id),
        v2: 1
      }
    }, rinfo);
  }
  parse(data, rinfo) {
    try {
      const isBootstrapNode = this.bootstraps.some((node) => node.address === rinfo.address && node.port === rinfo.port);
      if (isBootstrapNode && this.debugMode) {
        console.log(`[Bootstrap Response] From ${rinfo.address}:${rinfo.port} Size: ${data.length} bytes`);
        console.log(`[Bootstrap Raw] ${data.slice(0, 40).toString("hex")}`);
      }
      let message;
      try {
        message = bencode.decode(data);
        if (isBootstrapNode && this.debugMode) {
          console.log("[Bootstrap Message Summary]", message);
        }
      } catch (err) {
        if (this.debugMode)
          console.error(`[Parse] Bencode decoding error:`, err);
        return;
      }
      if (typeof message !== "object" || message === null || !message.y) {
        if (this.debugMode)
          console.warn(`[Parse] Received invalid/non-KRPC message from ${rinfo.address}:${rinfo.port}.`);
        return;
      }
      let messageType = "";
      if (Buffer.isBuffer(message.y)) {
        messageType = message.y.toString("utf8");
      } else if (typeof message.y === "string") {
        messageType = message.y;
      } else {
        messageType = String(message.y);
      }
      if (isBootstrapNode && this.debugMode) {
        console.log(`[Bootstrap] Message type: '${messageType}' from ${rinfo.address}:${rinfo.port}`);
      }
      if (messageType === "r" && message.r) {
        if (message.r.nodes) {
          let nodesData = message.r.nodes;
          if (!Buffer.isBuffer(nodesData)) {
            if (Array.isArray(nodesData)) {
              nodesData = Buffer.from(nodesData);
            } else {
              if (this.debugMode)
                console.warn(`[Parse] Nodes field is not a Buffer: ${typeof nodesData}`);
              return;
            }
          }
          const nodesLength = nodesData.length;
          if (isBootstrapNode && this.debugMode) {
            console.log(`[Bootstrap] Found nodes data: ${nodesLength} bytes`);
            console.log(`[Bootstrap Nodes Hex] ${nodesData.slice(0, Math.min(40, nodesLength)).toString("hex")}`);
          }
          if (nodesLength > 0) {
            if (nodesLength % 26 === 0) {
              if (isBootstrapNode && this.debugMode) {
                console.log(`[Bootstrap] Processing ${nodesLength / 26} nodes`);
              }
              this.onFoundNodes(nodesData);
            } else {
              if (this.debugMode)
                console.warn(`[Parse] Invalid nodes data length: ${nodesLength} bytes (not a multiple of 26)`);
            }
          } else {
            if (this.debugMode)
              console.log(`[Parse] Received empty nodes data`);
          }
        } else {
          if (isBootstrapNode && this.debugMode) {
            console.log(`[Bootstrap] Response from ${rinfo.address}:${rinfo.port} has no nodes field.`);
          }
        }
      } else if (messageType === "q" && message.q) {
        const queryType = typeof message.q === "string" ? message.q : message.q.toString("utf8");
        if (this.debugMode)
          console.log(`[Parse] Received query '${queryType}' from ${rinfo.address}:${rinfo.port}.`);
        switch (queryType) {
          case "get_peers":
            this.onGetPeersRequest(message, rinfo);
            break;
          case "announce_peer":
            this.onAnnouncePeerRequest(message, rinfo);
            break;
          case "find_node":
            this.onFindNodeRequest(message, rinfo);
            break;
          case "ping":
            this.onPingRequest(message, rinfo);
            break;
          default:
            if (this.debugMode)
              console.log(`[Parse] Received unknown query type: ${queryType}`);
            break;
        }
      } else if (messageType === "e") {
        if (this.debugMode)
          console.log(`[Parse] Received error message from ${rinfo.address}:${rinfo.port}:`, message.e);
      }
    } catch (err) {
      if (this.debugMode)
        console.error(`[Parse] Error processing message from ${rinfo.address}:${rinfo.port}:`, err);
    }
  }
  initSocket() {
    if (this.udp)
      return;
    this.udp = dgram.createSocket("udp4");
    this.udp.on("listening", () => {
      const address = this.udp?.address();
      if (address) {
        console.log(`DHT Spider listening on ${address.address}:${address.port}`);
        if (this.debugMode) {
          console.log(`Attempting to connect to ${this.bootstraps.length} bootstrap nodes...`);
          this.bootstraps.forEach((node, index) => {
            console.log(`Bootstrap[${index}]: ${node.address}:${node.port}`);
          });
        }
      }
    });
    this.udp.on("message", (data, rinfo) => {
      if (!rinfo || !rinfo.address || !isValidPort(rinfo.port)) {
        if (this.debugMode)
          console.warn("[Message] Received message with invalid remote info:", rinfo);
        return;
      }
      if (this.debugMode && this.table.size() < 10) {
        console.log(`[RECV] Message from ${rinfo.address}:${rinfo.port} (${data.length} bytes)`);
      }
      this.parse(data, rinfo);
    });
    this.udp.on("error", (err) => {
      if (this.debugMode)
        console.error("[UDP Error]", err);
      if (err.code === "EADDRINUSE") {
        console.error(`UDP Port ${this.udpPort} is already in use. Stopping spider.`);
        this.stop();
      }
    });
    this.udp.on("close", () => {
      if (this.debugMode)
        console.log("[UDP Close] Socket closed.");
      this.udp = null;
    });
    try {
      this.udp.bind(this.udpPort);
    } catch (err) {
      console.error(`Failed to bind UDP socket to port ${this.udpPort}:`, err);
      this.udp = null;
      throw err;
    }
  }
  start() {
    if (this.udp) {
      if (this.debugMode)
        console.warn("[Start] Spider is already running.");
      return;
    }
    console.log("[Start] Initializing DHT Spider...");
    this.initSocket();
    if (!this.udp) {
      console.error("[Start] Failed to initialize UDP socket. Cannot start.");
      return;
    }
    this.joinInterval = setInterval(() => this.join(), this.joinIntervalTime);
    setTimeout(() => this.walk(), 50);
    this.join();
    if (this.debugMode) {
      this.v1Count = 0;
      this.v2Count = 0;
      this.statsInterval = setInterval(() => {
        const total = this.v1Count + this.v2Count;
        const v2Ratio = total > 0 ? (this.v2Count / total * 100).toFixed(2) : "0.00";
        console.log(`[STATS] Table Size: ${this.table.size()}/${this.table.capacity} | v1 Hashes: ${this.v1Count} | v2 Hashes: ${this.v2Count} | v2 Ratio: ${v2Ratio}%`);
      }, 30000);
    }
  }
  stop() {
    console.log("[Stop] Stopping DHT Spider...");
    if (this.joinInterval) {
      clearInterval(this.joinInterval);
      this.joinInterval = null;
    }
    if (this.walkInterval) {
      clearTimeout(this.walkInterval);
      this.walkInterval = null;
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.token.stop();
    if (this.udp) {
      try {
        this.udp.close();
      } catch (err) {
        console.error("[Stop] Error closing UDP socket:", err);
      }
      this.udp = null;
    }
    this.table.clear();
    console.log("[Stop] DHT Spider stopped.");
  }
  listen(port) {
    if (port !== undefined) {
      this.udpPort = port;
    }
    this.start();
  }
  getNodeCount() {
    return this.table.size();
  }
  forceGetPeers() {
    const tableSize = this.table.size();
    if (tableSize === 0) {
      if (this.debugMode)
        console.log("[ForceGetPeers] No nodes in routing table. Trying to join DHT...");
      this.join();
      return;
    }
    const nodes = this.table.first();
    const validNodes = nodes.filter((node) => node && node.address && isValidPort(node.port));
    if (this.debugMode) {
      console.log(`[ForceGetPeers] Found ${validNodes.length} valid nodes for queries`);
    }
    const nodesToQuery = Math.min(20, validNodes.length);
    if (this.debugMode) {
      console.log(`[ForceGetPeers] Sending get_peers to ${nodesToQuery} random nodes`);
    }
    for (let i = 0;i < nodesToQuery; i++) {
      const node = validNodes[i];
      if (node) {
        const isV2Query = !this.v1Only && Math.random() < 0.8;
        const randomInfoHash = isV2Query ? crypto2.randomBytes(32) : crypto2.randomBytes(20);
        this.sendGetPeers(node, randomInfoHash);
        if (this.debugMode) {
          console.log(`[ForceGetPeers] Sent ${isV2Query ? "v2" : "v1"} query to ${node.address}:${node.port}`);
        }
      }
    }
  }
}
var spider_default = Spider;

// src/index.ts
var src_default = spider_default;
export {
  src_default as default,
  spider_default as Spider
};
