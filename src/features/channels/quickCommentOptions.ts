export interface QuickCommentOption {
  type: number
  name: string
  asset: string
}

const emojiAssets = import.meta.glob<string>('../../assets/channel-emojis/icon-a-*.png', {
  eager: true,
  import: 'default',
  query: '?url',
})

const definitions = [
  ['Laugh', 1],
  ['Happy', 2],
  ['Sexy', 3],
  ['Cool', 4],
  ['Mischievous', 5],
  ['Kiss', 6],
  ['Spit', 7],
  ['Squint', 8],
  ['Cute', 9],
  ['Grimace', 10],
  ['Snicker', 11],
  ['Joy', 12],
  ['Ecstasy', 13],
  ['Surprise', 14],
  ['Tears', 15],
  ['Sweat', 16],
  ['Angel', 17],
  ['Funny', 18],
  ['Awkward', 19],
  ['Thrill', 20],
  ['Cry', 21],
  ['Fretting', 22],
  ['Terror', 23],
  ['Halo', 24],
  ['Shame', 25],
  ['Sleep', 26],
  ['Tired', 27],
  ['Mask', 28],
  ['OK', 29],
  ['All right', 30],
  ['Despise', 31],
  ['Uncomfortable', 32],
  ['Disdain', 33],
  ['Ill', 34],
  ['Mad', 35],
  ['Ghost', 36],
  ['Huff', 37],
  ['Angry', 38],
  ['Unhappy', 39],
  ['Frown', 40],
  ['Broken heart', 41],
  ['Heartbeat', 42],
  ['Okay', 43],
  ['Low', 44],
  ['Nice', 45],
  ['Applause', 46],
  ['Good job', 47],
  ['Hit', 48],
  ['Please', 49],
  ['Bye', 50],
  ['First', 51],
  ['Fist', 52],
  ['Give me five', 53],
  ['Knife', 54],
  ['Hi', 55],
  ['No', 56],
  ['Hold', 57],
  ['Think', 58],
  ['Pig', 59],
  ["Don't listen", 60],
  ["Don't look", 61],
  ['No words', 62],
  ['Monkey', 63],
  ['Bomb', 64],
  ['Sleep', 65],
  ['Cloud', 66],
  ['Rocket', 67],
  ['Ambulance', 68],
  ['Poop', 70],
  ['Eyes', 71],
] as const

function assetFor(type: number): string {
  return emojiAssets[`../../assets/channel-emojis/icon-a-${type}.png`] ?? ''
}

export const QUICK_COMMENT_OPTIONS: QuickCommentOption[] = definitions.map(([name, type]) => ({
  type,
  name,
  asset: assetFor(type),
}))

const optionsByType = new Map(QUICK_COMMENT_OPTIONS.map((option) => [option.type, option]))

export function quickCommentOption(type: number): QuickCommentOption | undefined {
  return optionsByType.get(type)
}

export function quickCommentLabel(type: number): string {
  return quickCommentOption(type)?.name ?? `Reaction ${type}`
}
