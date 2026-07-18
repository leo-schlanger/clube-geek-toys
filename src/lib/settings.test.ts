/**
 * Settings Client — Unit Tests
 *
 * Tests getSettings() and updateSettings() API wrappers,
 * mocking the api-client module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the api-client module before importing settings
vi.mock('./api-client', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

import { getSettings, updateSettings } from './settings'
import type { SettingsPayload, SettingDefinition } from './settings'
import { api } from './api-client'

const mockGet = vi.mocked(api.get)
const mockPatch = vi.mocked(api.patch)

beforeEach(() => {
  vi.clearAllMocks()
})

// =============================================================================
// 1. getSettings()
// =============================================================================

describe('getSettings', () => {
  const samplePayload: SettingsPayload = {
    values: {
      pix_enabled: true,
      max_members: 500,
      welcome_message: 'Bem-vindo!',
    },
    catalogue: [
      {
        key: 'pix_enabled',
        default: false,
        type: 'boolean',
        description: 'Enable PIX payments',
      },
      {
        key: 'max_members',
        default: 100,
        type: 'number',
        description: 'Max members allowed',
      },
      {
        key: 'welcome_message',
        default: 'Welcome',
        type: 'string',
        description: 'Welcome message',
      },
    ],
  }

  it('should return settings payload on success', async () => {
    mockGet.mockResolvedValue({
      data: samplePayload,
      status: 200,
    })

    const result = await getSettings()
    expect(result).toEqual(samplePayload)
    expect(mockGet).toHaveBeenCalledWith('/settings')
  })

  it('should return null when API returns an error', async () => {
    mockGet.mockResolvedValue({
      error: 'Unauthorized',
      status: 401,
    })

    const result = await getSettings()
    expect(result).toBeNull()
  })

  it('should return null when API returns no data', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      status: 200,
    })

    const result = await getSettings()
    expect(result).toBeNull()
  })

  it('should return null when API returns both error and data', async () => {
    mockGet.mockResolvedValue({
      data: samplePayload,
      error: 'Partial failure',
      status: 500,
    })

    const result = await getSettings()
    expect(result).toBeNull()
  })

  it('should call api.get with /settings path', async () => {
    mockGet.mockResolvedValue({ data: samplePayload, status: 200 })

    await getSettings()
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/settings')
  })
})

// =============================================================================
// 2. updateSettings()
// =============================================================================

describe('updateSettings', () => {
  const updatedValues = {
    values: { pix_enabled: false, max_members: 1000 },
  }

  it('should return updated values on success', async () => {
    mockPatch.mockResolvedValue({
      data: updatedValues,
      status: 200,
    })

    const result = await updateSettings({ pix_enabled: false, max_members: 1000 })
    expect(result).toEqual(updatedValues)
  })

  it('should call api.patch with /settings and updates payload', async () => {
    mockPatch.mockResolvedValue({
      data: updatedValues,
      status: 200,
    })

    const updates = { pix_enabled: false }
    await updateSettings(updates)
    expect(mockPatch).toHaveBeenCalledWith('/settings', { updates })
  })

  it('should throw when API returns an error string', async () => {
    mockPatch.mockResolvedValue({
      error: 'Forbidden',
      status: 403,
    })

    await expect(updateSettings({ foo: 'bar' })).rejects.toThrow('Forbidden')
  })

  it('should throw with default message when error is empty and data is missing', async () => {
    mockPatch.mockResolvedValue({
      error: '',
      data: undefined,
      status: 500,
    })

    await expect(updateSettings({ foo: 'bar' })).rejects.toThrow(
      'Falha ao atualizar configurações'
    )
  })

  it('should throw when API returns error with data present', async () => {
    mockPatch.mockResolvedValue({
      data: updatedValues,
      error: 'Validation failed',
      status: 422,
    })

    await expect(updateSettings({ bad: 'data' })).rejects.toThrow('Validation failed')
  })

  it('should handle empty updates object', async () => {
    mockPatch.mockResolvedValue({
      data: { values: {} },
      status: 200,
    })

    const result = await updateSettings({})
    expect(result).toEqual({ values: {} })
    expect(mockPatch).toHaveBeenCalledWith('/settings', { updates: {} })
  })
})

// =============================================================================
// 3. Type exports
// =============================================================================

describe('Type exports', () => {
  it('should export SettingDefinition interface fields', () => {
    const def: SettingDefinition = {
      key: 'test',
      default: true,
      type: 'boolean',
      description: 'Test setting',
    }
    expect(def.key).toBe('test')
    expect(def.default).toBe(true)
    expect(def.type).toBe('boolean')
    expect(def.description).toBe('Test setting')
  })

  it('should support all SettingDefinition type values', () => {
    const types: SettingDefinition['type'][] = ['number', 'string', 'boolean', 'object']
    expect(types).toHaveLength(4)
  })

  it('should export SettingsPayload interface', () => {
    const payload: SettingsPayload = {
      values: { a: 1 },
      catalogue: [],
    }
    expect(payload.values).toBeDefined()
    expect(payload.catalogue).toEqual([])
  })
})
