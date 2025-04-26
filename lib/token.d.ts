export default class Token {
    private token;
    private intervalId;
    constructor();
    isValid(t: Buffer): boolean;
    generate(): Buffer;
    stop(): void;
}
