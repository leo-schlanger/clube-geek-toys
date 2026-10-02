import { describe, expect, it } from 'vitest'
import { suggestEmail } from './email-typo'

describe('suggestEmail', () => {
  it.each([
    ['lucas@gamil.com', 'lucas@gmail.com'],
    ['lucas@gmial.com', 'lucas@gmail.com'],
    ['lucas@gmail.con', 'lucas@gmail.com'],
    ['lucas@gmail.co', 'lucas@gmail.com'],
    ['ana@hotmial.com', 'ana@hotmail.com'],
    ['ana@outlok.com', 'ana@outlook.com'],
    ['ana@yahoo.com.bt', 'ana@yahoo.com.br'],
    [' Lucas@GAMIL.com ', 'lucas@gmail.com'],
  ])('%s → %s', (typed, fixed) => {
    expect(suggestEmail(typed)).toBe(fixed)
  })

  it.each(['lucas@gmail.com', 'ana@yahoo.com.br', 'loja@geeketoys.com.br', 'x@empresa.io', 'sem-arroba', 'a@'])(
    'não sugere nada para %s',
    (typed) => {
      expect(suggestEmail(typed)).toBeNull()
    }
  )
})
