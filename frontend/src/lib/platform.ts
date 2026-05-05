// Detect OS for shortcut labels
export const isMac = navigator.platform.toUpperCase().includes('MAC')

// Modifier key symbol for display
export const modKey = isMac ? '⌘' : 'Ctrl'
export const modLabel = isMac ? '⌘' : 'Ctrl+'

// Check if modifier is held in a keyboard event
export function hasMod(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}
