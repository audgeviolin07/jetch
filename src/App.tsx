import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import './index.css'
import getStroke from 'perfect-freehand'
import { produce } from 'immer'
import { nanoid } from 'nanoid'
import Photograph from './photograph/Photograph'
import { FaEraser, FaPenFancy } from 'react-icons/fa6'

interface Point {
    x: number
    y: number
    pressure?: number
}

interface Action {
    id: string
    kind: 'pen' | 'eraser'
    path: [number, number][]
}

interface CanvasPosition {
    zoom: number
    x: number
    y: number
}

type Brush = 'pen' | 'eraser'

function pointsToPath(points: Point[], size: number): [number, number][] {
    return getStroke(points, {
        size,
        thinning: 0.25,
        streamline: 0.5,
        smoothing: 0.5,
    }) satisfies number[][] as [number, number][]
}

function pathToSvgD(points: [number, number][]): string {
    if (points.length === 0) return ''

    return points
        .reduce(
            (acc, [x0, y0], i, arr) => {
                if (i === arr.length - 1) return acc
                const [x1, y1] = arr[i + 1]!
                return acc.concat(` ${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`)
            },
            ['M ', `${points[0]![0]},${points[0]![1]}`, ' Q']
        )
        .concat('Z')
        .join('')
}

export function useLocalState<Type>(
	key: string,
	defaultValue: Type
): [Type, Dispatch<SetStateAction<Type>>] {
	const [ state, setState ] = useState<Type>(() => {
        const stored = localStorage.getItem(key)
		if (stored) return JSON.parse(stored)
        return defaultValue
    })

    useEffect(() => {
		if (!state) return
		localStorage.setItem(key, JSON.stringify(state))
	}, [ state ])

	return [ state, setState ]
}

export default function App() {
    const containerRef = useRef<HTMLDivElement>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const [inProgress, setInProgress] = useState(new Map<number, Point[]>())
    const redo = useRef<Action[]>([])
    
    const [brush, setBrush] = useLocalState<Brush>('brush', 'pen')
    const [position, setPosition] = useLocalState<CanvasPosition>('position', { x: 0, y: 0, zoom: 1 })
    const [history, setHistory] = useLocalState<Action[]>('history', [])

    const size = brush === 'pen' ? 5 : 7

    useEffect(() => {
        function onWheel(event: WheelEvent) {
            event.preventDefault()
            setPosition(produce((draft) => {
                if (event.ctrlKey) {
                    const mouseXWorld = (event.clientX + draft.x) / draft.zoom
                    const mouseYWorld = (event.clientY + draft.y) / draft.zoom

                    const zoomChange = 1 - event.deltaY * 0.01
                    const newZoom = Math.max(Math.min(draft.zoom * zoomChange, 15), 0.05)
                    
                    draft.zoom = newZoom
                    draft.x = (mouseXWorld * newZoom) - event.clientX
                    draft.y = (mouseYWorld * newZoom) - event.clientY
                } else {
                    draft.x += event.deltaX
                    draft.y += event.deltaY
                }
            }))
        }

        function onKeyDown(event: KeyboardEvent) {
            let shortcut: 'undo' | 'redo' | null = null
            if (event.ctrlKey || event.metaKey) {
                if (event.code === 'KeyZ') {
                    shortcut = event.shiftKey ? 'redo' : 'undo'
                } else if (event.code === 'KeyY') {
                    shortcut = 'redo'
                }
            }

            if (shortcut === 'undo') {
                event.preventDefault()
                setHistory((history) => {
                    if (history.length === 0) return history
                    redo.current.unshift(history.at(-1)!)
                    return history.slice(0, -1)
                })
            } else if (shortcut === 'redo') {
                event.preventDefault()
                if (redo.current.length > 0) {
                    setHistory((history) => [...history, redo.current.shift()!])
                }
            }
        }

        containerRef.current?.addEventListener('wheel', onWheel, { passive: false })
        window.addEventListener('keydown', onKeyDown)

        return () => {
            containerRef.current?.removeEventListener('wheel', onWheel)
            window.removeEventListener('keydown', onKeyDown)
        }
    }, [])

    const inProgressActions: Action[] = [...inProgress.entries()].map(([id, points]) => ({
        id: `inprogress-${id}`,
        kind: brush,
        path: pointsToPath(points, size),
    }))

    const allActions = [...history, ...inProgressActions]

    const { defs, children } = allActions.reduce((acc, action) => {
        if (action.kind === 'pen') {
            acc.children.push(
                <path 
                    key={action.id} 
                    d={pathToSvgD(action.path)} 
                    fill='currentColor' 
                />
            )
        } else {
            const maskId = `mask-${action.id}`
            acc.defs.push(
                <mask id={maskId} key={maskId}>
                    <rect width='100%' height='100%' fill='white' />
                    <path d={pathToSvgD(action.path)} fill='black' />
                </mask>
            )
            acc.children = [
                <g mask={`url(#${maskId})`} key={`group-${action.id}`}>
                    {acc.children}
                </g>
            ]
        }
        return acc
    }, { defs: [] as ReactNode[], children: [] as ReactNode[] })

    return (
        <div>
            <div className='photograph-left'><Photograph /></div>
            <div className='photograph-right'><Photograph /></div>

            <div className='toolbar'>
                <div className='tools'>
                    <button className={brush === 'pen' ? 'active' : ''} onClick={() => setBrush('pen')}>
                        <FaPenFancy />
                    </button>
                    <button className={brush === 'eraser' ? 'active' : ''} onClick={() => setBrush('eraser')}>
                        <FaEraser />
                    </button>
                </div>
                <button>
                    SHARE WITH PEOPLE
                </button>
            </div>

            {/* <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                zIndex: 99
            }}>
                <button onClick={() => setBrush('pen')}>Pen</button>
                <button onClick={() => setBrush('eraser')}>Eraser</button>
            </div> */}

            <div
                ref={containerRef}
                onPointerDown={(event) => {
                    containerRef.current?.setPointerCapture(event.pointerId)
                    setInProgress(produce((draft) => {
                        draft.set(event.pointerId, [])
                    }))
                }}
                onPointerMove={(event) => {
                    setInProgress(produce((draft) => {
                        const line = draft.get(event.pointerId)
                        if (!line) return
                        line.push({
                            x: (event.clientX + position.x) / position.zoom,
                            y: (event.clientY + position.y) / position.zoom,
                            pressure: event.pressure,
                        })
                    }))
                }}
                onPointerUp={(event) => {
                    if (inProgress.has(event.pointerId)) {
                        const stroke = pointsToPath(inProgress.get(event.pointerId)!, size)

                        redo.current = []
                        setHistory(produce((draft) => {
                            draft.push({
                                id: nanoid(),
                                kind: brush,
                                path: stroke,
                            })
                        }))

                        setInProgress(produce((draft) => {
                            draft.delete(event.pointerId)
                        }))
                    }
                }}
                className='container'
            >
                <svg
                    ref={svgRef}
                    style={{
                        transformOrigin: 'top left', 
                        transform: `
                            translate(${-position.x}px, ${-position.y}px)
                            scale(${position.zoom})
                        `,
                    }}
                >
                    <defs>
                        {defs}
                    </defs>
                    {children}
                </svg>
            </div>
        </div>
    )
}