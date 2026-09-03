import { describe, expect, it } from 'vitest'

import { createNodeYunxinSdkFactory } from './yunxinNode'

describe('createNodeYunxinSdkFactory', () => {
  it('creates the official ESM SDK without browser globals or network access', async () => {
    const sdk = await createNodeYunxinSdkFactory().create('test-app-key')

    expect(typeof sdk.V2NIMLoginService.login).toBe('function')
    expect(typeof sdk.V2NIMConversationService.getConversationList).toBe('function')
    expect(typeof sdk.V2NIMMessageService.sendMessage).toBe('function')
    expect(typeof sdk.V2NIMMessageService.addQuickComment).toBe('function')
    expect(typeof sdk.V2NIMMessageService.removeQuickComment).toBe('function')
    expect(typeof sdk.V2NIMMessageService.getQuickCommentList).toBe('function')

    const message = {
      conversationId: 'p2p-account-a',
      messageClientId: 'client-message',
      messageServerId: 'server-message',
      messageType: 0,
      senderId: 'account-a',
      receiverId: 'account-b',
      createTime: 1,
      isSelf: false,
      sendingState: 1,
      messageStatus: { errorCode: 0 },
      conversationType: 1,
    }
    await expect(sdk.V2NIMMessageService.addQuickComment(message, 1)).rejects.not.toMatchObject({
      code: 191001,
      detail: { reason: 'V2NIMMessageLogUtil is not registered' },
    })

    await sdk.destroy()
  })
})
