import { NextResponse } from 'next/server'
import { appConfig, poller } from '@/lib/board/instance'

export async function GET() {
  return NextResponse.json({
    dataSource: appConfig.dataSource,
    pollerAwake: poller.isAwake(),
    pollerStatus: poller.getStatus(),
  })
}
