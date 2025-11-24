import { useEffect, useMemo, useRef, useState } from 'react'
import './index.css'
import { produce } from 'immer'
import { nanoid } from 'nanoid'
import Photograph from './photograph/Photograph'
import { FaEraser, FaPenFancy } from 'react-icons/fa6'
import SharingModal from './sharing/SharingModal'
import { pointsToPath, type Point, type Action, useLocalState, type Brush, type CanvasPosition, exportAsPng, drawPath, renderPaths } from './utils'

export default function App() {
    const containerRef = useRef<HTMLDivElement>(null)
    const staticCanvasRef = useRef<HTMLCanvasElement>(null)
    const activeCanvasRef = useRef<HTMLCanvasElement>(null)
    const inProgressRef = useRef(new Map<number, Point[]>())
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
    const maxSize = brush === 'pen' ? 30 : 80

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

    function renderActiveStrokes() {
        const canvas = activeCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        
        // Reset transform and clear
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        // Apply transforms
        ctx.scale(dpr, dpr)
        ctx.translate(-position.x, -position.y)
        ctx.scale(position.zoom, position.zoom)

        // Draw in-progress
        if (inProgressRef.current.size > 0) {
            const inProgressPaths = [...inProgressRef.current.values()].map(points => pointsToPath(points, size))
            
            if (brush === 'eraser') {
                // For erasing, we draw white on the active layer to simulate looking through to background
                ctx.fillStyle = 'white'
                ctx.globalCompositeOperation = 'source-over'
            } else {
                ctx.fillStyle = 'black'
                ctx.globalCompositeOperation = 'source-over'
            }
            
            for (const path of inProgressPaths) {
                drawPath(ctx, path)
            }
        }
    }

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

    const [resizeTrigger, setResizeTrigger] = useState(0)

    const prevHistoryRef = useRef<Action[]>([])
    const prevPositionRef = useRef<CanvasPosition>(position)
    const prevResizeTriggerRef = useRef<number>(0)

    useEffect(() => {
        const staticCanvas = staticCanvasRef.current
        const activeCanvas = activeCanvasRef.current
        const container = containerRef.current
        if (!staticCanvas || !activeCanvas || !container) return

        const updateSize = () => {
            const dpr = window.devicePixelRatio || 1
            const width = container.clientWidth
            const height = container.clientHeight
            
            staticCanvas.width = width * dpr
            staticCanvas.height = height * dpr
            staticCanvas.style.width = `${width}px`
            staticCanvas.style.height = `${height}px`
            
            activeCanvas.width = width * dpr
            activeCanvas.height = height * dpr
            activeCanvas.style.width = `${width}px`
            activeCanvas.style.height = `${height}px`

            setResizeTrigger(n => n + 1)
        }
        
        updateSize()

        const observer = new ResizeObserver(updateSize)
        observer.observe(container)
        
        return () => observer.disconnect()
    }, [])

    // Render static history
    useEffect(() => {
        const canvas = staticCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        
        const isResize = resizeTrigger !== prevResizeTriggerRef.current
        const posChanged = position.x !== prevPositionRef.current.x || 
                           position.y !== prevPositionRef.current.y || 
                           position.zoom !== prevPositionRef.current.zoom

        if (isResize || posChanged) {
            // Full redraw
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.scale(dpr, dpr)
            ctx.translate(-position.x, -position.y)
            ctx.scale(position.zoom, position.zoom)
            renderPaths(ctx, history)
        } else {
            // Check for incremental update
            const prev = prevHistoryRef.current
            const curr = history
            let match = true
            let i = 0
            
            // Find the first point of divergence
            for (; i < prev.length; i++) {
                if (i >= curr.length || prev[i] !== curr[i]) {
                    match = false
                    break
                }
            }

            if (match) {
                // We just added items (or nothing changed)
                // Ensure transform is set
                ctx.setTransform(1, 0, 0, 1, 0, 0)
                ctx.scale(dpr, dpr)
                ctx.translate(-position.x, -position.y)
                ctx.scale(position.zoom, position.zoom)

                // Draw new items only
                for (let j = i; j < curr.length; j++) {
                    const action = curr[j]!
                    ctx.globalCompositeOperation = action.kind === 'eraser' ? 'destination-out' : 'source-over'
                    drawPath(ctx, action.path)
                }
            } else {
                // History diverged (undo, or replacement), full redraw
                ctx.setTransform(1, 0, 0, 1, 0, 0)
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                ctx.scale(dpr, dpr)
                ctx.translate(-position.x, -position.y)
                ctx.scale(position.zoom, position.zoom)
                renderPaths(ctx, history)
            }
        }

        prevHistoryRef.current = history
        prevPositionRef.current = position
        prevResizeTriggerRef.current = resizeTrigger
        
    }, [history, position, resizeTrigger])

    // Re-render active strokes when view changes
    useEffect(() => {
        renderActiveStrokes()
    }, [position, size, brush, resizeTrigger])

    return (
        <div>
            <div className='photograph-a'><Photograph /></div>
            <div className='photograph-b'><Photograph /></div>

            <div className='toolbar'>
                <div className='tools'>
                    <button onPointerDown={() => alert('hi')} className={brush === 'pen' ? 'active' : ''} onClick={() => setBrush('pen')}>
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
                    SHARE<span className='mobile-hidden'> WITH PEOPLE</span>
                </button>
            </div>

            <div
                ref={containerRef}
                onPointerDown={(event) => {
                    event.preventDefault()
                    containerRef.current?.setPointerCapture(event.pointerId)
                    inProgressRef.current.set(event.pointerId, [])
                    renderActiveStrokes()
                }}
                onPointerMove={(event) => {
                    const line = inProgressRef.current.get(event.pointerId)
                    if (!line) return

                    line.push({
                        x: (event.clientX + position.x) / position.zoom,
                        y: (event.clientY + position.y) / position.zoom,
                        pressure: event.pressure,
                    })
                    
                    renderActiveStrokes()
                }}
                onPointerUp={(event) => {
                    containerRef.current?.releasePointerCapture(event.pointerId)
                    
                    if (inProgressRef.current.has(event.pointerId)) {
                        const stroke = pointsToPath(inProgressRef.current.get(event.pointerId)!, size)

                        redo.current = []
                        setHistory(produce((draft) => {
                            draft.push({
                                id: nanoid(),
                                kind: brush,
                                path: stroke,
                            })
                        }))

                        inProgressRef.current.delete(event.pointerId)
                        renderActiveStrokes()
                    }
                }}
                onPointerCancel={(event) => {
                    containerRef.current?.releasePointerCapture(event.pointerId)
                    inProgressRef.current.delete(event.pointerId)
                    renderActiveStrokes()
                }}
                className='container'
                style={{ cursor }}
            >
                <canvas ref={staticCanvasRef} />
                <canvas ref={activeCanvasRef} />
            </div>

            {sharingBlob && <SharingModal pngBlob={sharingBlob} onClose={() => setSharingBlob(null)} />}
        </div>
    )
}
