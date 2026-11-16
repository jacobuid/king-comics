import { createPortal } from 'preact/compat'
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks'

const requirements = [
  { label: '8+', test: value => Array.from(value).length >= 8 },
  { label: 'upper', test: value => /[A-Z]/.test(value) },
  { label: 'lower', test: value => /[a-z]/.test(value) },
  { label: 'number', test: value => /[0-9]/.test(value) },
  { label: 'character', test: value => /[\p{P}\p{S}]/u.test(value) },
]

function Check({ met, children }) {
  return (
    <span class={`password-check${met ? ' is-met' : ''}`}>
      <span class="password-check-icon" aria-hidden="true">{met ? '✓' : ''}</span>
      <span class="sr-only">{met ? 'Met: ' : 'Not met: '}</span>
      {children}
    </span>
  )
}

// Add feedback to SDK-owned fields without replacing its signup/verification flow.
export default function PasswordFeedback({ children }) {
  const root = useRef(null)
  const id = useId()
  const [fields, setFields] = useState({ password: null, confirmation: null })
  const [checks, setChecks] = useState([false, false, false, false, false])
  const [matches, setMatches] = useState(false)

  useLayoutEffect(() => {
    const container = root.current
    const inputs = new Set()
    function update() {
      const password = container.querySelector('input[name="newPassword"]')
      const confirmation = container.querySelector('input[name="confirmPassword"]')
      const hosts = {}
      for (const [name, input] of Object.entries({ password, confirmation })) {
        if (!input) { hosts[name] = null; continue }
        inputs.add(input)
        let host = input.parentElement.querySelector('[data-password-feedback]')
        if (!host) {
          host = document.createElement('div')
          host.dataset.passwordFeedback = name
          host.id = `${id}-${name}`
          input.insertAdjacentElement('afterend', host)
        }
        input.setAttribute('aria-describedby', host.id)
        hosts[name] = host
      }
      setFields(previous => previous.password === hosts.password && previous.confirmation === hosts.confirmation ? previous : hosts)
      const value = password?.value ?? ''
      const nextChecks = requirements.map(requirement => requirement.test(value))
      setChecks(previous => previous.every((met, index) => met === nextChecks[index]) ? previous : nextChecks)
      const confirmed = Boolean(value && confirmation?.value && value === confirmation.value)
      setMatches(confirmed)
      if (confirmation) confirmation.setCustomValidity(confirmation.value && !confirmed ? 'Passwords must match.' : '')
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(container, { childList: true, subtree: true })
    container.addEventListener('input', update)
    container.addEventListener('change', update)
    container.addEventListener('focusin', update)
    return () => {
      observer.disconnect()
      container.removeEventListener('input', update)
      container.removeEventListener('change', update)
      container.removeEventListener('focusin', update)
      for (const input of inputs) input.setCustomValidity('')
    }
  }, [id])

  return (
    <div ref={root}>
      {children}
      {fields.password && createPortal(
        <div class="password-requirements" aria-label="Password requirements" aria-live="polite">
          {requirements.map((requirement, index) => <Check key={requirement.label} met={checks[index]}>{requirement.label}</Check>)}
        </div>, fields.password,
      )}
      {fields.confirmation && createPortal(
        <div class="password-match" aria-live="polite"><Check met={matches}>Passwords match</Check></div>, fields.confirmation,
      )}
    </div>
  )
}
