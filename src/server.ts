import { serve } from 'bun'
import index from './index.html'
import { readdir } from 'node:fs/promises'
import { Resend } from 'resend'
import { z } from 'zod'

const resend = new Resend(Bun.env.RESEND_API_KEY)

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
        '/share': async (req) => {
            if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
            
            try {
                const formData = await req.formData()
                let you = formData.get('you')
                const emailsJson = formData.get('emails')
                const lexi = formData.get('lexi') === 'true'
                const image = formData.get('image')

                if (typeof you !== 'string' || typeof emailsJson !== 'string' || !(image instanceof Blob)) {
                    return new Response('Invalid form data', { status: 400 })
                }
                you = you.trim()
                if (you.length === 0) {
                    return new Response('Invalid name', { status: 400 })
                }

                const emails = JSON.parse(emailsJson)
                if (lexi) emails.push('jetch@kognise.dev')

                const emailSchema = z.array(z.email())
                const result = emailSchema.safeParse(emails)

                if (!result.success) {
                    return new Response('You entered an invalid email address', { status: 400 })
                }

                const cid = 'drawing'
                const { error } = await resend.emails.send({
                    from: 'jetch sharing <sharing@jetch.kognise.dev>',
                    to: result.data,
                    subject: `hi hello. ${you} has a drawing for you.`,
                    replyTo: 'jetch@kognise.dev',
                    html: `
                        <p>HELLO!</p>
                        <p><strong>${you}</strong> drew this and sent it to you:</p>
                        <p><img src='cid:${cid}'></p>
                        <p>(you, too, can send your friends random sketches, with the power of ✨ <a href='https://jetch.kognise.dev'>jetch</a>!)</p>
                        <p style='font-size: 0.8em;'>((if this is spam please reply to this email and i'll deal with it, very sorry.))</p>
                    `,
                    attachments: [
                        {
                            filename: 'drawing.png',
                            contentId: cid,
                            contentType: 'image/png',
                            content: Buffer.from(await image.arrayBuffer()),
                        }
                    ],
                })

                if (error) {
                    console.error(error)
                    return new Response('Failed to send email', { status: 500 })
                }

                return new Response('Sent!')
            } catch (error) {
                console.error(error)
                return new Response('Internal server error', { status: 500 })
            }
        },
    },
    development: process.env.NODE_ENV !== 'production' && {
        hmr: true,
        console: true,
    },
})

console.log(`🚀 Server running at ${server.url}`)
