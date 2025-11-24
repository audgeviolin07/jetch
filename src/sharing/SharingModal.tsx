import { useId, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import styles from './SharingModal.module.css'
import { FocusTrap } from 'focus-trap-react'
import { useBlobjectUrl, useLocalState } from '@/utils'
import confetti from 'canvas-confetti'

export interface SharingModalProps {
    pngBlob: Blob
    onClose: () => void
}

export default function SharingModal(props: SharingModalProps) {
    const pngUrl = useBlobjectUrl(props.pngBlob)
    
    const youId = useId()
    const aId = useId()
    const bId = useId()
    const cId = useId()
    const lexiId = useId()
    
    const modalRef = useRef<HTMLFormElement>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSent, setIsSent] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [you, setYou] = useLocalState('you', '')
    const [a, setA] = useLocalState('a', '')
    const [b, setB] = useLocalState('b', '')
    const [c, setC] = useLocalState('c', '')
    const [lexi, setLexi] = useLocalState<boolean>('lexi', false)

    function onContainerPointerDown(event: PointerEvent) {
        // If the event chain doesn't contain the modal, then close the modal.
        if (!modalRef.current?.contains(event.target as Node) && !isLoading) {
            props.onClose()
        }
    }

    if (isSent) {
        return (
            <div className={styles.container} onPointerDown={onContainerPointerDown}>
                <FocusTrap>
                    <form ref={modalRef} className={styles.modal} onSubmit={(event) => {
                        event.preventDefault()
                        props.onClose()
                    }}>
                        <h2>YAY you have sent this (i'm sure wonderful) drawing to some people.</h2>

                        <div className={styles.buttons}>
                            <button type='submit'>
                                close
                            </button>
                        </div>
                    </form>
                </FocusTrap>
            </div>
        )
    }
    
    return (
        <div className={styles.container} onPointerDown={onContainerPointerDown}>
            <FocusTrap focusTrapOptions={{ initialFocus: false }}>
                <form ref={modalRef} className={styles.modal} spellCheck={false} noValidate onSubmit={async (event) => {
                    event.preventDefault()
                    setIsLoading(true)
                    setError(null)

                    try {
                        const emails = [a, b, c].filter((email) => email.trim().length > 0)
                        const formData = new FormData()
                        formData.append('you', you)
                        formData.append('emails', JSON.stringify(emails))
                        formData.append('lexi', String(lexi))
                        formData.append('image', props.pngBlob)

                        const response = await fetch('/share', {
                            method: 'POST',
                            body: formData,
                        })

                        if (!response.ok) {
                            setError((await response.text()).toLowerCase())
                            setIsLoading(false)
                            return
                        }

                        doConfetti()
                        setIsLoading(false)
                        setIsSent(true)
                    } catch (error) {
                        console.error(error)
                        setError('something weird and unexpected happened :(')
                        setIsLoading(false)
                    }
                }}>
                    <h2>SHARE WITH PEOPLE</h2>

                    <img
                        className={styles.preview}
                        src={pngUrl ?? undefined}
                    />
                    
                    <div className={styles.group}>
                        <label htmlFor={youId}>what are you called?</label>
                        <input
                            type='text'
                            id={youId}
                            value={you}
                            onChange={(event) => setYou(event.target.value)}
                            placeholder='steve jobs'
                            required
                        />
                    </div>
                    <hr />
                    <div className={styles.group}>
                        <label htmlFor={aId}>email #1 to send to:</label>
                        <input
                            type='email'
                            id={aId}
                            value={a}
                            onChange={(event) => setA(event.target.value)}
                            placeholder='your.friend@example.com'
                        />
                    </div>
                    <div className={styles.group}>
                        <label htmlFor={bId}>email #2 to send to:</label>
                        <input
                            type='email'
                            id={bId}
                            value={b}
                            onChange={(event) => setB(event.target.value)}
                        />
                    </div>
                    <div className={styles.group}>
                        <label htmlFor={cId}>email #3 to send to:</label>
                        <input
                            type='email'
                            id={cId}
                            value={c}
                            onChange={(event) => setC(event.target.value)}
                        />
                    </div>
                    
                    <div className={styles.lexi}>
                        <input
                            type='checkbox'
                            id={lexiId}
                            checked={lexi}
                            onChange={(event) => setLexi(event.target.checked)}
                        />
                        <label htmlFor={lexiId}>also send to lexi (she made this site)</label>
                    </div>

                    <div className={styles.buttons}>
                        <button type='submit' className={styles.primary} disabled={isLoading}>
                            send emails!!!
                        </button>
                        <button type='button' onClick={props.onClose} disabled={isLoading}>
                            nevermind
                        </button>
                    </div>
                    <div className={styles.error}>{error}</div>
                </form>
            </FocusTrap>
        </div>
    )
}

function doConfetti() {
    const end = Date.now() + 1000 * 2
    const colors = ['#2b8a3e', '#40c057', '#69db7c', '#d3f9d8', '#ebfbee']

    ;(function frame() {
        confetti({
            particleCount: 10,
            angle: 60,
            spread: 55,
            startVelocity: 80,
            origin: { x: 0, y: 1 },
            colors: [
                colors[Math.floor(Math.random() * colors.length)]!,
                colors[Math.floor(Math.random() * colors.length)]!
            ],
            scalar: 1.2,
            zIndex: 99999,
        })
        confetti({
            particleCount: 10,
            angle: 120,
            spread: 55,
            startVelocity: 80,
            origin: { x: 1, y: 1 },
            colors: [
                colors[Math.floor(Math.random() * colors.length)]!,
                colors[Math.floor(Math.random() * colors.length)]!
            ],
            scalar: 1.2,
            zIndex: 99999,
        })

        if (Date.now() < end) {
            requestAnimationFrame(frame)
        }
    }())
}