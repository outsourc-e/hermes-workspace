#!/usr/bin/env node
import https from 'node:https'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const baseUrl = process.argv[2] || 'https://127.0.0.1:4445/chat/new'
const errorLogPath =
  process.argv[3] || path.join(os.homedir(), '.pm2', 'logs', 'hermes-workspace-error.log')
const suspiciousPatterns = [
  'ERR_MODULE_NOT_FOUND',
  'Cannot find module',
  'Failed to load url',
  'does not provide an export named',
]

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { rejectUnauthorized: false },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          if ((response.statusCode || 0) >= 400) {
            reject(new Error(`HTTP ${response.statusCode} for ${url}`))
            return
          }
          resolve(Buffer.concat(chunks).toString('utf8'))
        })
      },
    )
    request.on('error', reject)
  })
}

const html = await fetchText(baseUrl)
if (!html.includes('Hermes Workspace')) {
  throw new Error(`Managed companion did not render the expected shell at ${baseUrl}`)
}

if (fs.existsSync(errorLogPath)) {
  const tail = fs.readFileSync(errorLogPath, 'utf8').trim().split('\n').slice(-200).join('\n')
  const badPattern = suspiciousPatterns.find((pattern) => tail.includes(pattern))
  if (badPattern) {
    throw new Error(`Detected suspicious companion runtime error in ${errorLogPath}: ${badPattern}`)
  }
}

console.log(`Managed companion smoke passed for ${baseUrl}`)
