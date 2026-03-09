/**
 * proto.ts — Protobuf wire-format decoder and trajectory/step parser.
 *
 * Parses decrypted .pb data into typed Step objects.
 * No protobuf schema needed — uses raw wire decoding with field-number-based dispatch.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { decrypt } from './crypto';
import { Step, Trajectory, TrajectoryMetadata, STEP_TYPE } from './types';

// ── Protobuf type number → StepType mapping ──
// Discovered by count-correlating API JSON types vs raw protobuf field numbers.

const PROTO_TYPE_MAP: Record<number, string> = {
    5: STEP_TYPE.CODE_ACTION,
    7: STEP_TYPE.VIEW_FILE,
    8: STEP_TYPE.VIEW_FILE_OUTLINE,
    9: STEP_TYPE.LIST_DIRECTORY,
    14: STEP_TYPE.USER_INPUT,
    15: STEP_TYPE.PLANNER_RESPONSE,
    18: STEP_TYPE.CHECKPOINT,
    21: STEP_TYPE.RUN_COMMAND,
    23: STEP_TYPE.VIEW_CONTENT_CHUNK,
    25: STEP_TYPE.GREP_SEARCH,
    28: STEP_TYPE.COMMAND_STATUS,
    31: STEP_TYPE.READ_URL_CONTENT,
    32: STEP_TYPE.VIEW_CODE_ITEM,
    33: STEP_TYPE.SEARCH_WEB,
    47: STEP_TYPE.FIND,
    52: STEP_TYPE.GENERATE_IMAGE,
    65: STEP_TYPE.BROWSER_ACTION,
    81: STEP_TYPE.TASK_BOUNDARY,
    82: STEP_TYPE.NOTIFY_USER,
    83: STEP_TYPE.CODE_ACKNOWLEDGEMENT,
    85: STEP_TYPE.ERROR_MESSAGE,
    89: STEP_TYPE.CONVERSATION_HISTORY,
    90: STEP_TYPE.EPHEMERAL_MESSAGE,
    91: STEP_TYPE.KNOWLEDGE_ARTIFACTS,
    99: STEP_TYPE.CONVERSATION_HISTORY,
    100: STEP_TYPE.KNOWLEDGE_ARTIFACTS,
};

// ── Public API ──

/** Load a conversation from its encrypted .pb file on disk. */
export function loadConversationFromDisk(cascadeId: string, key: Buffer): Trajectory | null {
    const pbPath = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations', `${cascadeId}.pb`);
    if (!fs.existsSync(pbPath)) return null;
    try {
        const encrypted = fs.readFileSync(pbPath);
        const decrypted = decrypt(encrypted, key);
        return parseTrajectory(decrypted);
    } catch { return null; }
}

/** Parse decrypted protobuf bytes into a Trajectory. */
export function parseTrajectory(data: Buffer): Trajectory {
    const fields = decodeProto(data);
    let id = '';
    const steps: Step[] = [];
    let metadata: TrajectoryMetadata = {};

    for (const f of fields) {
        if (f.num === 1 && Buffer.isBuffer(f.val)) {
            id = f.val.toString('utf8');
        } else if (f.num === 2 && Buffer.isBuffer(f.val)) {
            const step = parseStep(f.val);
            if (step) steps.push(step);
        } else if (f.num === 3 && Buffer.isBuffer(f.val)) {
            metadata = parseMetadata(f.val);
        } else if (f.num === 7 && Buffer.isBuffer(f.val)) {
            // Workspace info lives in top-level field 7, nested 2-3 levels deep.
            // Recursively search for file:// URIs regardless of isText() heuristic.
            const findWorkspace = (buf: Buffer, depth: number): void => {
                if (depth <= 0) return;
                for (const i of decodeProto(buf)) {
                    if (!Buffer.isBuffer(i.val)) continue;
                    const s = i.val.toString('utf8');
                    if (s.startsWith('file://') && s.length < 500) {
                        if (!metadata.workspaces) metadata.workspaces = [];
                        metadata.workspaces.push({ workspaceFolderAbsoluteUri: s });
                    } else if (i.val.length > 4) {
                        findWorkspace(i.val, depth - 1);
                    }
                }
            };
            findWorkspace(f.val, 3);
        }
    }
    return { id, steps, metadata };
}

// ── Step Parser ──

