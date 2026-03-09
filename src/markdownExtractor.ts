/**
 * markdownExtractor.ts — Extract user/assistant messages from step arrays.
 *
 * Works with both API-returned steps (JSON) and disk-parsed steps (protobuf).
 * Turn detection: USER_INPUT → NOTIFY_USER (primary) or PLANNER_RESPONSE (fallback).
 */
import { Step, ConversationMessage, DetailStep, STEP_TYPE } from './types';

// ── Step display metadata ──

const STEP_META: Record<string, { label: string; icon: string; open?: boolean }> = {
    [STEP_TYPE.USER_INPUT]: { label: 'User Input', icon: '👤', open: true },
    [STEP_TYPE.NOTIFY_USER]: { label: 'Assistant Reply', icon: '💬', open: true },
    [STEP_TYPE.CODE_ACTION]: { label: 'Code Action', icon: '✏️', open: true },
    [STEP_TYPE.CODE_ACKNOWLEDGEMENT]: { label: 'Code Applied', icon: '✅' },
    [STEP_TYPE.ERROR_MESSAGE]: { label: 'Error', icon: '❌', open: true },
    [STEP_TYPE.PLANNER_RESPONSE]: { label: 'AI Thinking', icon: '🧠' },
    [STEP_TYPE.RUN_COMMAND]: { label: 'Run Command', icon: '⚡' },
    [STEP_TYPE.COMMAND_STATUS]: { label: 'Command Output', icon: '📊' },
    [STEP_TYPE.LIST_DIRECTORY]: { label: 'List Directory', icon: '📁' },
    [STEP_TYPE.VIEW_FILE]: { label: 'View File', icon: '📄' },
    [STEP_TYPE.VIEW_FILE_OUTLINE]: { label: 'File Outline', icon: '📋' },
    [STEP_TYPE.VIEW_CODE_ITEM]: { label: 'View Code', icon: '🔬' },
    [STEP_TYPE.VIEW_CONTENT_CHUNK]: { label: 'View Content', icon: '📑' },
    [STEP_TYPE.GREP_SEARCH]: { label: 'Grep Search', icon: '🔍' },
    [STEP_TYPE.FIND]: { label: 'Find Files', icon: '🔎' },
    [STEP_TYPE.SEARCH_WEB]: { label: 'Web Search', icon: '🌐' },
    [STEP_TYPE.READ_URL_CONTENT]: { label: 'Read URL', icon: '🔗' },
    [STEP_TYPE.BROWSER_ACTION]: { label: 'Browser', icon: '🖥️' },
    [STEP_TYPE.GENERATE_IMAGE]: { label: 'Generate Image', icon: '🎨' },
    [STEP_TYPE.TASK_BOUNDARY]: { label: 'Task Update', icon: '📌' },
    [STEP_TYPE.EPHEMERAL_MESSAGE]: { label: 'System Message', icon: '⚙️' },
    [STEP_TYPE.CONVERSATION_HISTORY]: { label: 'History', icon: '📜' },
    [STEP_TYPE.KNOWLEDGE_ARTIFACTS]: { label: 'Knowledge', icon: '📚' },
    [STEP_TYPE.CHECKPOINT]: { label: 'Checkpoint', icon: '🔖' },
};

// ── Content extractors ──
// One function per step type. Returns display-ready text.

function viewFileText(s: Step): string {
    const vf = s.viewFile;
    if (!vf) return '';
    const parts: string[] = [];
    if (vf.filePath) parts.push(`File: ${vf.filePath}`);
    if (vf.content) parts.push(vf.content);
    return parts.join('\n');
}

