import type { FormEvent } from 'react'

export function toUpperCaseInput(event: FormEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const start = input.selectionStart
  const end = input.selectionEnd
  input.value = input.value.toUpperCase()
  if (start !== null && end !== null) {
    input.setSelectionRange(start, end)
  }
}

export function digitsOnly(event: FormEvent<HTMLInputElement>, maxLength: number) {
  const input = event.currentTarget
  input.value = input.value.replace(/\D/g, '').slice(0, maxLength)
}
