import { computed, ref, type Ref } from 'vue'
import type { ComposerTranslation } from 'vue-i18n'

import type { NewLocalTask, TaskItem, TaskSourceKind, TaskStatus } from './contracts'
import { createTaskDemoData } from './taskDemoData'

export type TaskViewMode = 'list' | 'board'
export type TaskSourceFilter = 'all' | TaskSourceKind

export const TASK_STATUSES: TaskStatus[] = ['inbox', 'inProgress', 'review', 'done']

export interface TaskDemoModel {
  tasks: Ref<TaskItem[]>
  viewMode: Ref<TaskViewMode>
  sourceFilter: Ref<TaskSourceFilter>
  selectedTaskId: Ref<string | null>
  createDialogOpen: Ref<boolean>
  visibleTasks: Readonly<Ref<TaskItem[]>>
  selectedTask: Readonly<Ref<TaskItem | null>>
  selectTask: (taskId: string) => void
  closeTask: () => void
  updateStatus: (taskId: string, status: TaskStatus) => void
  addTag: (taskId: string, tag: string) => void
  removeTag: (taskId: string, tag: string) => void
  addComment: (taskId: string, body: string) => void
  createLocalTask: (input: NewLocalTask) => void
}

export function useTaskDemo(searchQuery: Ref<string>, t: ComposerTranslation): TaskDemoModel {
  const tasks = ref<TaskItem[]>(createTaskDemoData(t))
  const viewMode = ref<TaskViewMode>('list')
  const sourceFilter = ref<TaskSourceFilter>('all')
  const selectedTaskId = ref<string | null>(null)
  const createDialogOpen = ref(false)

  const visibleTasks = computed(() => {
    const query = searchQuery.value.trim().toLocaleLowerCase()
    return tasks.value.filter((task) => {
      if (sourceFilter.value !== 'all' && task.source.kind !== sourceFilter.value) return false
      if (!query) return true
      return [
        task.id,
        task.title,
        task.description,
        task.source.name,
        task.source.context,
        ...task.collaborators.flatMap((collaborator) => [
          collaborator.name,
          collaborator.role,
          collaborator.provider ?? '',
        ]),
        ...task.tags,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query)
    })
  })

  const selectedTask = computed(
    () => tasks.value.find((task) => task.id === selectedTaskId.value) ?? null,
  )

  function updateTask(taskId: string, update: (task: TaskItem) => TaskItem): void {
    tasks.value = tasks.value.map((task) => (task.id === taskId ? update(task) : task))
  }

  function selectTask(taskId: string): void {
    selectedTaskId.value = taskId
  }

  function closeTask(): void {
    selectedTaskId.value = null
  }

  function updateStatus(taskId: string, status: TaskStatus): void {
    updateTask(taskId, (task) => ({
      ...task,
      status,
      progress: status === 'done' ? 100 : task.progress,
      updatedAtLabel: t('tasks.dates.justNow'),
    }))
  }

  function addTag(taskId: string, value: string): void {
    const tag = value.trim()
    if (!tag) return
    updateTask(taskId, (task) =>
      task.tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())
        ? task
        : { ...task, tags: [...task.tags, tag] },
    )
  }

  function removeTag(taskId: string, tag: string): void {
    updateTask(taskId, (task) => ({
      ...task,
      tags: task.tags.filter((item) => item !== tag),
    }))
  }

  function addComment(taskId: string, value: string): void {
    const body = value.trim()
    if (!body) return
    updateTask(taskId, (task) => ({
      ...task,
      comments: [
        ...task.comments,
        {
          id: `comment-local-${task.comments.length + 1}`,
          author: t('tasks.people.you'),
          body,
          createdAtLabel: t('tasks.dates.justNow'),
        },
      ],
      updatedAtLabel: t('tasks.dates.justNow'),
    }))
  }

  function createLocalTask(input: NewLocalTask): void {
    const index =
      Math.max(
        0,
        ...tasks.value
          .filter((task) => task.source.kind === 'local')
          .map((task) => Number(task.id.split('-').at(-1)) || 0),
      ) + 1
    const task: TaskItem = {
      id: `LOCAL-${String(index).padStart(3, '0')}`,
      title: input.title.trim(),
      description: t('tasks.create.defaultDescription'),
      status: 'inbox',
      priority: input.priority,
      progress: 0,
      collaborators: [
        {
          id: 'you',
          kind: 'human',
          name: t('tasks.people.you'),
          role: t('tasks.roles.productOwner'),
          lead: true,
        },
      ],
      dueLabel: input.dueLabel || t('tasks.dates.noDate'),
      tags: [],
      source: {
        kind: 'local',
        name: t('tasks.sources.localWorkspace'),
        context: t('tasks.create.sourceContext'),
      },
      comments: [],
      updatedAtLabel: t('tasks.dates.justNow'),
    }
    tasks.value = [task, ...tasks.value]
    createDialogOpen.value = false
    selectedTaskId.value = task.id
  }

  return {
    tasks,
    viewMode,
    sourceFilter,
    selectedTaskId,
    createDialogOpen,
    visibleTasks,
    selectedTask,
    selectTask,
    closeTask,
    updateStatus,
    addTag,
    removeTag,
    addComment,
    createLocalTask,
  }
}
