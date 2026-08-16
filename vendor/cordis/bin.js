#!/usr/bin/env node

import { Context } from '@njydsz/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@njydsz/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@njydsz/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
