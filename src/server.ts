import { serve } from 'bun'
import index from './index.html'
import { readdir } from 'node:fs/promises'

const server = serve({
    routes: {
        '/*': index,
        '/random-photograph': async (req) => {
            const files = await readdir('./photographs')
            const filename = files[Math.floor(Math.random() * files.length)]
            if (!filename) throw new Error('No photographs')
            return new Response(`/photographs/${encodeURIComponent(filename)}`)
        },
        '/photographs/:filename': (req) => {
            return new Response(Bun.file(`./photographs/${req.params.filename}`))
        },
    },
    development: process.env.NODE_ENV !== 'production' && {
        hmr: true,
        console: true,
    },
})

console.log(`🚀 Server running at ${server.url}`)
