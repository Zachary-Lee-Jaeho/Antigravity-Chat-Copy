/**
 * crypto.ts — Key extraction and AES-256-GCM decryption.
 *
 * Multi-tier key extraction:
 *   Tier 1: Scan LS binary's ELF .rodata section for 32-byte all-alpha candidates,
 *           validate each by trial-decrypting a .pb file (~12s first run, cached after).
 *   Tier 2: Scan LS process memory (/proc/PID/mem) for key near conversations path.
 *   Tier 3: Caller shows notification to report via GitHub issue.
 *
 * Zero external dependencies — uses Node.js built-in crypto module.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Public API ──

let cachedKey: Buffer | null = null;

/** Extract the AES-256-GCM key. Returns key buffer or null. */
export async function extractKey(binaryPath: string, pid?: number): Promise<Buffer | null> {
    if (cachedKey) return cachedKey;

    const testPb = findSmallestPb();
    if (!testPb) return null;

    // Tier 1: Binary .rodata scan
    const key = extractKeyFromBinary(binaryPath, testPb);
    if (key) { cachedKey = key; return key; }

    // Tier 2: Process memory scan
    if (pid) {
        const key2 = extractKeyFromProcess(pid, testPb);
        if (key2) { cachedKey = key2; return key2; }
    }

    return null;
}

/** Clear cached key (e.g. when LS restarts). */
export function clearKeyCache(): void { cachedKey = null; }

/**
 * Decrypt an AES-256-GCM encrypted buffer.
 * Format: [12-byte nonce][ciphertext+tag]
 */
