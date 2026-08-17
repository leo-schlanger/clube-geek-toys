import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  apiRequest: vi.fn(),
}))

import { api, apiRequest } from './api-client'
import {
  fetchProfile,
  updateProfile,
  uploadProfilePhoto,
  removeProfilePhoto,
  fetchSavedProducts,
  fetchSavedProductIds,
  saveProduct,
  unsaveProduct,
} from './profile'
import type { CustomerProfile } from '../types'

const mockedApi = vi.mocked(api)
const mockedRequest = vi.mocked(apiRequest)

const PROFILE: CustomerProfile = {
  userId: 'u1',
  email: 'laura@example.com',
  fullName: 'Laura',
  phone: null,
  birthDate: null,
  gender: null,
  photoUrl: null,
  address: null,
  marketingConsent: false,
  isMember: false,
  createdAt: null,
  updatedAt: null,
}

beforeEach(() => vi.clearAllMocks())

describe('fetchProfile', () => {
  it('devolve o perfil', async () => {
    mockedApi.get.mockResolvedValue({ data: PROFILE, status: 200 })
    await expect(fetchProfile()).resolves.toEqual(PROFILE)
    expect(mockedApi.get).toHaveBeenCalledWith('/profile')
  })

  it('joga com a mensagem do servidor quando falha', async () => {
    mockedApi.get.mockResolvedValue({ error: 'Sessão expirada', status: 401 })
    await expect(fetchProfile()).rejects.toThrow('Sessão expirada')
  })
})

describe('updateProfile', () => {
  // Partial semantics are the heart of the screen: it saves per section, so the
  // PATCH must not carry keys the person never touched.
  it('envia só as chaves informadas', async () => {
    mockedApi.patch.mockResolvedValue({ data: PROFILE, status: 200 })

    await updateProfile({ phone: '21999998888' })

    expect(mockedApi.patch).toHaveBeenCalledWith('/profile', { phone: '21999998888' })
  })

  it('preserva null, que significa "apagar o campo"', async () => {
    mockedApi.patch.mockResolvedValue({ data: PROFILE, status: 200 })

    await updateProfile({ gender: null, address: null })

    expect(mockedApi.patch).toHaveBeenCalledWith('/profile', { gender: null, address: null })
  })

  it('joga quando o servidor recusa', async () => {
    mockedApi.patch.mockResolvedValue({ error: 'Data inválida', status: 400 })
    await expect(updateProfile({ birthDate: '9999-99-99' })).rejects.toThrow('Data inválida')
  })
})

describe('foto de perfil', () => {
  it('sobe como multipart no campo "photo"', async () => {
    mockedRequest.mockResolvedValue({ data: PROFILE, status: 201 })
    const file = new File(['x'], 'eu.jpg', { type: 'image/jpeg' })

    const result = await uploadProfilePhoto(file)

    expect(result).toEqual({ ok: true, profile: PROFILE })
    const [path, opts] = mockedRequest.mock.calls[0]
    expect(path).toBe('/profile/photo')
    expect(opts?.method).toBe('POST')
    expect((opts?.body as FormData).get('photo')).toBe(file)
  })

  // The photo is optional: failure returns a value instead of breaking the page.
  it('devolve erro sem lançar quando o upload falha', async () => {
    mockedRequest.mockResolvedValue({ error: 'Foto muito grande', status: 400 })

    await expect(
      uploadProfilePhoto(new File(['x'], 'e.jpg', { type: 'image/jpeg' }))
    ).resolves.toEqual({ ok: false, error: 'Foto muito grande' })
  })

  it('remove a foto', async () => {
    mockedApi.delete.mockResolvedValue({ data: PROFILE, status: 200 })
    await removeProfilePhoto()
    expect(mockedApi.delete).toHaveBeenCalledWith('/profile/photo')
  })
})

describe('produtos salvos', () => {
  it('lista os salvos', async () => {
    mockedApi.get.mockResolvedValue({ data: [], status: 200 })
    await expect(fetchSavedProducts()).resolves.toEqual([])
    expect(mockedApi.get).toHaveBeenCalledWith('/profile/saved')
  })

  it('devolve lista vazia quando a chamada falha, sem quebrar a tela', async () => {
    mockedApi.get.mockResolvedValue({ error: 'offline', status: 0 })
    await expect(fetchSavedProducts()).resolves.toEqual([])
    await expect(fetchSavedProductIds()).resolves.toEqual([])
  })

  it('salva com PUT e remove com DELETE', async () => {
    mockedRequest.mockResolvedValue({ status: 204 })

    await expect(saveProduct('p1')).resolves.toBe(true)
    expect(mockedRequest).toHaveBeenCalledWith('/profile/saved/p1', { method: 'PUT' })

    await expect(unsaveProduct('p1')).resolves.toBe(true)
    expect(mockedRequest).toHaveBeenCalledWith('/profile/saved/p1', { method: 'DELETE' })
  })

  it('devolve false quando o servidor recusa, para a UI reverter o otimismo', async () => {
    mockedRequest.mockResolvedValue({ error: 'nope', status: 500 })
    await expect(saveProduct('p1')).resolves.toBe(false)
    await expect(unsaveProduct('p1')).resolves.toBe(false)
  })
})
