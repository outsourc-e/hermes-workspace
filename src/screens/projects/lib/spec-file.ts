const ACCEPTED_SPEC_FILE_PATTERN = /\.(md|txt)$/i

export const ACCEPTED_SPEC_FILE_TYPES = '.md,.txt'

export function isAcceptedSpecFile(file: File): boolean {
  return ACCEPTED_SPEC_FILE_PATTERN.test(file.name)
}

export async function readSpecFile(file: File): Promise<string> {
  if (!isAcceptedSpecFile(file)) {
    throw new Error('Only .md and .txt files are supported')
  }

  return file.text()
}
