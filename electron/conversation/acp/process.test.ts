import { PassThrough } from 'node:stream'
import { finished } from 'node:stream/promises'

import { describe, expect, it } from 'vitest'

import { BoundedLineTransform, buildAgentEnvironment } from './process'

describe('ACP process boundaries', () => {
  it('inherits only allowlisted environment values and accepts explicit injection', () => {
    expect(
      buildAgentEnvironment(
        {
          HOME: '/workspace-user',
          PATH: '/usr/bin',
          OPENAI_API_KEY: 'must-not-leak',
          ANTHROPIC_API_KEY: 'must-not-leak',
        },
        { TEA_RESOLVED_CREDENTIAL: 'explicit-main-owned-value' },
      ),
    ).toEqual({
      HOME: '/workspace-user',
      PATH: '/usr/bin',
      TEA_RESOLVED_CREDENTIAL: 'explicit-main-owned-value',
    })
  })

  it('preserves partial valid lines and rejects an oversized line', async () => {
    const validInput = new PassThrough()
    const validOutput = validInput.pipe(new BoundedLineTransform(8))
    const chunks: Buffer[] = []
    validOutput.on('data', (chunk: Buffer) => chunks.push(chunk))
    validInput.write('1234')
    validInput.end('5678\nok\n')
    await finished(validOutput)
    expect(Buffer.concat(chunks).toString()).toBe('12345678\nok\n')

    const invalidInput = new PassThrough()
    const invalidOutput = invalidInput.pipe(new BoundedLineTransform(4))
    invalidOutput.resume()
    invalidInput.end('12345')
    await expect(finished(invalidOutput)).rejects.toMatchObject({ code: 'protocolLineTooLong' })
  })
})
