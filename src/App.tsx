import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import './index.css'
import { produce } from 'immer'
import { nanoid } from 'nanoid'
import Photograph from './photograph/Photograph'
import { FaEraser, FaPenFancy } from 'react-icons/fa6'
import SharingModal from './sharing/SharingModal'
import { processHistory, pointsToPath, pathToSvgD, type Point, type Action, useLocalState, type Brush, type CanvasPosition, exportAsPng } from './utils'

export default function App() {
    const containerRef = useRef<HTMLDivElement>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const [inProgress, setInProgress] = useState(new Map<number, Point[]>())
    const redo = useRef<Action[]>([])
    const [sharingBlob, setSharingBlob] = useState<Blob | null>(null)
    
    const [brush, setBrush] = useLocalState<Brush>('brush', 'pen')
    const [penSize, setPenSize] = useLocalState<number>('pen-size', 5)
    const [eraserSize, setEraserSize] = useLocalState<number>('eraser-size', 8)
    const [position, setPosition] = useLocalState<CanvasPosition>('position', { x: 0, y: 0, zoom: 1 })
    const [history, setHistory] = useLocalState<Action[]>('history', [])

    const size = brush === 'pen' ? penSize : eraserSize
    const setSize = brush === 'pen' ? setPenSize : setEraserSize
    const minSize = 2
    const maxSize = brush === 'pen' ? 30 : 50

    const cursor = useMemo(() => {
        const actualSize = size * position.zoom
        const svgSize = Math.ceil(actualSize + 4)
        const r = actualSize / 2
        const c = svgSize / 2

        const svg = `
            <svg width='${svgSize}' height='${svgSize}' xmlns='http://www.w3.org/2000/svg'>
                <circle
                    cx='${c}'
                    cy='${c}'
                    r='${r}'
                    stroke='black'
                    stroke-width='1.5'
                    fill='${brush === 'pen' ? 'blank' : 'white'}'
                />
            </svg>
        `
        const encoded = encodeURIComponent(svg.replace(/[\r\n]+/g, '').trim())
        return `url("data:image/svg+xml;utf8,${encoded}") ${c} ${c}, auto`
    }, [size, position.zoom, brush])

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
        const { groups, eraserActions, bounds } = processHistory(history)
        
        // Convert each eraser action to an SVG path, to be used in masks later.
        const paths = eraserActions.map((eraser) => (
            <path 
                key={eraser.id} 
                id={`eraser-${eraser.id}`} 
                d={pathToSvgD(eraser.path)} 
            />
        ))

        const masks: ReactNode[] = []
        const renderedGroups: ReactNode[] = []

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i]!
            
            if (group.relevantErasers.length === 0) {
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
                            x={group.bounds.minX - boundsPadding} 
                            y={group.bounds.minY - boundsPadding} 
                            width={group.bounds.maxX - group.bounds.minX + boundsPadding * 2} 
                            height={group.bounds.maxY - group.bounds.minY + boundsPadding * 2} 
                            fill='white' 
                        />
                        {group.relevantErasers.map(e => (
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

        return { 
            eraserPaths: paths, 
            generationMasks: masks, 
            generationGroups: renderedGroups,
            globalBounds: {
                x: bounds.minX - boundsPadding,
                y: bounds.minY - boundsPadding,
                width: bounds.width + boundsPadding * 2,
                height: bounds.height + boundsPadding * 2,
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

                    <div className='divider' />

                    <div className='size-container'>
                        <input
                            type='range'
                            min={minSize * 1000}
                            max={maxSize * 1000}
                            value={size * 1000}
                            onChange={(event) => setSize(parseInt(event.target.value, 10) / 1000)}
                        />

                        <div className='preview-container' style={{
                            width: `${maxSize * position.zoom}px`,
                            height: `${maxSize * position.zoom}px`,
                            bottom: `-${maxSize * position.zoom + 35}px`,
                        }}>
                            <div className={`preview ${brush}`} style={{
                                width: `${size * position.zoom}px`,
                                height: `${size * position.zoom}px`,
                            }} />
                        </div>
                    </div>
                </div>
                <button onClick={async () => {
                    const blob = await exportAsPng(history)
                    setSharingBlob(blob)
                }}>
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
                style={{ cursor }}
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

            {sharingBlob && <SharingModal pngBlob={sharingBlob} onClose={() => setSharingBlob(null)} />}
        </div>
    )
}