export type TaskStatus = 'inbox' | 'inProgress' | 'approval' | 'review' | 'done'

export type TaskPriority = 'high' | 'medium' | 'low'

export type TaskSourceKind = 'plugin' | 'message' | 'local'

export type TaskCollaboratorKind = 'human' | 'agent'

export type TaskAgentProvider = 'claude' | 'codex'

export interface TaskActor {
  id: string
  kind: TaskCollaboratorKind
  name: string
  provider?: TaskAgentProvider
}

export interface TaskSource {
  kind: TaskSourceKind
  name: string
  context: string
}

export interface TaskComment {
  id: string
  author: TaskActor
  body: string
  createdAtLabel: string
}

export interface TaskApprovalOption {
  id: string
  label: string
  description?: string
}

interface TaskApprovalQuestionBase {
  id: string
  prompt: string
  description?: string
  allowCustomReply?: boolean
  customReplyPlaceholder?: string
}

export interface TaskApprovalSingleQuestion extends TaskApprovalQuestionBase {
  kind: 'single'
  options: TaskApprovalOption[]
}

export interface TaskApprovalBooleanQuestion extends TaskApprovalQuestionBase {
  kind: 'boolean'
}

export interface TaskApprovalMultipleQuestion extends TaskApprovalQuestionBase {
  kind: 'multiple'
  options: TaskApprovalOption[]
}

export interface TaskApprovalTextQuestion extends TaskApprovalQuestionBase {
  kind: 'text'
  placeholder: string
}

export type TaskApprovalQuestion =
  | TaskApprovalSingleQuestion
  | TaskApprovalBooleanQuestion
  | TaskApprovalMultipleQuestion
  | TaskApprovalTextQuestion

export type TaskApprovalAnswer =
  | { questionId: string; kind: 'single'; optionIds: string[] }
  | { questionId: string; kind: 'boolean'; value: boolean }
  | { questionId: string; kind: 'multiple'; optionIds: string[] }
  | { questionId: string; kind: 'text'; value: string }
  | { questionId: string; kind: 'custom'; value: string }

export interface TaskApprovalSubmission {
  requestId: string
  answer: TaskApprovalAnswer
}

export interface TaskApprovalRequest {
  id: string
  requester: TaskActor
  title: string
  description: string
  createdAtLabel: string
  status: 'pending' | 'submitted'
  question: TaskApprovalQuestion
  response?: TaskApprovalSubmission
  respondedAtLabel?: string
}

export interface TaskCollaborator extends TaskActor {
  role: string
  lead: boolean
}

export interface TaskItem {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  progress: number
  collaborators: TaskCollaborator[]
  dueLabel: string
  tags: string[]
  source: TaskSource
  approval?: TaskApprovalRequest
  comments: TaskComment[]
  updatedAtLabel: string
}

export interface NewLocalTask {
  title: string
  priority: TaskPriority
  dueLabel: string
}
