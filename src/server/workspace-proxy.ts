import { WORKSPACE_DAEMON_ORIGIN } from './workspace-config'

type ForwardWorkspaceRequestOptions = {
  request: Request
  path: string
  searchParams?: URLSearchParams
}

export async function forwardWorkspaceRequest({
  request,
  path,
  searchParams,
}: ForwardWorkspaceRequestOptions): Promise<Response> {
  const targetUrl = new URL(`/api/workspace${path}`, WORKSPACE_DAEMON_ORIGIN)

  if (searchParams) {
    for (const [key, value] of searchParams.entries()) {
      targetUrl.searchParams.append(key, value)
    }
  }

  const method = request.method.toUpperCase()
  const headers = new Headers()
  const accept = request.headers.get('accept')
  const contentType = request.headers.get('content-type')

  if (accept) headers.set('accept', accept)
  if (contentType) headers.set('content-type', contentType)

  const bodyText =
    method === 'GET' || method === 'HEAD' ? undefined : await request.text()

  const daemonResponse = await fetch(targetUrl, {
    method,
    headers,
    body: bodyText && bodyText.length > 0 ? bodyText : undefined,
  })

  const responseHeaders = new Headers()
  const contentTypeHeader = daemonResponse.headers.get('content-type')
  const isEventStream = contentTypeHeader?.includes('text/event-stream') ?? false

  for (const headerName of [
    'content-type',
    'cache-control',
    'connection',
    'etag',
    'last-modified',
    'location',
    'x-accel-buffering',
  ]) {
    const headerValue = daemonResponse.headers.get(headerName)
    if (headerValue) {
      responseHeaders.set(headerName, headerValue)
    }
  }

  if (isEventStream) {
    return new Response(daemonResponse.body, {
      status: daemonResponse.status,
      headers: responseHeaders,
    })
  }

  return new Response(daemonResponse.body, {
    status: daemonResponse.status,
    headers: responseHeaders,
  })
}
