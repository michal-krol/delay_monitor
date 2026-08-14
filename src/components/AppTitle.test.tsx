// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppTitle } from './AppTitle'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AppTitle', () => {
  it('shows the app title', () => {
    render(<AppTitle />)
    expect(screen.getByRole('heading', { name: 'Monitor opóźnień' })).toBeInTheDocument()
  })

  it('shows the build-time version and branch in small print, to tell a local dev build apart from production', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.2.3')
    vi.stubEnv('NEXT_PUBLIC_APP_BRANCH', 'dev')

    render(<AppTitle />)

    expect(screen.getByText('v1.2.3 · dev')).toBeInTheDocument()
  })
})
