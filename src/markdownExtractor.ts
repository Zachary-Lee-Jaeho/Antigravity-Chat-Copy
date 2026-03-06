export interface DetailStep {
    stepIndex: number;
    label: string;
    icon: string;
    content: string;
    defaultOpen: boolean;
}

export interface ConversationMessage {
    stepIndex: number;
    role: 'user' | 'assistant';
    content: string;
    detailSteps?: DetailStep[];
}

// ── Step type metadata ──

const STEP_META: Record<string, { label: string; icon: string; open?: boolean }> = {
    CORTEX_STEP_TYPE_USER_INPUT: { label: 'User Input', icon: '👤', open: true },
    CORTEX_STEP_TYPE_NOTIFY_USER: { label: 'Assistant Reply', icon: '💬', open: true },
    CORTEX_STEP_TYPE_CODE_ACTION: { label: 'Code Action', icon: '✏️', open: true },
    CORTEX_STEP_TYPE_ERROR_MESSAGE: { label: 'Error', icon: '❌', open: true },
    CORTEX_STEP_TYPE_PLANNER_RESPONSE: { label: 'AI Thinking', icon: '🧠' },
    CORTEX_STEP_TYPE_RUN_COMMAND: { label: 'Run Command', icon: '⚡' },
    CORTEX_STEP_TYPE_COMMAND_STATUS: { label: 'Command Status', icon: '📊' },
    CORTEX_STEP_TYPE_LIST_DIRECTORY: { label: 'List Directory', icon: '📁' },
    CORTEX_STEP_TYPE_VIEW_FILE: { label: 'View File', icon: '📄' },
    CORTEX_STEP_TYPE_VIEW_FILE_OUTLINE: { label: 'File Outline', icon: '📋' },
    CORTEX_STEP_TYPE_GREP_SEARCH: { label: 'Grep Search', icon: '🔍' },
    CORTEX_STEP_TYPE_FIND: { label: 'Find Files', icon: '🔎' },
    CORTEX_STEP_TYPE_SEARCH_WEB: { label: 'Web Search', icon: '🌐' },
    CORTEX_STEP_TYPE_TASK_BOUNDARY: { label: 'Task Update', icon: '📌' },
    CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE: { label: 'System Message', icon: '⚙️' },
    CORTEX_STEP_TYPE_CONVERSATION_HISTORY: { label: 'History', icon: '📜' },
    CORTEX_STEP_TYPE_KNOWLEDGE_ARTIFACTS: { label: 'Knowledge', icon: '📚' },
    CORTEX_STEP_TYPE_CHECKPOINT: { label: 'Checkpoint', icon: '🔖' },
};

const EXTRACTORS: Record<string, (s: any) => string> = {
    CORTEX_STEP_TYPE_USER_INPUT: s => s.userInput?.userResponse || '',
    CORTEX_STEP_TYPE_NOTIFY_USER: s => s.notifyUser?.notificationContent || '',
    CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE: s => s.ephemeralMessage?.content || '',

    CORTEX_STEP_TYPE_PLANNER_RESPONSE: s => {
        const p = s.plannerResponse;
        if (!p) return '';
        const parts: string[] = [];
        if (p.thinking) parts.push(`**Thinking:**\n${p.thinking}`);
        if (p.toolCalls?.length) parts.push(`**Tool Calls:**\n${p.toolCalls.map((t: any) => `- \`${t.name}\``).join('\n')}`);
        return parts.join('\n\n') || '(empty)';
    },

    CORTEX_STEP_TYPE_RUN_COMMAND: s => {
        const c = s.runCommand;
        if (!c) return '';
        const parts: string[] = [];
        if (c.commandLine) parts.push(`$ ${c.commandLine}`);
        if (c.cwd) parts.push(`(cwd: ${c.cwd})`);
        if (c.combinedOutput?.full) parts.push(c.combinedOutput.full);
        if (c.exitCode !== undefined) parts.push(`Exit code: ${c.exitCode}`);
        return parts.join('\n');
    },

    CORTEX_STEP_TYPE_CODE_ACTION: s => {
        const c = s.codeAction;
        if (!c) return '';
        const parts: string[] = [];
        if (c.filePath) parts.push(`File: ${c.filePath}`);
        if (c.description) parts.push(c.description);
        if (c.diff) parts.push(`\`\`\`diff\n${c.diff}\n\`\`\``);
        return parts.join('\n');
    },

    CORTEX_STEP_TYPE_TASK_BOUNDARY: s => {
        const t = s.taskBoundary;
        if (!t) return '';
        return ['taskName', 'taskStatus', 'taskSummary', 'mode']
            .filter(k => t[k]).map(k => `${k}: ${t[k]}`).join('\n');
    },

    CORTEX_STEP_TYPE_ERROR_MESSAGE: s =>
        s.errorMessage?.message || s.errorMessage?.content || JSON.stringify(s.errorMessage || {}),

    CORTEX_STEP_TYPE_VIEW_FILE: s => s.viewFile?.content || '',

    CORTEX_STEP_TYPE_LIST_DIRECTORY: s =>
        s.listDirectory?.content || JSON.stringify(s.listDirectory || {}, null, 2),
};