function parseStep(data: Buffer): Step | null {
    const fields = decodeProto(data);
    const step: Step = { type: '' };

    // Pass 1: extract type, status, metadata (timestamp, stepId)
    for (const f of fields) {
        switch (f.num) {
            case 1:
                if (typeof f.val === 'number') {
                    step.type = PROTO_TYPE_MAP[f.val] || `UNKNOWN_${f.val}`;
                }
                break;
            case 4:
                if (typeof f.val === 'number') step.status = f.val;
                break;
            case 5:
                if (Buffer.isBuffer(f.val)) extractStepMeta(f.val, step);
                break;
        }
    }
    if (!step.type) return null;

    // Pass 2: find the oneof data field (any Buffer field with num > 5)
    for (const f of fields) {
        if (f.num <= 5 || !Buffer.isBuffer(f.val)) continue;
        parseStepData(f.val, step);
    }

    return step;
}

function extractStepMeta(data: Buffer, step: Step): void {
    const fields = decodeProto(data);
    // Timestamp: field 1 → sub-field 1 (seconds as varint)
    const tsField = fields.find(f => f.num === 1);
    if (tsField && Buffer.isBuffer(tsField.val)) {
        const inner = decodeProto(tsField.val);
        const sec = inner.find(f => f.num === 1);
        if (sec && typeof sec.val === 'number') step.timestamp = sec.val * 1000;
    }
    // StepId: field 12 (UUID string)
    const sidField = fields.find(f => f.num === 12);
    if (sidField && Buffer.isBuffer(sidField.val) && isText(sidField.val)) {
        step.stepId = sidField.val.toString('utf8');
    }
}

// ── Step Data Parser ──
// Each step type stores data in a different field number (protobuf oneof).
// This function receives the data payload and assigns typed fields on step.

function parseStepData(data: Buffer, step: Step): void {
    const fields = decodeProto(data);
    const allTexts = gatherTexts(data, 3);

    switch (step.type) {
        case STEP_TYPE.USER_INPUT: {
            const text = textAt(fields, 2) || allTexts[0] || '';
            if (text) step.userInput = { userResponse: text };
            break;
        }
        case STEP_TYPE.PLANNER_RESPONSE: {
            step.plannerResponse = parsePlannerResponse(fields);
            break;
        }
        case STEP_TYPE.NOTIFY_USER: {
            const longest = longestText(allTexts, 5);
            if (longest) step.notifyUser = { notificationContent: longest };
            break;
        }
        case STEP_TYPE.CODE_ACTION: {
            step.codeAction = parseCodeAction(allTexts);
            break;
        }
        case STEP_TYPE.RUN_COMMAND: {
            step.runCommand = parseRunCommand(fields);
            break;
        }
        case STEP_TYPE.COMMAND_STATUS: {
            const texts = allTexts.filter(t => t.length > 0);
            const cs: Step['commandStatus'] = {};
            if (texts.length > 0) cs.output = texts.join('\n');
            for (const f of fields) {
                if (typeof f.val === 'number' && f.num > 3) cs.exitCode = f.val;
            }
            step.commandStatus = cs;
            break;
        }
        case STEP_TYPE.TASK_BOUNDARY: {
            const texts = allTexts.filter(t => t.length > 0 && t.length < 2000);
            step.taskBoundary = {
                taskName: texts[0],
                mode: texts[1],
                taskSummary: texts[2],
                taskStatus: texts[3],
            };
            break;
        }
        case STEP_TYPE.ERROR_MESSAGE: {
            const texts = allTexts.filter(t => t.length > 0);
            if (texts.length > 0) step.errorMessage = { message: texts.join('\n') };
            break;
        }
        case STEP_TYPE.EPHEMERAL_MESSAGE: {
            const longest = longestText(allTexts, 5);
            if (longest) step.ephemeralMessage = { content: longest };
            break;
        }
        case STEP_TYPE.VIEW_FILE:
        case STEP_TYPE.VIEW_FILE_OUTLINE:
        case STEP_TYPE.VIEW_CODE_ITEM:
        case STEP_TYPE.VIEW_CONTENT_CHUNK: {
            step.viewFile = parseFileContent(allTexts);
            break;
        }
        case STEP_TYPE.LIST_DIRECTORY: {
            step.listDirectory = { content: allTexts.filter(t => t.length > 0).join('\n') };
            break;
        }
        case STEP_TYPE.GREP_SEARCH:
        case STEP_TYPE.FIND: {
            step.searchResult = { content: allTexts.filter(t => t.length > 0).join('\n') };
            break;
        }
        case STEP_TYPE.SEARCH_WEB: {
            step.searchWeb = { content: allTexts.filter(t => t.length > 0).join('\n') };
            break;
        }
        case STEP_TYPE.READ_URL_CONTENT: {
            const texts = allTexts.filter(t => t.length > 0);
            const urls = texts.filter(t => t.startsWith('http'));
            const content = texts.filter(t => !t.startsWith('http'));
            step.readUrl = { url: urls[0] || '', content: content.join('\n') };
            break;
        }
        case STEP_TYPE.CONVERSATION_HISTORY: {
            step.conversationHistory = { content: allTexts.join('\n').substring(0, 500) };
            break;
        }
        case STEP_TYPE.KNOWLEDGE_ARTIFACTS: {
            step.knowledgeArtifacts = { content: allTexts.join('\n').substring(0, 500) };
            break;
        }
        case STEP_TYPE.CODE_ACKNOWLEDGEMENT: {
            step.codeAcknowledgement = { content: allTexts.filter(t => t.length > 0).join('\n') };
            break;
        }
        default: {
            if (allTexts.length > 0) step.genericData = { content: allTexts.join('\n') };
            break;
        }
    }
}

