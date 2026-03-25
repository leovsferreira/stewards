/**
 * Module-level ref shared between useDrawPolygon and useStreetView
 * so that street-view clicks are suppressed while a polygon is being drawn.
 */
export const isDrawingRef = { current: false };