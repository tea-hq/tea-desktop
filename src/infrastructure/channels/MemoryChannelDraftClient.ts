import type {
  ChannelDraft,
  ChannelDraftClient,
  ChannelRef,
  SaveChannelDraftRequest,
} from '@/features/channels/contracts'

export class MemoryChannelDraftClient implements ChannelDraftClient {
  private readonly drafts = new Map<string, ChannelDraft>()

  constructor(private readonly now: () => number = Date.now) {}

  async list(accountRef: string): Promise<ChannelDraft[]> {
    return [...this.drafts.values()]
      .filter((draft) => draft.accountRef === accountRef)
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt || left.channelRef.localeCompare(right.channelRef),
      )
      .map((draft) => structuredClone(draft))
  }

  async save(request: SaveChannelDraftRequest): Promise<ChannelDraft> {
    const draft = { ...structuredClone(request), updatedAt: this.now() }
    this.drafts.set(draftKey(request.accountRef, request.channelRef), draft)
    return structuredClone(draft)
  }

  async remove(accountRef: string, channelRef: ChannelRef): Promise<void> {
    this.drafts.delete(draftKey(accountRef, channelRef))
  }
}

function draftKey(accountRef: string, channelRef: ChannelRef): string {
  return `${accountRef}\0${channelRef}`
}