const EXTRACTORS: Record<string, (s: Step) => string> = {
    [STEP_TYPE.USER_INPUT]: s => s.userInput?.userResponse || '',
    [STEP_TYPE.NOTIFY_USER]: s => s.notifyUser?.notificationContent || '',
    [STEP_TYPE.EPHEMERAL_MESSAGE]: s => s.ephemeralMessage?.content || '',

    [STEP_TYPE.PLANNER_RESPONSE]: s => {
        const p = s.plannerResponse;
        if (!p) return '';
        const parts: string[] = [];
        if (p.thinking) parts.push(`**Thinking:**\n${p.thinking}`);
        if (p.toolCalls?.length) {
            parts.push(`**Tool Calls:**\n${p.toolCalls.map(t => `- \`${t.name}\``).join('\n')}`);
        }
        return parts.join('\n\n') || '(empty)';
    },

    [STEP_TYPE.RUN_COMMAND]: s => {
        const c = s.runCommand;
        if (!c) return '';
        const parts: string[] = [];
        if (c.commandLine) parts.push(`$ ${c.commandLine}`);
        if (c.cwd) parts.push(`(cwd: ${c.cwd})`);
        if (c.combinedOutput?.full) parts.push(c.combinedOutput.full);
        if (c.exitCode !== undefined) parts.push(`Exit code: ${c.exitCode}`);
        return parts.join('\n');
    },

    [STEP_TYPE.COMMAND_STATUS]: s => {
        const cs = s.commandStatus;
        if (!cs) return '';
        const parts: string[] = [];
        if (cs.output) parts.push(cs.output);
        if (cs.exitCode !== undefined) parts.push(`Exit code: ${cs.exitCode}`);
        return parts.join('\n');
    },

    [STEP_TYPE.CODE_ACTION]: s => {
        const c = s.codeAction;
        if (!c) return '';
        const parts: string[] = [];
        if (c.filePath) parts.push(`File: ${c.filePath}`);
        if (c.description) parts.push(c.description);
        if (c.diff) parts.push(`\`\`\`diff\n${c.diff}\n\`\`\``);
        return parts.join('\n');
    },

    [STEP_TYPE.TASK_BOUNDARY]: s => {
        const t = s.taskBoundary;
        if (!t) return '';
        return (['taskName', 'taskStatus', 'taskSummary', 'mode'] as const)
            .filter(k => t[k]).map(k => `${k}: ${t[k]}`).join('\n');
    },

    [STEP_TYPE.ERROR_MESSAGE]: s =>
        s.errorMessage?.message || '',

    // Four view types share one extractor
    [STEP_TYPE.VIEW_FILE]: viewFileText,
    [STEP_TYPE.VIEW_FILE_OUTLINE]: viewFileText,
    [STEP_TYPE.VIEW_CODE_ITEM]: viewFileText,
    [STEP_TYPE.VIEW_CONTENT_CHUNK]: viewFileText,

    [STEP_TYPE.LIST_DIRECTORY]: s => s.listDirectory?.content || '',

    [STEP_TYPE.GREP_SEARCH]: s => s.searchResult?.content || '',
    [STEP_TYPE.FIND]: s => s.searchResult?.content || '',
    [STEP_TYPE.SEARCH_WEB]: s => s.searchWeb?.content || '',

    [STEP_TYPE.READ_URL_CONTENT]: s => {
        const ru = s.readUrl;
        if (!ru) return '';
        const parts: string[] = [];
        if (ru.url) parts.push(`URL: ${ru.url}`);
        if (ru.content) parts.push(ru.content);
        return parts.join('\n');
    },

    [STEP_TYPE.CONVERSATION_HISTORY]: s => s.conversationHistory?.content || '',
    [STEP_TYPE.KNOWLEDGE_ARTIFACTS]: s => s.knowledgeArtifacts?.content || '',
    [STEP_TYPE.CODE_ACKNOWLEDGEMENT]: s => s.codeAcknowledgement?.content || '',
    [STEP_TYPE.CHECKPOINT]: () => '',
};

function extractContent(step: Step): string {
    const extractor = EXTRACTORS[step.type];
    if (extractor) return extractor(step);
    // Generic fallback
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(step)) {
        if (!['type', 'status', 'timestamp', 'stepId'].includes(k)) data[k] = v;
    }
    return Object.keys(data).length ? JSON.stringify(data, null, 2) : '';
}

// ── Public API ──

export function extractMessages(steps: Step[]): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Find all USER_INPUT indices
    const userIdxs: number[] = [];
    steps.forEach((s, i) => { if (s.type === STEP_TYPE.USER_INPUT) userIdxs.push(i); });

    for (let u = 0; u < userIdxs.length; u++) {
        const uIdx = userIdxs[u];
        const nextU = userIdxs[u + 1] ?? steps.length;

        // User message
        const userText = (steps[uIdx].userInput?.userResponse || '').trim();
        if (userText) messages.push({ stepIndex: uIdx, role: 'user', content: userText });

        // Assistant response: prefer NOTIFY_USER, fallback to PLANNER_RESPONSE
        let hasNotify = false;
        for (let i = uIdx + 1; i < nextU; i++) {
            if (steps[i].type !== STEP_TYPE.NOTIFY_USER) continue;
            const text = (steps[i].notifyUser?.notificationContent || '').trim();
            if (!text) continue;
            hasNotify = true;
            messages.push({
                stepIndex: i, role: 'assistant', content: text,
                detailSteps: collectDetails(steps, uIdx, i),
            });
        }

        if (!hasNotify) {
            for (let i = nextU - 1; i > uIdx; i--) {
                if (steps[i].type !== STEP_TYPE.PLANNER_RESPONSE) continue;
                const pr = steps[i].plannerResponse;
                const text = (pr?.modifiedResponse || pr?.response || '').trim();
                if (!text) continue;
                messages.push({
                    stepIndex: i, role: 'assistant', content: text,
                    detailSteps: collectDetails(steps, uIdx, i),
                });
                break;
            }
        }
    }
    return messages;
}

function collectDetails(steps: Step[], from: number, to: number): DetailStep[] {
    const details: DetailStep[] = [];
    for (let j = from; j <= to; j++) {
        const c = extractContent(steps[j]);
        if (!c.trim()) continue;
        const meta = STEP_META[steps[j].type] || {
            label: steps[j].type.replace(/^(CORTEX_STEP_TYPE_|UNKNOWN_)/, ''),
            icon: '❓',
        };
        details.push({
            stepIndex: j, label: meta.label, icon: meta.icon,
            content: c, defaultOpen: !!meta.open,
        });
    }
    return details;
}

export function extractTitle(steps: Step[]): string {
    for (const s of steps) {
        if (s.type === STEP_TYPE.USER_INPUT) {
            const line = (s.userInput?.userResponse || '').trim().split('\n')[0];
            if (line) return line.length > 80 ? line.substring(0, 77) + '...' : line;
        }
    }
    return 'Untitled Conversation';
}