// ── Type-Specific Parsers ──

function parsePlannerResponse(fields: Field[]): Step['plannerResponse'] {
    const pr: NonNullable<Step['plannerResponse']> = {};
    // f1=response, f3=thinking, f4=base64 tokens (skip), f6=bot-id (skip), f7=tool calls, f8=response copy
    for (const f of fields) {
        if (f.num === 1 && Buffer.isBuffer(f.val) && isText(f.val)) {
            pr.response = f.val.toString('utf8');
        } else if (f.num === 3 && Buffer.isBuffer(f.val) && isText(f.val)) {
            pr.thinking = f.val.toString('utf8');
        } else if (f.num === 7 && Buffer.isBuffer(f.val)) {
            if (!pr.toolCalls) pr.toolCalls = [];
            const tf = decodeProto(f.val);
            const tc: { id: string; name: string; args?: string } = { id: '', name: '' };
            for (const t of tf) {
                if (!Buffer.isBuffer(t.val) || !isText(t.val)) continue;
                const s = t.val.toString('utf8');
                if (t.num === 1) tc.id = s;
                else if (t.num === 2) tc.name = s;
                else if (t.num === 3) tc.args = s;
            }
            if (tc.name) pr.toolCalls.push(tc);
        } else if (f.num === 8 && Buffer.isBuffer(f.val) && isText(f.val)) {
            if (!pr.response) pr.response = f.val.toString('utf8');
            else pr.modifiedResponse = f.val.toString('utf8');
        }
    }
    return pr;
}

function parseCodeAction(texts: string[]): Step['codeAction'] {
    const ca: NonNullable<Step['codeAction']> = {};
    for (const t of texts) {
        if (!t) continue;
        if ((t.startsWith('/') || t.startsWith('file://')) && !ca.filePath) ca.filePath = t;
        else if (t.includes('@@') || (t.includes('+') && t.includes('-') && t.length > 20)) {
            ca.diff = ca.diff ? ca.diff + '\n' + t : t;
        }
        else if (!ca.description) ca.description = t;
        else if (!ca.instruction) ca.instruction = t;
    }
    return ca;
}

function parseRunCommand(fields: Field[]): Step['runCommand'] {
    const rc: NonNullable<Step['runCommand']> = {};
    const topTexts = directTexts(fields);
    if (topTexts.length > 0) rc.commandLine = topTexts[0];
    if (topTexts.length > 1) rc.cwd = topTexts[1];
    for (const f of fields) {
        if (Buffer.isBuffer(f.val) && !isText(f.val)) {
            const inner = gatherTexts(f.val, 2).filter(t => t.length > 5);
            if (inner.length > 0) rc.combinedOutput = { full: inner.join('\n') };
        }
        if (typeof f.val === 'number' && f.num > 5) rc.exitCode = f.val;
    }
    return rc;
}

