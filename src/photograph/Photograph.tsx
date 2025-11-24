import { Fragment, useEffect, useState } from 'react'
import styles from './Photograph.module.css'
import ellipsisSvg from './ellipsis.svg' with { type: 'text' }
import adchoicesSvg from './adchoices.svg' with { type: 'text' }
import kogniseSvg from './kognise.svg' with { type: 'text' }
import backSvg from './back.svg' with { type: 'text' }

type Mode = 'photograph' | 'settings' | 'hidden'

export default function Photograph() {
    const [url, setUrl] = useState<string | null>(null)
    const [mode, setMode] = useState<Mode>('photograph')

    useEffect(() => {
        fetch('/random-photograph')
            .then((res) => res.text())
            .then(setUrl)
    }, [])

    if (!url) return null

    if (mode === 'settings') return (
        <div className={styles.container}>
            <div
                className={styles.dismiss}
                onClick={() => setMode('photograph')}
                dangerouslySetInnerHTML={{ __html: backSvg }}
            />

            <div className={styles.adsBy}>
                Ads by <div className={styles.logo} dangerouslySetInnerHTML={{ __html: kogniseSvg }} />
            </div>

            <div className={styles.buttons}>
                <button className={styles.primary} onClick={() => setMode('hidden')}>
                    Stop seeing this ad
                </button>
                <button onClick={() => window.open('https://x.com/jia_seed/status/1992404997708157405')}>
                    Why this ad? <div className={styles.icon} dangerouslySetInnerHTML={{ __html: adchoicesSvg }} />
                </button>
            </div>
        </div>
    )

    if (mode === 'hidden') return (
        <div className={styles.container}>
            <div className={styles.adsClosed}>
                Ad closed by <div className={styles.logo} dangerouslySetInnerHTML={{ __html: kogniseSvg }} />
            </div>
        </div>
    )

    return (
        <div className={styles.container}>
            <a href={url} target='_blank'>
                <img src={url} />
            </a>

            <div className={styles.adchoices}>
                <div className={styles.label}>AdChoices</div>

                <div className={styles.iconButtons}>
                    <div
                        className={styles.iconButton}
                        onClick={() => setMode('settings')}
                        dangerouslySetInnerHTML={{ __html: adchoicesSvg }}
                    />
                    <div
                        className={styles.iconButton}
                        onClick={() => setMode('settings')}
                        dangerouslySetInnerHTML={{ __html: ellipsisSvg }}
                    />
                </div>
            </div>
        </div>
    )
}