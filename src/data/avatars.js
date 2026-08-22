import { sitePath } from '../utils/sitePath.js'

export const avatars = [
  'amy-1.jpg',
  'archie-1.jpg',
  'betty-1.jpg',
  'charmy-1.jpg',
  'espio-1.jpg',
  'espio-2.jpg',
  'fluttershy-1.jpg',
  'knuckles-1.jpg',
  'knuckles-2.jpg',
  'megaman-1.jpg',
  'megaman-2.jpg',
  'megamanx-1.jpg',
  'megamanx-2.jpg',
  'mighty-1.jpg',
  'pinky-pie-1.jpg',
  'rainbow-dash-1.jpg',
  'rarity-1.jpg',
  'shadow-1.jpg',
  'shadow-2.jpg',
  'sonic-1.jpg',
  'sonic-2.jpg',
  'spidey-1.jpg',
  'spidey-2.jpg',
  'tails-1.jpg',
  'twilight-1.jpg',
  'vector-1.jpg',
  'veronica-1.jpg',
]

export function avatarPath(avatar) {
  return avatar ? sitePath(`/avatars/${avatar}`) : ''
}
