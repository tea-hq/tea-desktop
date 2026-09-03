import type { TaskActor, TaskAgentProvider, TaskCollaborator, TaskItem } from './contracts'

type TaskTranslation = (key: string, named?: Record<string, string | number>) => string

function humanActor(id: string, name: string): TaskActor {
  return { id, kind: 'human', name }
}

function agentActor(id: string, provider: TaskAgentProvider): TaskActor {
  return {
    id,
    kind: 'agent',
    name: provider === 'claude' ? 'Claude' : 'Codex',
    provider,
  }
}

function human(id: string, name: string, role: string, lead = false): TaskCollaborator {
  return { ...humanActor(id, name), role, lead }
}

function agent(
  id: string,
  provider: TaskAgentProvider,
  role: string,
  lead = false,
): TaskCollaborator {
  return { ...agentActor(id, provider), role, lead }
}

export function createTaskDemoData(t: TaskTranslation): TaskItem[] {
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
          author: humanActor('anna', 'Anna'),
          body: t('tasks.mock.onboarding.comments.customerExamples'),
          createdAtLabel: t('tasks.dates.minutesAgo', { count: 18 }),
        },
        {
          id: 'comment-onboarding-2',
          author: agentActor('claude-research', 'claude'),
          body: t('tasks.mock.onboarding.comments.researchSummary'),
          createdAtLabel: t('tasks.dates.minutesAgo', { count: 9 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.minutesAgo', { count: 9 }),
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
          author: agentActor('codex-builder', 'codex'),
          body: t('tasks.mock.avatar.comments.implementation'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 2 }),
        },
        {
          id: 'comment-avatar-2',
          author: agentActor('claude-review', 'claude'),
          body: t('tasks.mock.avatar.comments.review'),
          createdAtLabel: t('tasks.dates.minutesAgo', { count: 44 }),
        },
        {
          id: 'comment-avatar-3',
          author: humanActor('you', t('tasks.people.you')),
          body: t('tasks.mock.avatar.comments.product'),
          createdAtLabel: t('tasks.dates.minutesAgo', { count: 26 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.minutesAgo', { count: 26 }),
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
      comments: [
        {
          id: 'comment-demo-1',
          author: humanActor('you', t('tasks.people.you')),
          body: t('tasks.mock.demo.comments.scope'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 3 }),
        },
        {
          id: 'comment-demo-2',
          author: agentActor('claude-producer', 'claude'),
          body: t('tasks.mock.demo.comments.walkthrough'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 2 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 2 }),
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
      comments: [
        {
          id: 'comment-heartbeat-1',
          author: agentActor('codex-operations', 'codex'),
          body: t('tasks.mock.heartbeat.comments.signal'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 5 }),
        },
        {
          id: 'comment-heartbeat-2',
          author: humanActor('maya', 'Maya'),
          body: t('tasks.mock.heartbeat.comments.threshold'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 4 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 4 }),
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
      comments: [
        {
          id: 'comment-permissions-1',
          author: agentActor('claude-policy', 'claude'),
          body: t('tasks.mock.permissions.comments.audit'),
          createdAtLabel: t('tasks.dates.yesterday'),
        },
        {
          id: 'comment-permissions-2',
          author: humanActor('iris', 'Iris'),
          body: t('tasks.mock.permissions.comments.copy'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 7 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 7 }),
    },
    {
      id: 'JIRA-681',
      title: t('tasks.mock.contract.title'),
      description: t('tasks.mock.contract.description'),
      status: 'approval',
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
      approval: {
        id: 'approval-contract-v1',
        requester: agentActor('claude-architect', 'claude'),
        title: t('tasks.mock.contract.approval.title'),
        description: t('tasks.mock.contract.approval.description'),
        createdAtLabel: t('tasks.dates.minutesAgo', { count: 6 }),
        status: 'pending',
        question: {
          id: 'source-contract',
          kind: 'single',
          prompt: t('tasks.mock.contract.approval.sourceContract.prompt'),
          description: t('tasks.mock.contract.approval.sourceContract.description'),
          allowCustomReply: true,
          customReplyPlaceholder: t(
            'tasks.mock.contract.approval.sourceContract.customReplyPlaceholder',
          ),
          options: [
            {
              id: 'shared-core',
              label: t('tasks.mock.contract.approval.sourceContract.sharedCore'),
              description: t('tasks.mock.contract.approval.sourceContract.sharedCoreDescription'),
            },
            {
              id: 'source-specific',
              label: t('tasks.mock.contract.approval.sourceContract.sourceSpecific'),
              description: t(
                'tasks.mock.contract.approval.sourceContract.sourceSpecificDescription',
              ),
            },
            {
              id: 'defer-contract',
              label: t('tasks.mock.contract.approval.sourceContract.defer'),
              description: t('tasks.mock.contract.approval.sourceContract.deferDescription'),
            },
          ],
        },
      },
      comments: [
        {
          id: 'comment-contract-1',
          author: agentActor('claude-architect', 'claude'),
          body: t('tasks.mock.contract.comments.sourceRef'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 1 }),
        },
        {
          id: 'comment-contract-2',
          author: agentActor('codex-validator', 'codex'),
          body: t('tasks.mock.contract.comments.validation'),
          createdAtLabel: t('tasks.dates.minutesAgo', { count: 38 }),
        },
        {
          id: 'comment-contract-3',
          author: humanActor('you', t('tasks.people.you')),
          body: t('tasks.mock.contract.comments.decision'),
          createdAtLabel: t('tasks.dates.minutesAgo', { count: 21 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.minutesAgo', { count: 21 }),
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
      comments: [
        {
          id: 'comment-planning-1',
          author: agentActor('claude-planner', 'claude'),
          body: t('tasks.mock.planning.comments.summary'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 4 }),
        },
        {
          id: 'comment-planning-2',
          author: humanActor('luo', 'Luo'),
          body: t('tasks.mock.planning.comments.owner'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 3 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 3 }),
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
      comments: [
        {
          id: 'comment-retrospective-1',
          author: humanActor('chen', 'Chen'),
          body: t('tasks.mock.retrospective.comments.published'),
          createdAtLabel: t('tasks.dates.yesterday'),
        },
        {
          id: 'comment-retrospective-2',
          author: agentActor('codex-release-notes', 'codex'),
          body: t('tasks.mock.retrospective.comments.followUps'),
          createdAtLabel: t('tasks.dates.hoursAgo', { count: 20 }),
        },
      ],
      updatedAtLabel: t('tasks.dates.hoursAgo', { count: 20 }),
    },
  ]
}