export function decrypt(data: Buffer, key: Buffer): Buffer {
    if (data.length < 28) throw new Error('Too small for AES-GCM');
    const nonce = data.subarray(0, 12);
    const ciphertext = data.subarray(12, data.length - 16);
    const tag = data.subarray(data.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── Tier 1: ELF Binary Scan ──

function extractKeyFromBinary(binaryPath: string, testPbPath: string): Buffer | null {
    let fd = -1;
    try {
        const testPb = fs.readFileSync(testPbPath);
        fd = fs.openSync(binaryPath, 'r');

        // Parse ELF header (64-bit only)
        const hdr = Buffer.alloc(64);
        fs.readSync(fd, hdr, 0, 64, 0);
        if (hdr[0] !== 0x7f || hdr[1] !== 0x45 || hdr[4] !== 2) return null;

        const shoff = Number(hdr.readBigUInt64LE(40));
        const shentsize = hdr.readUInt16LE(58);
        const shnum = hdr.readUInt16LE(60);
        const shstrndx = hdr.readUInt16LE(62);
        if (shoff === 0 || shnum === 0) return null;

        // Read section headers
        const shBuf = Buffer.alloc(shnum * shentsize);
        fs.readSync(fd, shBuf, 0, shBuf.length, shoff);

        // Read string table to resolve section names
        const strOff = shstrndx * shentsize;
        const strTabOff = Number(shBuf.readBigUInt64LE(strOff + 24));
        const strTabSz = Number(shBuf.readBigUInt64LE(strOff + 32));
        const strTab = Buffer.alloc(strTabSz);
        fs.readSync(fd, strTab, 0, strTabSz, strTabOff);

        // Find .rodata section
        let rodataOff = -1, rodataSz = 0;
        for (let i = 0; i < shnum; i++) {
            const nameIdx = shBuf.readUInt32LE(i * shentsize);
            let end = nameIdx;
            while (end < strTabSz && strTab[end] !== 0) end++;
            if (strTab.subarray(nameIdx, end).toString('ascii') === '.rodata') {
                rodataOff = Number(shBuf.readBigUInt64LE(i * shentsize + 24));
                rodataSz = Number(shBuf.readBigUInt64LE(i * shentsize + 32));
                break;
            }
        }
        if (rodataOff < 0) return null;

        // Read .rodata and slide 32-byte window through alpha runs
        const rodata = Buffer.alloc(rodataSz);
        fs.readSync(fd, rodata, 0, rodataSz, rodataOff);

        let i = 0;
        while (i < rodata.length - 32) {
            if (isAlpha(rodata[i])) {
                let end = i;
                while (end < rodata.length && isAlpha(rodata[end])) end++;
                if (end - i >= 32) {
                    for (let w = i; w + 32 <= end; w++) {
                        const candidate = Buffer.from(rodata.subarray(w, w + 32));
                        if (countUnique(candidate) >= 16 && tryDecrypt(testPb, candidate)) {
                            return candidate;
                        }
                    }
                }
                i = end;
            } else {
                i++;
            }
        }
    } catch { /* binary read failed */ }
    finally { if (fd >= 0) try { fs.closeSync(fd); } catch { } }
    return null;
}

// ── Tier 2: Process Memory Scan ──

function extractKeyFromProcess(pid: number, testPbPath: string): Buffer | null {
    try {
        const testPb = fs.readFileSync(testPbPath);
        const maps = fs.readFileSync(`/proc/${pid}/maps`, 'utf8').split('\n');
        const TARGET = Buffer.from('.gemini/antigravity/conversations');

        // Find rw heap segments
        const segs: Array<{ start: number; end: number }> = [];
        for (const line of maps) {
            const m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
            if (!m) continue;
            const start = parseInt(m[1], 16), end = parseInt(m[2], 16), sz = end - start;
            if (sz < 1024 || sz > 200 * 1024 * 1024) continue;
            if (line.includes('Go: heap') || (line.includes('[anon') && sz > 1024 * 1024)) {
                segs.push({ start, end });
            }
        }

        const fd = fs.openSync(`/proc/${pid}/mem`, 'r');
        const CHUNK = 64 * 1024 * 1024;
        try {
            // Find conversations path in heap
            const pathAddrs: number[] = [];
            for (const seg of segs) {
                let pos = seg.start;
                while (pos < seg.end && pathAddrs.length < 100) {
                    const sz = Math.min(CHUNK, seg.end - pos);
                    const buf = Buffer.alloc(sz);
                    try { fs.readSync(fd, buf, 0, sz, pos); } catch { pos += sz; continue; }
                    let idx = 0;
                    while (true) {
                        const p = buf.indexOf(TARGET, idx);
                        if (p === -1) break;
                        const before = p > 0 ? buf[p - 1] : 0;
                        if (before === 0x2f || before === 0) {
                            pathAddrs.push(pos + p - (before === 0x2f ? 1 : 0));
                        }
                        idx = p + 1;
                    }
                    pos += sz;
                }
            }

            // Search for Go string struct pointing to path, then find nearby 32-byte key
            const tried = new Set<string>();
            for (const addr of pathAddrs.slice(0, 20)) {
                const ptrBuf = Buffer.alloc(8);
                ptrBuf.writeBigUInt64LE(BigInt(addr));
                for (const seg of segs) {
                    let pos = seg.start;
                    while (pos < seg.end) {
                        const sz = Math.min(CHUNK, seg.end - pos);
                        const buf = Buffer.alloc(sz);
                        try { fs.readSync(fd, buf, 0, sz, pos); } catch { pos += sz; continue; }
                        let idx = 0;
                        while (true) {
                            const p = buf.indexOf(ptrBuf, idx);
                            if (p === -1 || p + 16 > sz) break;
                            const len = Number(buf.readBigUInt64LE(p + 8));
                            if (len >= 40 && len <= 100) {
                                const lo = Math.max(0, p - 128), hi = Math.min(sz, p + 384);
                                for (let off = lo; off < hi - 24; off += 8) {
                                    const sLen = Number(buf.readBigUInt64LE(off + 8));
                                    const sCap = Number(buf.readBigUInt64LE(off + 16));
                                    const sPtr = Number(buf.readBigUInt64LE(off));
                                    if (sLen === 32 && sCap >= 32 && sCap <= 64 && sPtr > 0x1000 && sPtr < 0xffffffffffff) {
                                        const keyBuf = Buffer.alloc(32);
                                        try {
                                            fs.readSync(fd, keyBuf, 0, 32, sPtr);
                                            const hex = keyBuf.toString('hex');
                                            if (!tried.has(hex) && countUnique(keyBuf) >= 8) {
                                                tried.add(hex);
                                                if (tryDecrypt(testPb, keyBuf)) return keyBuf;
                                            }
                                        } catch { }
                                    }
                                }
                            }
                            idx = p + 8;
                        }
                        pos += sz;
                    }
                }
            }
        } finally { fs.closeSync(fd); }
    } catch { }
    return null;
}

// ── Helpers ──

function isAlpha(b: number): boolean {
    return (b >= 65 && b <= 90) || (b >= 97 && b <= 122);
}

function countUnique(buf: Buffer): number {
    const seen = new Set<number>();
    for (let i = 0; i < buf.length; i++) seen.add(buf[i]);
    return seen.size;
}

function tryDecrypt(pbData: Buffer, key: Buffer): boolean {
    try {
        decrypt(pbData, key);
        return true;
    } catch { return false; }
}

function findSmallestPb(): string | null {
    const dir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
    try {
        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.pb'))
            .map(f => ({ path: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size }))
            .sort((a, b) => a.size - b.size);
        return files.length > 0 ? files[0].path : null;
    } catch { return null; }
}
