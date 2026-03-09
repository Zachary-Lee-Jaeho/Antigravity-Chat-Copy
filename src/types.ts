/**
 * types.ts — Shared type definitions for conversation data.
 *
 * Single source of truth for step types, step shapes, and conversation structure.
 * Both the protobuf parser and the markdown extractor import from here.
 */

// ── Step type enum ──
// Canonical string names. The protobuf parser maps numeric IDs → these strings.

export const STEP_TYPE = {
    USER_INPUT: 'USER_INPUT',
    PLANNER_RESPONSE: 'PLANNER_RESPONSE',
    NOTIFY_USER: 'NOTIFY_USER',
    CODE_ACTION: 'CODE_ACTION',
    CODE_ACKNOWLEDGEMENT: 'CODE_ACKNOWLEDGEMENT',
    RUN_COMMAND: 'RUN_COMMAND',
    COMMAND_STATUS: 'COMMAND_STATUS',
    ERROR_MESSAGE: 'ERROR_MESSAGE',
    TASK_BOUNDARY: 'TASK_BOUNDARY',
    EPHEMERAL_MESSAGE: 'EPHEMERAL_MESSAGE',
    VIEW_FILE: 'VIEW_FILE',
    VIEW_FILE_OUTLINE: 'VIEW_FILE_OUTLINE',
    VIEW_CODE_ITEM: 'VIEW_CODE_ITEM',
    VIEW_CONTENT_CHUNK: 'VIEW_CONTENT_CHUNK',
    LIST_DIRECTORY: 'LIST_DIRECTORY',
    GREP_SEARCH: 'GREP_SEARCH',
    FIND: 'FIND',
    SEARCH_WEB: 'SEARCH_WEB',
    READ_URL_CONTENT: 'READ_URL_CONTENT',
    BROWSER_ACTION: 'BROWSER_ACTION',
    GENERATE_IMAGE: 'GENERATE_IMAGE',
    CONVERSATION_HISTORY: 'CONVERSATION_HISTORY',
    KNOWLEDGE_ARTIFACTS: 'KNOWLEDGE_ARTIFACTS',
    CHECKPOINT: 'CHECKPOINT',
} as const;

export type StepType = typeof STEP_TYPE[keyof typeof STEP_TYPE];

// ── Step data shapes ──

export interface ToolCall {
    id: string;
    name: string;
    args?: string;
}

export interface PlannerResponse {
    response?: string;
    thinking?: string;
    modifiedResponse?: string;
    toolCalls?: ToolCall[];
}

export interface CodeAction {
    filePath?: string;
    description?: string;
    instruction?: string;
    diff?: string;
}

export interface RunCommand {
    commandLine?: string;
    cwd?: string;
    exitCode?: number;
    combinedOutput?: { full: string };
}

export interface CommandStatus {
    output?: string;
    exitCode?: number;
}

export interface TaskBoundary {
    taskName?: string;
    mode?: string;
    taskSummary?: string;
    taskStatus?: string;
}

export interface FileContent {
    filePath?: string;
    content?: string;
}

export interface TextContent {
    content: string;
}

export interface UrlContent {
    url?: string;
    content?: string;
}

export interface ErrorContent {
    message: string;
}

// ── Step ──

export interface Step {
    type: string;                              // StepType or 'UNKNOWN_<n>'
    status?: number;
    timestamp?: number;
    stepId?: string;
    // Step-specific data (only one is set per step)
    userInput?: { userResponse: string };
    plannerResponse?: PlannerResponse;
    notifyUser?: { notificationContent: string };
    codeAction?: CodeAction;
    codeAcknowledgement?: TextContent;
    runCommand?: RunCommand;
    commandStatus?: CommandStatus;
    errorMessage?: ErrorContent;
    taskBoundary?: TaskBoundary;
    ephemeralMessage?: TextContent;
    viewFile?: FileContent;
    listDirectory?: TextContent;
    searchResult?: TextContent;
    searchWeb?: TextContent;
    readUrl?: UrlContent;
    conversationHistory?: TextContent;
    knowledgeArtifacts?: TextContent;
    genericData?: TextContent;
}

// ── Conversation ──

export interface WorkspaceInfo {
    workspaceFolderAbsoluteUri: string;
}

export interface TrajectoryMetadata {
    workspaces?: WorkspaceInfo[];
}

export interface Trajectory {
    id: string;
    steps: Step[];
    metadata: TrajectoryMetadata;
}

// ── Message (output of extractor) ──

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
