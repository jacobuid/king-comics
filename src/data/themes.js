export const themes = [
  { id: 'blue', label: 'Blue', color: '#167af0' },
  { id: 'red', label: 'Red', color: '#d93646' },
  { id: 'green', label: 'Green', color: '#219653' },
  { id: 'orange', label: 'Orange', color: '#ed7d22' },
  { id: 'purple', label: 'Purple', color: '#8b5cf6' },
  { id: 'pink', label: 'Pink', color: '#e54891' },
  { id: 'yellow', label: 'Yellow', color: '#e7b416' },
]

export function validTheme(theme) {
  return themes.some((option) => option.id === theme)
}
