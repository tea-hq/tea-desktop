import { describe, expect, it } from 'vitest'

import { parseTaskNotification } from './taskNotification'

describe('parseTaskNotification', () => {
  it('parses background task fields and result text', () => {
    expect(
      parseTaskNotification(`<task-notification>
<task-id>task-1</task-id>
<tool-use-id>call-1</tool-use-id>
<output-file>/tmp/task-1.output</output-file>
<status>completed</status>
<summary>Background command "npm test" completed</summary>
<result>Tests passed.</result>
</task-notification>`),
    ).toEqual({
      taskId: 'task-1',
      toolUseId: 'call-1',
      outputFile: '/tmp/task-1.output',
      status: 'completed',
      summary: 'Background command "npm test" completed',
      resultText: 'Tests passed.',
    })
  })

  it('accepts entity-encoded notification envelopes', () => {
    expect(
      parseTaskNotification(
        '&lt;task-notification&gt;&lt;task-id&gt;task-2&lt;/task-id&gt;&lt;/task-notification&gt;',
      ),
    ).toMatchObject({ taskId: 'task-2', resultText: '' })
  })

  it('does not classify ordinary XML or an empty notification', () => {
    expect(parseTaskNotification('<note><value>keep</value></note>')).toBeNull()
    expect(parseTaskNotification('<task-notification></task-notification>')).toBeNull()
  })
})
