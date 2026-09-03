export type TaskStatus = 'inbox' | 'inProgress' | 'review' | 'done'

export type TaskPriority = 'high' | 'medium' | 'low'

export type TaskSourceKind = 'plugin' | 'message' | 'local'

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

export interface TaskItem {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  progress: number
  assignee: string
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
