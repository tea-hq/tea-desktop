export interface TeaSelectOption<TValue extends string | number = string> {
  value: TValue
  label: string
  disabled?: boolean
}
