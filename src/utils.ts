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

function getBounds(points: [number, number][]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of points) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
    }
    return { minX, minY, maxX, maxY }
}

export function processHistory(history: Action[]) {
    const eraserActions = history.filter((action) => action.kind === 'eraser')
    
    const groups: { 
        strokes: Action[], 
        relevantErasers: Action[],
        bounds: { minX: number, minY: number, maxX: number, maxY: number } 
    }[] = []
    
    let currentStrokes: Action[] = []
    let eraserIdx = 0

    const flushGroup = () => {
        if (currentStrokes.length > 0) {
            let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity
            for (const s of currentStrokes) {
                const b = getBounds(s.path)
                if (b.minX < gMinX) gMinX = b.minX
                if (b.minY < gMinY) gMinY = b.minY
                if (b.maxX > gMaxX) gMaxX = b.maxX
                if (b.maxY > gMaxY) gMaxY = b.maxY
            }
            
            groups.push({
                strokes: currentStrokes,
                relevantErasers: eraserActions.slice(eraserIdx),
                bounds: { minX: gMinX, minY: gMinY, maxX: gMaxX, maxY: gMaxY }
            })
            currentStrokes = []
        }
    }

    for (const action of history) {
        if (action.kind === 'eraser') {
            flushGroup()
            eraserIdx++
        } else {
            currentStrokes.push(action)
        }
    }
    flushGroup()
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const g of groups) {
        if (g.bounds.minX < minX) minX = g.bounds.minX
        if (g.bounds.minY < minY) minY = g.bounds.minY
        if (g.bounds.maxX > maxX) maxX = g.bounds.maxX
        if (g.bounds.maxY > maxY) maxY = g.bounds.maxY
    }
    
    if (minX === Infinity) {
        minX = 0; minY = 0; maxX = 0; maxY = 0;
    }

    return {
        groups,
        eraserActions,
        bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
    }
}

export async function exportAsPng(history: Action[]): Promise<Blob> {
    const { groups, eraserActions, bounds } = processHistory(history)
    const padding = 20
    const maskPadding = 100
    
    const width = Math.ceil(bounds.width + padding * 2)
    const height = Math.ceil(bounds.height + padding * 2)
    const x = bounds.minX - padding
    const y = bounds.minY - padding

    let defs = ''
    eraserActions.forEach(e => {
        defs += `<path id='eraser-${e.id}' d='${pathToSvgD(e.path)}' />`
    })

    let content = ''
    
    groups.forEach((g, i) => {
        const groupContent = g.strokes.map(s => `<path d='${pathToSvgD(s.path)}' fill='black' />`).join('')
        
        if (g.relevantErasers.length > 0) {
            const maskId = `mask-gen-${i}`
            const maskRect = `<rect x='${g.bounds.minX - maskPadding}' y='${g.bounds.minY - maskPadding}' width='${g.bounds.maxX - g.bounds.minX + maskPadding * 2}' height='${g.bounds.maxY - g.bounds.minY + maskPadding * 2}' fill='white' />`
            const maskErasers = g.relevantErasers.map(e => `<use href='#eraser-${e.id}' fill='black' />`).join('')
            
            defs += `<mask id='${maskId}'>${maskRect}${maskErasers}</mask>`
            content += `<g mask='url(#${maskId})'>${groupContent}</g>`
        } else {
            content += `<g>${groupContent}</g>`
        }
    })
    
    const svgString = `
        <svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='${x} ${y} ${width} ${height}'>
            <defs>${defs}</defs>
            ${content}
        </svg>
    `
    
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    
    const img = new Image()
    img.src = url
    
    await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
    })
    
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let found = false

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3]!
            if (alpha > 0) {
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
                found = true
            }
        }
    }

    const cropWidth = found ? maxX - minX + 1 : 0
    const cropHeight = found ? maxY - minY + 1 : 0

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = cropWidth + padding * 2
    outputCanvas.height = cropHeight + padding * 2
    const outCtx = outputCanvas.getContext('2d')!

    outCtx.fillStyle = '#ffffff'
    outCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height)

    if (found) {
        outCtx.drawImage(
            canvas,
            minX, minY, cropWidth, cropHeight,
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