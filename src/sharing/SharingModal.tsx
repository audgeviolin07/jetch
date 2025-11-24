import { useId, useRef, useState } from 'react'
import styles from './SharingModal.module.css'
import { FocusTrap } from 'focus-trap-react'
import { useBlobjectUrl, useLocalState } from '@/utils'

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

    const [you, setYou] = useLocalState('you', '')
    const [a, setA] = useLocalState('a', '')
    const [b, setB] = useLocalState('b', '')
    const [c, setC] = useLocalState('c', '')
    const [lexi, setLexi] = useLocalState<boolean>('lexi', false)
    
    return (
        <div className={styles.container} onMouseDown={(event) => {
            // If the event chain doesn't contain the modal, then close the modal.
            if (!modalRef.current?.contains(event.target as Node) && !isLoading) {
                props.onClose()
            }
        }}>
            <FocusTrap>
                <form ref={modalRef} className={styles.modal} spellCheck={false} noValidate onSubmit={(event) => {
                    event.preventDefault()
                    setIsLoading(true)
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
                </form>
            </FocusTrap>
        </div>
    )
}