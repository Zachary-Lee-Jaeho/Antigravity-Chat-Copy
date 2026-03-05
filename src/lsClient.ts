import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';

export interface LsConnectionInfo {
    pid: number;
    csrfToken: string;
    port: number;
    certPath: string;
}

/**
 * Full discovery + verification: find LS process → ports → heartbeat.
 */
export async function connectToLs(allowInsecure: boolean): Promise<LsConnectionInfo> {
    if (process.platform !== 'linux') {
        throw new Error('V1 supports Linux only.');
    }

    const extPath = findExtensionPath();
    if (!extPath) throw new Error('Antigravity extension not found in ~/.antigravity-server/bin/');

    const binaryPath = path.join(extPath, 'bin', 'language_server_linux_x64');
    const certPath = path.join(extPath, 'dist', 'languageServer', 'cert.pem');

    // Scan /proc for matching process
    for (const pidStr of fs.readdirSync('/proc').filter(d => /^\d+$/.test(d))) {
        let cmdline: string;
        try { cmdline = fs.readFileSync(`/proc/${pidStr}/cmdline`, 'utf8'); } catch { continue; }
        if (!cmdline.includes(binaryPath)) continue;

        const args = cmdline.split('\0').filter(Boolean);
        const csrfToken = argValue(args, '--csrf_token');
        if (!csrfToken) continue;

        const pid = parseInt(pidStr, 10);
        const ports = getListeningPorts(pid);

        for (const port of ports) {
            const info: LsConnectionInfo = { pid, csrfToken, port, certPath };
            try {
                await callLsApi(info, 'Heartbeat', { metadata: {} }, allowInsecure);
                return info;
            } catch { /* try next port */ }
        }
    }

    throw new Error('Could not find Antigravity Language Server. Is Antigravity running?');
}

/**
 * Make a ConnectRPC JSON call to the Language Server.
 */
export function callLsApi(
    info: LsConnectionInfo, method: string, body: object, allowInsecure = false
): Promise<any> {
    return new Promise((resolve, reject) => {
        const doRequest = (rejectUnauth: boolean) => {
            const agentOpts: https.AgentOptions = { rejectUnauthorized: rejectUnauth };
            if (rejectUnauth) {
                try { agentOpts.ca = fs.readFileSync(info.certPath); } catch {
                    if (!allowInsecure) return reject(new Error(`cert.pem not found: ${info.certPath}`));
                    return doRequest(false); // fallback
                }
            }

            const postData = JSON.stringify(body);
            const req = https.request({
                hostname: '127.0.0.1', port: info.port, method: 'POST',
                path: `/exa.language_server_pb.LanguageServerService/${method}`,
                agent: new https.Agent(agentOpts),
                headers: {
                    'Content-Type': 'application/json',
                    'x-codeium-csrf-token': info.csrfToken,
                    'Content-Length': Buffer.byteLength(postData),
                },
            }, res => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try {
                        const j = JSON.parse(data);
                        (j.code && j.code !== 'ok') ? reject(new Error(`LS: ${j.code} - ${j.message}`)) : resolve(j);
                    } catch { reject(new Error(`Bad LS response: ${data.substring(0, 200)}`)); }
                });
            });

            req.on('error', err => {
                if (rejectUnauth && allowInsecure) doRequest(false);
                else reject(err);
            });
            req.write(postData);
            req.end();
        };

        doRequest(true);
    });
}

// ── Internal helpers ──

function findExtensionPath(): string | null {
    const base = path.join(os.homedir(), '.antigravity-server', 'bin');
    if (!fs.existsSync(base)) return null;

    const ver = fs.readdirSync(base)
        .filter(d => fs.existsSync(path.join(base, d, 'extensions', 'antigravity')))
        .sort().reverse()[0];

    return ver ? path.join(base, ver, 'extensions', 'antigravity') : null;
}

function argValue(args: string[], flag: string): string | null {
    const i = args.indexOf(flag);
    return (i >= 0 && i + 1 < args.length) ? args[i + 1] : null;
}

/**
 * Get loopback listening ports for a PID via /proc/PID/fd → /proc/net/tcp.
 */
function getListeningPorts(pid: number): number[] {
    // 1. Collect socket inodes
    const inodes = new Set<string>();
    try {
        for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
            try {
                const link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
                const m = /^socket:\[(\d+)\]$/.exec(link);
                if (m) inodes.add(m[1]);
            } catch { /* skip */ }
        }
    } catch { return []; }

    if (!inodes.size) return [];

    // 2. Match against /proc/net/tcp{,6}
    const ports: number[] = [];
    const LOOPBACK = new Set(['0100007F', '00000000', '00000000000000000000000001000000', '00000000000000000000000000000000']);

    for (const tcpFile of ['/proc/net/tcp', '/proc/net/tcp6']) {
        try {
            for (const line of fs.readFileSync(tcpFile, 'utf8').split('\n').slice(1)) {
                const p = line.trim().split(/\s+/);
                if (p.length < 10 || p[3] !== '0A' || !inodes.has(p[9])) continue;
                const [addr, portHex] = p[1].split(':');
                if (LOOPBACK.has(addr)) ports.push(parseInt(portHex, 16));
            }
        } catch { /* skip */ }
    }

    return ports;
}
