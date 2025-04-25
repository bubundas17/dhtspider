export default class Token {
    private token: Buffer;
    private intervalId: NodeJS.Timeout | null = null;

    constructor() {
        this.token = this.generate();
        this.intervalId = setInterval(() => {
            this.token = this.generate();
        }, 60000 * 15);
    }

    isValid(t: Buffer): boolean {
        // Ensure both are Buffers before comparing
        if (!Buffer.isBuffer(t) || !Buffer.isBuffer(this.token)) {
            return false;
        }
        return t.equals(this.token);
    }

    generate(): Buffer {
        // Generate a 2-byte buffer with random values
        return Buffer.from([Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)]);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
} 