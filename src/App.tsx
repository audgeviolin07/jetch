import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
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

    const size = brush === 'pen' ? 5 : 10

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

    const { eraserPaths, generationMasks, generationGroups, globalBounds } = useMemo(() => {
        const boundsPadding = 100
        const eraserActions = history.filter((action) => action.kind === 'eraser')
        
        // Convert each eraser action to an SVG path, to be used in masks later.
        const paths = eraserActions.map((eraser) => (
            <path 
                key={eraser.id} 
                id={`eraser-${eraser.id}`} 
                d={pathToSvgD(eraser.path)} 
            />
        ))

        // Bundle strokes into a group until we find an eraser action.
        const groups: { startEraserIndex: number, strokes: Action[] }[] = []
        let currentStrokes: Action[] = []
        let eraserIdx = 0

        for (const action of history) {
            if (action.kind === 'eraser') {
                if (currentStrokes.length > 0) {
                    groups.push({ startEraserIndex: eraserIdx, strokes: currentStrokes })
                    currentStrokes = []
                }
                eraserIdx++
            } else {
                currentStrokes.push(action)
            }
        }
        if (currentStrokes.length > 0) {
            groups.push({ startEraserIndex: eraserIdx, strokes: currentStrokes })
        }

        const masks: ReactNode[] = []
        const renderedGroups: ReactNode[] = []
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i]!

            // Calculate group bounds
            let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity
            for (const s of group.strokes) {
                for (const [x, y] of s.path) {
                    if (x < gMinX) gMinX = x
                    if (y < gMinY) gMinY = y
                    if (x > gMaxX) gMaxX = x
                    if (y > gMaxY) gMaxY = y
                }
            }

            // Update global bounds
            if (gMinX < minX) minX = gMinX
            if (gMinY < minY) minY = gMinY
            if (gMaxX > maxX) maxX = gMaxX
            if (gMaxY > maxY) maxY = gMaxY

            if (gMinX === Infinity) {
                gMinX = 0
                gMinY = 0
                gMaxX = 0
                gMaxY = 0
            }

            // Get all of the eraser actions that occured after this group of strokes.
            const relevantErasers = eraserActions.slice(group.startEraserIndex)
            
            if (relevantErasers.length === 0) {
                renderedGroups.push(
                    <g key={`gen-${i}`}>
                        {group.strokes.map(s => (
                            <path key={s.id} d={pathToSvgD(s.path)} fill='currentColor' />
                        ))}
                    </g>
                )
            } else {
                // Draw the masks!
                const maskId = `mask-gen-${i}`
                masks.push(
                    <mask id={maskId} key={maskId}>
                        <rect 
                            x={gMinX - boundsPadding} 
                            y={gMinY - boundsPadding} 
                            width={gMaxX - gMinX + boundsPadding * 2} 
                            height={gMaxY - gMinY + boundsPadding * 2} 
                            fill='white' 
                        />
                        {relevantErasers.map(e => (
                            <use key={e.id} href={`#eraser-${e.id}`} fill='black' />
                        ))}
                    </mask>
                )
                renderedGroups.push(
                    <g key={`gen-${i}`} mask={`url(#${maskId})`}>
                        {group.strokes.map(s => (
                            <path key={s.id} d={pathToSvgD(s.path)} fill='currentColor' />
                        ))}
                    </g>
                )
            }
        }

        if (minX === Infinity) {
            minX = 0
            minY = 0
            maxX = 0
            maxY = 0
        }

        return { 
            eraserPaths: paths, 
            generationMasks: masks, 
            generationGroups: renderedGroups,
            globalBounds: {
                x: minX - boundsPadding,
                y: minY - boundsPadding,
                width: maxX - minX + boundsPadding * 2,
                height: maxY - minY + boundsPadding * 2,
            }
        }
    }, [history])


    const inProgressPaths = [...inProgress.values()].map(points => pointsToPath(points, size))
    const inProgressEraserId = useId()
    const isErasing = brush === 'eraser' && inProgressPaths.length > 0

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
                        {eraserPaths}
                        {generationMasks}
                        {isErasing && (
                            <mask id={inProgressEraserId}>
                                <rect 
                                    x={globalBounds.x} 
                                    y={globalBounds.y} 
                                    width={globalBounds.width} 
                                    height={globalBounds.height} 
                                    fill='white' 
                                />
                                {inProgressPaths.map((p, i) => (
                                    <path key={i} d={pathToSvgD(p)} fill='black' />
                                ))}
                            </mask>
                        )}
                    </defs>
                    
                    <g mask={isErasing ? `url(#${inProgressEraserId})` : undefined}>
                        {generationGroups}
                    </g>
                    
                    {brush === 'pen' && inProgressPaths.map((p, i) => (
                        <path key={i} d={pathToSvgD(p)} fill='currentColor' />
                    ))}
                </svg>
            </div>
        </div>
    )
}