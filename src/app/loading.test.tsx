// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LinesLoading from './(app)/city/[city]/lines/loading'
import MapLoading from './(app)/city/[city]/map/loading'
import LineLoading from './(app)/city/[city]/line/[routeId]/loading'

describe.each([
  ['lines', LinesLoading],
  ['map', MapLoading],
  ['line', LineLoading],
])('%s/loading.tsx', (_name, Loading) => {
  it('renders the shared page skeleton so a slow navigation never shows an empty page (#7)', () => {
    render(<Loading />)
    expect(screen.getByTestId('page-skeleton')).toBeInTheDocument()
  })
})
