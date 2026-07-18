/**
 * Subdomain Utilities — Unit Tests
 *
 * Tests subdomain detection, app mode resolution, role-based routing,
 * and cross-subdomain URL generation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AppMode } from './subdomain'

// We need to dynamically import the module after setting up window.location mocks
// because getSubdomain() reads window.location at call time.

function mockLocation(overrides: Partial<Location>) {
  const base: Partial<Location> = {
    hostname: 'localhost',
    protocol: 'https:',
    port: '',
    search: '',
    ...overrides,
  }
  Object.defineProperty(window, 'location', {
    value: base,
    writable: true,
    configurable: true,
  })
}

// Reset module cache between tests so the module re-reads window.location
let mod: typeof import('./subdomain')

beforeEach(async () => {
  vi.resetModules()
})

async function loadModule() {
  mod = await import('./subdomain')
  return mod
}

// =============================================================================
// 1. getSubdomain()
// =============================================================================

describe('getSubdomain', () => {
  it('should return empty string for localhost with no query param', async () => {
    mockLocation({ hostname: 'localhost', search: '' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('')
  })

  it('should return empty string for 127.0.0.1 with no query param', async () => {
    mockLocation({ hostname: '127.0.0.1', search: '' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('')
  })

  it('should return subdomain query param on localhost', async () => {
    mockLocation({ hostname: 'localhost', search: '?subdomain=adm' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('adm')
  })

  it('should return subdomain query param "admin" on 127.0.0.1', async () => {
    mockLocation({ hostname: '127.0.0.1', search: '?subdomain=admin' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('admin')
  })

  it('should return first part of hostname for production domain', async () => {
    mockLocation({ hostname: 'club.geeketoys.com.br', search: '' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('club')
  })

  it('should return "adm" for adm.geeketoys.com.br', async () => {
    mockLocation({ hostname: 'adm.geeketoys.com.br', search: '' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('adm')
  })

  it('should return "admin" for admin.geeketoys.com.br', async () => {
    mockLocation({ hostname: 'admin.geeketoys.com.br', search: '' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('admin')
  })

  it('should lowercase the subdomain', async () => {
    mockLocation({ hostname: 'ADM.geeketoys.com.br', search: '' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('adm')
  })

  it('should return empty for single-part hostname', async () => {
    mockLocation({ hostname: 'singlehost', search: '' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('')
  })

  it('should return first part for two-part hostname', async () => {
    mockLocation({ hostname: 'example.com', search: '' })
    const { getSubdomain } = await loadModule()
    expect(getSubdomain()).toBe('example')
  })
})

// =============================================================================
// 2. isAdminSubdomain()
// =============================================================================

describe('isAdminSubdomain', () => {
  it('should return true for "adm" subdomain', async () => {
    mockLocation({ hostname: 'adm.geeketoys.com.br', search: '' })
    const { isAdminSubdomain } = await loadModule()
    expect(isAdminSubdomain()).toBe(true)
  })

  it('should return true for "admin" subdomain', async () => {
    mockLocation({ hostname: 'admin.geeketoys.com.br', search: '' })
    const { isAdminSubdomain } = await loadModule()
    expect(isAdminSubdomain()).toBe(true)
  })

  it('should return false for "club" subdomain', async () => {
    mockLocation({ hostname: 'club.geeketoys.com.br', search: '' })
    const { isAdminSubdomain } = await loadModule()
    expect(isAdminSubdomain()).toBe(false)
  })

  it('should return false for localhost without subdomain param', async () => {
    mockLocation({ hostname: 'localhost', search: '' })
    const { isAdminSubdomain } = await loadModule()
    expect(isAdminSubdomain()).toBe(false)
  })

  it('should return true for localhost with ?subdomain=adm', async () => {
    mockLocation({ hostname: 'localhost', search: '?subdomain=adm' })
    const { isAdminSubdomain } = await loadModule()
    expect(isAdminSubdomain()).toBe(true)
  })

  it('should return true for localhost with ?subdomain=admin', async () => {
    mockLocation({ hostname: 'localhost', search: '?subdomain=admin' })
    const { isAdminSubdomain } = await loadModule()
    expect(isAdminSubdomain()).toBe(true)
  })
})

// =============================================================================
// 3. getAppMode()
// =============================================================================

describe('getAppMode', () => {
  it('should return "admin" on admin subdomain', async () => {
    mockLocation({ hostname: 'adm.geeketoys.com.br', search: '' })
    const { getAppMode } = await loadModule()
    expect(getAppMode()).toBe('admin')
  })

  it('should return "member" on member subdomain', async () => {
    mockLocation({ hostname: 'club.geeketoys.com.br', search: '' })
    const { getAppMode } = await loadModule()
    expect(getAppMode()).toBe('member')
  })

  it('should return "member" for localhost without params', async () => {
    mockLocation({ hostname: 'localhost', search: '' })
    const { getAppMode } = await loadModule()
    expect(getAppMode()).toBe('member')
  })

  it('should return "admin" for localhost with ?subdomain=admin', async () => {
    mockLocation({ hostname: 'localhost', search: '?subdomain=admin' })
    const { getAppMode } = await loadModule()
    expect(getAppMode()).toBe('admin')
  })
})

// =============================================================================
// 4. getLoginRedirectPath()
// =============================================================================

describe('getLoginRedirectPath', () => {
  let getLoginRedirectPath: typeof mod.getLoginRedirectPath

  beforeEach(async () => {
    mockLocation({ hostname: 'localhost', search: '' })
    const m = await loadModule()
    getLoginRedirectPath = m.getLoginRedirectPath
  })

  describe('admin app mode', () => {
    const appMode: AppMode = 'admin'

    it('should redirect admin role to /admin', () => {
      expect(getLoginRedirectPath('admin', appMode)).toBe('/admin')
    })

    it('should redirect seller role to /pdv', () => {
      expect(getLoginRedirectPath('seller', appMode)).toBe('/pdv')
    })

    it('should redirect member role to /acesso-negado', () => {
      expect(getLoginRedirectPath('member', appMode)).toBe('/acesso-negado')
    })

    it('should redirect null role to /acesso-negado', () => {
      expect(getLoginRedirectPath(null, appMode)).toBe('/acesso-negado')
    })

    it('should redirect unknown role to /acesso-negado', () => {
      expect(getLoginRedirectPath('viewer', appMode)).toBe('/acesso-negado')
    })
  })

  describe('member app mode', () => {
    const appMode: AppMode = 'member'

    it('should redirect admin role to /admin', () => {
      expect(getLoginRedirectPath('admin', appMode)).toBe('/admin')
    })

    it('should redirect seller role to /pdv', () => {
      expect(getLoginRedirectPath('seller', appMode)).toBe('/pdv')
    })

    it('should redirect member role to /membro', () => {
      expect(getLoginRedirectPath('member', appMode)).toBe('/membro')
    })

    it('should redirect null role to /acesso-negado', () => {
      expect(getLoginRedirectPath(null, appMode)).toBe('/acesso-negado')
    })

    it('should redirect unknown role to /membro (default path)', () => {
      expect(getLoginRedirectPath('viewer', appMode)).toBe('/membro')
    })
  })
})

// =============================================================================
// 5. isRoleAllowedOnSubdomain()
// =============================================================================

describe('isRoleAllowedOnSubdomain', () => {
  let isRoleAllowedOnSubdomain: typeof mod.isRoleAllowedOnSubdomain

  beforeEach(async () => {
    mockLocation({ hostname: 'localhost', search: '' })
    const m = await loadModule()
    isRoleAllowedOnSubdomain = m.isRoleAllowedOnSubdomain
  })

  describe('admin app mode', () => {
    const appMode: AppMode = 'admin'

    it('should allow admin role', () => {
      expect(isRoleAllowedOnSubdomain('admin', appMode)).toBe(true)
    })

    it('should allow seller role', () => {
      expect(isRoleAllowedOnSubdomain('seller', appMode)).toBe(true)
    })

    it('should deny member role', () => {
      expect(isRoleAllowedOnSubdomain('member', appMode)).toBe(false)
    })

    it('should deny null role', () => {
      expect(isRoleAllowedOnSubdomain(null, appMode)).toBe(false)
    })

    it('should deny unknown role', () => {
      expect(isRoleAllowedOnSubdomain('viewer', appMode)).toBe(false)
    })
  })

  describe('member app mode', () => {
    const appMode: AppMode = 'member'

    it('should allow admin role', () => {
      expect(isRoleAllowedOnSubdomain('admin', appMode)).toBe(true)
    })

    it('should allow seller role', () => {
      expect(isRoleAllowedOnSubdomain('seller', appMode)).toBe(true)
    })

    it('should allow member role', () => {
      expect(isRoleAllowedOnSubdomain('member', appMode)).toBe(true)
    })

    it('should allow null role (everyone allowed on member subdomain)', () => {
      expect(isRoleAllowedOnSubdomain(null, appMode)).toBe(true)
    })
  })
})

// =============================================================================
// 6. getSubdomainUrl()
// =============================================================================

describe('getSubdomainUrl', () => {
  it('should return localhost with ?subdomain=adm for admin target on localhost', async () => {
    mockLocation({ hostname: 'localhost', protocol: 'http:', port: '5173', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('admin')).toBe('http://localhost:5173?subdomain=adm')
  })

  it('should return plain localhost URL for member target on localhost', async () => {
    mockLocation({ hostname: 'localhost', protocol: 'http:', port: '5173', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('member')).toBe('http://localhost:5173')
  })

  it('should return localhost without port when port is empty', async () => {
    mockLocation({ hostname: 'localhost', protocol: 'http:', port: '', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('member')).toBe('http://localhost')
  })

  it('should handle 127.0.0.1 like localhost', async () => {
    mockLocation({ hostname: '127.0.0.1', protocol: 'http:', port: '3000', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('admin')).toBe('http://127.0.0.1:3000?subdomain=adm')
  })

  it('should replace "club" subdomain with "adm" for admin target', async () => {
    mockLocation({ hostname: 'club.geeketoys.com.br', protocol: 'https:', port: '', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('admin')).toBe('https://adm.geeketoys.com.br')
  })

  it('should replace "adm" subdomain with "club" for member target', async () => {
    mockLocation({ hostname: 'adm.geeketoys.com.br', protocol: 'https:', port: '', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('member')).toBe('https://club.geeketoys.com.br')
  })

  it('should replace "admin" subdomain with "club" for member target', async () => {
    mockLocation({ hostname: 'admin.geeketoys.com.br', protocol: 'https:', port: '', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('member')).toBe('https://club.geeketoys.com.br')
  })

  it('should replace "www" subdomain with "adm" for admin target', async () => {
    mockLocation({ hostname: 'www.geeketoys.com.br', protocol: 'https:', port: '', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('admin')).toBe('https://adm.geeketoys.com.br')
  })

  it('should prepend subdomain when hostname has no known subdomain', async () => {
    mockLocation({ hostname: 'geeketoys.com.br', protocol: 'https:', port: '', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('admin')).toBe('https://adm.geeketoys.com.br')
  })

  it('should prepend "club" when hostname has no known subdomain for member target', async () => {
    mockLocation({ hostname: 'geeketoys.com.br', protocol: 'https:', port: '', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('member')).toBe('https://club.geeketoys.com.br')
  })

  it('should include port in production URLs', async () => {
    mockLocation({ hostname: 'club.geeketoys.com.br', protocol: 'https:', port: '8080', search: '' })
    const { getSubdomainUrl } = await loadModule()
    expect(getSubdomainUrl('admin')).toBe('https://adm.geeketoys.com.br:8080')
  })
})

// =============================================================================
// 7. AppMode type export
// =============================================================================

describe('AppMode type', () => {
  it('should accept "admin" as valid AppMode', async () => {
    mockLocation({ hostname: 'localhost', search: '' })
    await loadModule()
    const mode: AppMode = 'admin'
    expect(mode).toBe('admin')
  })

  it('should accept "member" as valid AppMode', async () => {
    mockLocation({ hostname: 'localhost', search: '' })
    await loadModule()
    const mode: AppMode = 'member'
    expect(mode).toBe('member')
  })
})