function extractContent(step: any): string {
    const extractor = EXTRACTORS[step.type];
    if (extractor) return extractor(step);

    // Generic fallback: JSON-serialize step data (skip meta keys)
    const data: any = {};
    for (const k of Object.keys(step)) {
        if (!['type', 'status', 'metadata'].includes(k)) data[k] = step[k];
    }
    return Object.keys(data).length ? JSON.stringify(data, null, 2) : '';
}

// ── Public API ──

export function extractMessages(steps: any[]): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Pass 1: find all USER_INPUT positions
    const userIdxs: number[] = [];
    steps.forEach((s, i) => { if (s.type === 'CORTEX_STEP_TYPE_USER_INPUT') userIdxs.push(i); });

    for (let u = 0; u < userIdxs.length; u++) {
        const uIdx = userIdxs[u];
        const nextU = userIdxs[u + 1] ?? steps.length;

        // Add user message
        const userContent = (steps[uIdx].userInput?.userResponse || '').trim();
        if (userContent) messages.push({ stepIndex: uIdx, role: 'user', content: userContent });

        // Find assistant response in this turn range (uIdx..nextU)
        // Priority 1: NOTIFY_USER steps (may be multiple per turn)
        let hasNotify = false;
        for (let i = uIdx + 1; i < nextU; i++) {
            if (steps[i].type !== 'CORTEX_STEP_TYPE_NOTIFY_USER') continue;
            const content = (steps[i].notifyUser?.notificationContent || '').trim();
            if (!content) continue;
            hasNotify = true;
            messages.push({ stepIndex: i, role: 'assistant', content, detailSteps: collectDetails(steps, uIdx, i) });
        }

        // Priority 2: if no NOTIFY_USER, use last PLANNER_RESPONSE with modifiedResponse/response
        if (!hasNotify) {
            for (let i = nextU - 1; i > uIdx; i--) {
                if (steps[i].type !== 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') continue;
                const pr = steps[i].plannerResponse;
                const content = (pr?.modifiedResponse || pr?.response || '').trim();
                if (!content) continue;
                messages.push({ stepIndex: i, role: 'assistant', content, detailSteps: collectDetails(steps, uIdx, i) });
                break;
            }
        }
    }
    return messages;
}

function collectDetails(steps: any[], from: number, to: number): DetailStep[] {
    const details: DetailStep[] = [];
    for (let j = from; j <= to; j++) {
        const c = extractContent(steps[j]);
        if (!c.trim()) continue;
        const meta = STEP_META[steps[j].type] || { label: steps[j].type?.replace('CORTEX_STEP_TYPE_', ''), icon: '❓' };
        details.push({ stepIndex: j, label: meta.label, icon: meta.icon, content: c, defaultOpen: !!meta.open });
    }
    return details;
}

export function extractTitle(steps: any[]): string {
    for (const s of steps) {
        if (s.type === 'CORTEX_STEP_TYPE_USER_INPUT') {
            const line = (s.userInput?.userResponse || '').trim().split('\n')[0];
            if (line) return line.length > 80 ? line.substring(0, 77) + '...' : line;
        }
    }
    return 'Untitled Conversation';
}
