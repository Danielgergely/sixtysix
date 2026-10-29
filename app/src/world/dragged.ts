import { createContext, useContext } from 'react'

/** True right after a drag or pinch (PanZoom), so a tap handler can ignore the click that ends it. */
export const DraggedContext = createContext<() => boolean>(() => false)
export const useWasDragged = () => useContext(DraggedContext)