function parseFileContent(texts: string[]): Step['viewFile'] {
    const vf: NonNullable<Step['viewFile']> = {};
    for (const t of texts) {
        if (!t) continue;
        if ((t.startsWith('/') || t.startsWith('file://')) && !vf.filePath) vf.filePath = t;
        else if (!vf.content && t.length > 10) vf.content = t;
    }
    return vf;
}

function parseMetadata(data: Buffer): TrajectoryMetadata {
    const meta: TrajectoryMetadata = {};
    for (const f of decodeProto(data)) {
        if (!Buffer.isBuffer(f.val)) continue;
        for (const i of decodeProto(f.val)) {
            if (Buffer.isBuffer(i.val) && isText(i.val)) {
                const s = i.val.toString('utf8');
                if (s.startsWith('file://')) {
                    if (!meta.workspaces) meta.workspaces = [];
                    meta.workspaces.push({ workspaceFolderAbsoluteUri: s });
                }
            }
        }
    }
    return meta;
}

// ── Wire-Format Protobuf Decoder ──

interface Field {
    num: number;
    val: number | Buffer;
}

function decodeProto(data: Buffer): Field[] {
    const fields: Field[] = [];
    let off = 0;
    while (off < data.length) {
        const tag = readVarint(data, off);
        if (!tag) break;
        off = tag.next;
        const num = tag.val >>> 3;
        const wire = tag.val & 0x7;
        if (num === 0) break;

        switch (wire) {
            case 0: { // varint
                const v = readVarint(data, off);
                if (!v) return fields;
                off = v.next;
                fields.push({ num, val: v.val });
                break;
            }
            case 1: { // 64-bit
                if (off + 8 > data.length) return fields;
                fields.push({ num, val: data.readDoubleLE(off) });
                off += 8;
                break;
            }
            case 2: { // length-delimited
                const len = readVarint(data, off);
                if (!len) return fields;
                off = len.next;
                if (off + len.val > data.length) return fields;
                fields.push({ num, val: Buffer.from(data.subarray(off, off + len.val)) });
                off += len.val;
                break;
            }
            case 5: { // 32-bit
                if (off + 4 > data.length) return fields;
                fields.push({ num, val: data.readFloatLE(off) });
                off += 4;
                break;
            }
            default: return fields;
        }
    }
    return fields;
}

function readVarint(data: Buffer, off: number): { val: number; next: number } | null {
    let val = 0, shift = 0;
    while (off < data.length) {
        const b = data[off++];
        val |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) return { val: val >>> 0, next: off };
        shift += 7;
        if (shift > 35) return null;
    }
    return null;
}

// ── Text Helpers ──

/** Check if buffer looks like UTF-8 text (vs binary protobuf sub-message). */
function isText(buf: Buffer): boolean {
    if (buf.length === 0) return true;
    let ok = 0;
    const n = Math.min(buf.length, 100);
    for (let i = 0; i < n; i++) {
        const b = buf[i];
        if ((b >= 0x20 && b < 0x7f) || (b >= 0x80 && b <= 0xf4)) ok++;
    }
    return (ok / n) > 0.85;
}

/** Recursively collect all text strings from a protobuf tree, up to maxDepth. */
function gatherTexts(data: Buffer, depth: number): string[] {
    if (depth <= 0) return [];
    const out: string[] = [];
    for (const f of decodeProto(data)) {
        if (!Buffer.isBuffer(f.val)) continue;
        if (isText(f.val) && f.val.length > 0) out.push(f.val.toString('utf8'));
        else out.push(...gatherTexts(f.val, depth - 1));
    }
    return out;
}

/** Get text at a specific field number. */
function textAt(fields: Field[], num: number): string | null {
    for (const f of fields) {
        if (f.num === num && Buffer.isBuffer(f.val) && isText(f.val)) {
            return f.val.toString('utf8');
        }
    }
    return null;
}

/** Get all direct text fields. */
function directTexts(fields: Field[]): string[] {
    return fields
        .filter(f => Buffer.isBuffer(f.val) && isText(f.val) && f.val.length > 0)
        .map(f => (f.val as Buffer).toString('utf8'));
}

/** Find the longest text exceeding minLen. */
function longestText(texts: string[], minLen: number): string | null {
    const filtered = texts.filter(t => t.length > minLen);
    if (filtered.length === 0) return null;
    return filtered.reduce((a, b) => a.length > b.length ? a : b);
}
