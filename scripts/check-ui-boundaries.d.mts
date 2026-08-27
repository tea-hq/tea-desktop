export interface UiViolation {
  kind: 'library-import' | 'native-control' | 'visual-class'
  value: string
  line: number
}

export function inspectUiSource(filename: string, source: string): UiViolation[]
