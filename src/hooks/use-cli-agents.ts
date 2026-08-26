import { useQuery } from '@tanstack/react-query'

export type CliAgentStatus = 'running' | 'finished'

export type CliAgent = {
  pid: number
  name: string
  task: string
  runtimeSeconds: number
  status: CliAgentStatus
}

export async function fetchCliAgents(): Promise<Array<CliAgent>> {
  return []
}

export function useCliAgents() {
  return useQuery({
    queryKey: ['sidebar', 'cli-agents'],
    queryFn: fetchCliAgents,
    retry: false,
  })
}
