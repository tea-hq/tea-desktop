export type TaskStatus = 'inbox' | 'inProgress' | 'review' | 'done'

export type TaskPriority = 'high' | 'medium' | 'low'

export type TaskSourceKind = 'plugin' | 'message' | 'local'

export type TaskCollaboratorKind = 'human' | 'agent'

export type TaskAgentProvider = 'claude' | 'codex'

export interface TaskSource {
  kind: TaskSourceKind
  name: string
  context: string
}

export interface TaskComment {
  id: string
  author: string
  body: string
  createdAtLabel: string
}

export interface TaskCollaborator {
  id: string
  kind: TaskCollaboratorKind
  name: string
  role: string
  lead: boolean
  provider?: TaskAgentProvider
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
  comments: TaskComment[]
  updatedAtLabel: string
}

export interface NewLocalTask {
  title: string
  priority: TaskPriority
  dueLabel: string
}
