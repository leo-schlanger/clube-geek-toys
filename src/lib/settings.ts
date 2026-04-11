/**
 * Frontend client for the admin settings API.
 *
 * Server-side defaults live in server/api/src/services/settings.service.ts. Frontend should
 * always read via the API rather than hardcoding values.
 */

import { api } from './api-client'

export interface SettingDefinition {
  key: string
  default: unknown
  type: 'number' | 'string' | 'boolean' | 'object'
  description: string
}

export interface SettingsPayload {
  values: Record<string, unknown>
  catalogue: SettingDefinition[]
}

export async function getSettings(): Promise<SettingsPayload | null> {
  const result = await api.get<SettingsPayload>('/settings')
  if (result.error || !result.data) return null
  return result.data
}

export async function updateSettings(updates: Record<string, unknown>): Promise<{ values: Record<string, unknown> } | null> {
  const result = await api.patch<{ values: Record<string, unknown> }>('/settings', { updates })
  if (result.error || !result.data) {
    throw new Error(result.error || 'Falha ao atualizar configurações')
  }
  return result.data
}
