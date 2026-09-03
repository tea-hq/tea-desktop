import type { ComposerTranslation } from 'vue-i18n'

import type { TaskAgentProvider, TaskCollaborator, TaskItem } from './contracts'

function human(id: string, name: string, role: string, lead = false): TaskCollaborator {
  return { id, kind: 'human', name, role, lead }
}

function agent(
  id: string,
  provider: TaskAgentProvider,
  role: string,
  lead = false,
): TaskCollaborator {
  return {
    id,
    kind: 'agent',
    name: provider === 'claude' ? 'Claude' : 'Codex',
    role,
    lead,
    provider,
  }
}

export function createTaskDemoData(t: ComposerTranslation): TaskItem[] {
  return [
    {
      id: 'MSG-1042',
      title: t('tasks.mock.onboarding.title'),
      description: t('tasks.mock.onboarding.description'),
      status: 'inProgress',
      priority: 'high',
      progress: 62,
      collaborators: [
        agent('claude-research', 'claude', t('tasks.roles.researcher'), true),
        human('anna', 'Anna', t('tasks.roles.productOwner')),
      ],
      dueLabel: t('tasks.dates.today'),
      tags: ['Customer', 'Onboarding'],
      source: {
        kind: 'message',
        name: 'Customer feedback',
        context: t('tasks.mock.onboarding.source'),
      },
      comments: [
        {
          id: 'comment-onboarding-1',
          author: 'Anna',
          body: t('tasks.mock.onboarding.comment'),
          createdAtLabel: t('tasks.dates.minutesAgo', { count: 18 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.minutesAgo', { count: 18 }),
    },
    {
      id: 'GH-287',
      title: t('tasks.mock.avatar.title'),
      description: t('tasks.mock.avatar.description'),
      status: 'inProgress',
      priority: 'medium',
      progress: 74,
      collaborators: [
        agent('codex-builder', 'codex', t('tasks.roles.implementation'), true),
        agent('claude-review', 'claude', t('tasks.roles.reviewer')),
        human('you', t('tasks.people.you'), t('tasks.roles.productOwner')),
      ],
      dueLabel: t('tasks.dates.tomorrow'),
      tags: ['Frontend', 'Release'],
      source: {
        kind: 'plugin',
        name: 'GitHub',
        context: 'tea-desktop #287',
      },
      comments: [
        {
          id: 'comment-avatar-1',
          author: 'Lin',
          body: t('tasks.mock.avatar.comment'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 2 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 2 }),
    },
    {
      id: 'LOCAL-018',
      title: t('tasks.mock.demo.title'),
      description: t('tasks.mock.demo.description'),
      status: 'inProgress',
      priority: 'high',
      progress: 46,
      collaborators: [
        human('you', t('tasks.people.you'), t('tasks.roles.productOwner'), true),
        agent('claude-producer', 'claude', t('tasks.roles.demoProducer')),
      ],
      dueLabel: t('tasks.dates.today'),
      tags: ['Demo', 'Product'],
      source: {
        kind: 'local',
        name: t('tasks.sources.localWorkspace'),
        context: t('tasks.mock.demo.source'),
      },
      comments: [],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 3 }),
    },
    {
      id: 'MON-404',
      title: t('tasks.mock.heartbeat.title'),
      description: t('tasks.mock.heartbeat.description'),
      status: 'inbox',
      priority: 'high',
      progress: 12,
      collaborators: [
        agent('codex-operations', 'codex', t('tasks.roles.operations'), true),
        human('maya', 'Maya', t('tasks.roles.reviewer')),
      ],
      dueLabel: t('tasks.dates.sep4'),
      tags: ['Reliability'],
      source: {
        kind: 'plugin',
        name: 'Cloud Monitor',
        context: t('tasks.mock.heartbeat.source'),
      },
      comments: [],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 5 }),
    },
    {
      id: 'LOCAL-012',
      title: t('tasks.mock.permissions.title'),
      description: t('tasks.mock.permissions.description'),
      status: 'inbox',
      priority: 'medium',
      progress: 20,
      collaborators: [
        agent('claude-policy', 'claude', t('tasks.roles.securityReviewer'), true),
        human('iris', 'Iris', t('tasks.roles.productOwner')),
      ],
      dueLabel: t('tasks.dates.nextMonday'),
      tags: ['Copy', 'Security'],
      source: {
        kind: 'local',
        name: t('tasks.sources.localWorkspace'),
        context: t('tasks.mock.permissions.source'),
      },
      comments: [],
      updatedAtLabel: t('tasks.dates.yesterday'),
    },
    {
      id: 'JIRA-681',
      title: t('tasks.mock.contract.title'),
      description: t('tasks.mock.contract.description'),
      status: 'review',
      priority: 'high',
      progress: 90,
      collaborators: [
        agent('claude-architect', 'claude', t('tasks.roles.architect'), true),
        agent('codex-validator', 'codex', t('tasks.roles.validator')),
        human('you', t('tasks.people.you'), t('tasks.roles.productOwner')),
      ],
      dueLabel: t('tasks.dates.sep4'),
      tags: ['Architecture', 'API'],
      source: {
        kind: 'plugin',
        name: 'Jira Cloud',
        context: 'Platform / JIRA-681',
      },
      comments: [
        {
          id: 'comment-contract-1',
          author: 'Chen',
          body: t('tasks.mock.contract.comment'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 1 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 1 }),
    },
    {
      id: 'MSG-988',
      title: t('tasks.mock.planning.title'),
      description: t('tasks.mock.planning.description'),
      status: 'review',
      priority: 'medium',
      progress: 84,
      collaborators: [
        agent('claude-planner', 'claude', t('tasks.roles.planner'), true),
        human('luo', 'Luo', t('tasks.roles.productOwner')),
      ],
      dueLabel: t('tasks.dates.sep6'),
      tags: ['Planning'],
      source: {
        kind: 'message',
        name: 'Product planning',
        context: t('tasks.mock.planning.source'),
      },
      comments: [],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 4 }),
    },
    {
      id: 'MSG-971',
      title: t('tasks.mock.retrospective.title'),
      description: t('tasks.mock.retrospective.description'),
      status: 'done',
      priority: 'low',
      progress: 100,
      collaborators: [human('chen', 'Chen', t('tasks.roles.communications'), true)],
      dueLabel: t('tasks.dates.sep2'),
      tags: ['Launch'],
      source: {
        kind: 'message',
        name: 'Launch room',
        context: t('tasks.mock.retrospective.source'),
      },
      comments: [],
      updatedAtLabel: t('tasks.dates.yesterday'),
    },
  ]
}
