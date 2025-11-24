import getStroke from 'perfect-freehand'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

export interface Point {
    x: number
    y: number
    pressure?: number
}

export interface Action {
    id: string
    kind: 'pen' | 'eraser'
    path: [number, number][]
}

export function pointsToPath(points: Point[], size: number): [number, number][] {
    return getStroke(points, {
        size,
        thinning: 0.25,
        streamline: 0.5,
        smoothing: 0.5,
    }) satisfies number[][] as [number, number][]
}

export function drawPath(ctx: CanvasRenderingContext2D, points: [number, number][]) {
    if (points.length < 2) return

    ctx.beginPath()
    const p0 = points[0]!
    ctx.moveTo(p0[0], p0[1])
    
    for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i]!
        const [x1, y1] = points[i+1]!
        const midX = (x0 + x1) / 2
        const midY = (y0 + y1) / 2
        ctx.quadraticCurveTo(x0, y0, midX, midY)
    }
    
    ctx.closePath()
    ctx.fill()
}

export function renderPaths(ctx: CanvasRenderingContext2D, history: Action[], color: string = 'black') {
    ctx.fillStyle = color
    
    for (const action of history) {
        ctx.globalCompositeOperation = action.kind === 'eraser' ? 'destination-out' : 'source-over'
        drawPath(ctx, action.path)
    }
}

export function pathToSvgD(points: [number, number][]): string {
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

export function getBounds(points: [number, number][]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of points) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
    }
    return { minX, minY, maxX, maxY }
}

export async function exportAsPng(history: Action[]): Promise<Blob> {
    // Calculate global bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let hasContent = false
    
    for (const action of history) {
        if (action.kind === 'pen') {
            const b = getBounds(action.path)
            if (b.minX < minX) minX = b.minX
            if (b.minY < minY) minY = b.minY
            if (b.maxX > maxX) maxX = b.maxX
            if (b.maxY > maxY) maxY = b.maxY
            hasContent = true
        }
    }

    if (!hasContent) {
         minX = 0; minY = 0; maxX = 0; maxY = 0;
    }
    
    const padding = 20
    const width = Math.ceil(maxX - minX + padding * 2)
    const height = Math.ceil(maxY - minY + padding * 2)
    
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    
    // Translate to center the content with padding
    ctx.translate(-minX + padding, -minY + padding)
    
    renderPaths(ctx, history)
    
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    
    // Crop transparent pixels
    let cMinX = width
    let cMinY = height
    let cMaxX = 0
    let cMaxY = 0
    let found = false

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3]!
            if (alpha > 0) {
                if (x < cMinX) cMinX = x
                if (x > cMaxX) cMaxX = x
                if (y < cMinY) cMinY = y
                if (y > cMaxY) cMaxY = y
                found = true
            }
        }
    }

    const cropWidth = found ? cMaxX - cMinX + 1 : 0
    const cropHeight = found ? cMaxY - cMinY + 1 : 0

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = cropWidth + padding * 2
    outputCanvas.height = cropHeight + padding * 2
    const outCtx = outputCanvas.getContext('2d')!

    outCtx.fillStyle = '#ffffff'
    outCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height)

    if (found) {
        outCtx.drawImage(
            canvas,
            cMinX, cMinY, cropWidth, cropHeight,
            padding, padding, cropWidth, cropHeight
        )
    }
    
    return new Promise<Blob>((resolve, reject) => {
        outputCanvas.toBlob((canvasBlob) => {
            if (canvasBlob) {
                resolve(canvasBlob)
            } else {
                reject(new Error('Canvas to Blob failed'))
            }
        })
    })
}

export interface CanvasPosition {
    zoom: number
    x: number
    y: number
}

export type Brush = 'pen' | 'eraser'

export function useLocalState<Type>(
    key: string,
    defaultValue: Type
): [Type, Dispatch<SetStateAction<Type>>] {
    const [state, setState] = useState<Type>(() => {
        const stored = localStorage.getItem(key)
        if (stored !== null) return JSON.parse(stored)
        return defaultValue
    })

    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(state))
    }, [state])

    return [state, setState]
}

export function useBlobjectUrl(blob: Blob): string | null {
    const [url, setUrl] = useState<string | null>(null)
    useEffect(() => {
        const objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        return () => {
            URL.revokeObjectURL(objectUrl)
        }
    }, [blob])
    return url
}