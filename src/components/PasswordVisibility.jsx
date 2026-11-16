import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { useLayoutEffect, useRef } from 'preact/hooks'

export default function PasswordVisibility({ children }) {
  const root = useRef(null)

  useLayoutEffect(() => {
    const container = root.current
    const fields = new Map()
    function updateButton(input, button) {
      const visible = input.type === 'text'
      const label = visible ? 'Hide password' : 'Show password'
      button.setAttribute('aria-label', label)
      button.setAttribute('aria-pressed', String(visible))
      button.title = label
      const [width, height, , , path] = (visible ? faEyeSlash : faEye).icon
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      svg.setAttribute('aria-hidden', 'true')
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      shape.setAttribute('d', path)
      svg.append(shape)
      button.replaceChildren(svg)
    }
    function discover() {
      for (const input of fields.keys()) if (!container.contains(input)) fields.delete(input)
      for (const input of container.querySelectorAll('.king-auth-field input[type="password"]')) {
        if (fields.has(input) && fields.get(input).isConnected) continue
        const host = document.createElement('span')
        host.className = 'password-toggle-host'
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'password-toggle'
        if (input.id) button.setAttribute('aria-controls', input.id)
        button.addEventListener('click', () => {
          input.type = input.type === 'password' ? 'text' : 'password'
          updateButton(input, button)
        })
        updateButton(input, button)
        host.append(button)
        input.parentElement.classList.add('has-password-toggle')
        input.insertAdjacentElement('afterend', host)
        fields.set(input, button)
      }
    }
    // The SDK clears password inputs after success by type; remask before it submits.
    function hidePasswords() {
      for (const [input, button] of fields) {
        if (input.type === 'text') {
          input.type = 'password'
          updateButton(input, button)
        }
      }
    }
    discover()
    const observer = new MutationObserver(discover)
    observer.observe(container, { childList: true, subtree: true })
    container.addEventListener('submit', hidePasswords, true)
    return () => {
      observer.disconnect()
      container.removeEventListener('submit', hidePasswords, true)
      hidePasswords()
      for (const [input, button] of fields) {
        input.parentElement?.classList.remove('has-password-toggle')
        button.parentElement?.remove()
      }
    }
  }, [])

  return <div class="password-visibility-root" ref={root}>{children}</div>
}
