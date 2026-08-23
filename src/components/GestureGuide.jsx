import {
  faArrowDown,
  faArrowLeft,
  faArrowRight,
  faArrowUp,
  faArrowsLeftRight,
  faArrowsUpDown,
  faComputerMouse,
  faHandPointer,
  faKeyboard,
} from '@fortawesome/free-solid-svg-icons'
import FontAwesomeIcon from './FontAwesomeIcon.jsx'

const keyboardControls = {
  left: { key: '←', label: 'Left arrow key', result: 'Previous page' },
  right: { key: '→', label: 'Right arrow key', result: 'Next page' },
  up: { key: '↑', label: 'Up arrow key', result: 'Scroll up' },
  down: { key: '↓', label: 'Down arrow key', result: 'Scroll down' },
}

function TapGesture({ direction }) {
  const isLeft = direction === 'left'

  return (
    <div class={`gesture-demo gesture-demo-${direction}`}>
      <div class="gesture-animation" aria-hidden="true">
        <FontAwesomeIcon icon={isLeft ? faArrowLeft : faArrowRight} class="gesture-arrow-icon" />
        <span class="gesture-tap-rings"><i /><i /></span>
        <FontAwesomeIcon icon={faHandPointer} class="gesture-hand-icon" />
      </div>
      <strong>Double tap {direction}</strong>
      <span>{isLeft ? 'Previous page' : 'Next page'}</span>
    </div>
  )
}

function SwipeGesture({ direction }) {
  const isUp = direction === 'up'

  return (
    <div class={`gesture-demo vertical-gesture-demo vertical-gesture-${direction}`}>
      <div class="vertical-swipe-animation" aria-hidden="true">
        <FontAwesomeIcon icon={isUp ? faArrowUp : faArrowDown} class="vertical-swipe-arrow" />
        <FontAwesomeIcon icon={faHandPointer} class="vertical-swipe-hand" />
      </div>
      <strong>Swipe {direction}</strong>
      <span>{isUp ? 'Read farther down' : 'Go back up'}</span>
    </div>
  )
}

function SnapGesture({ isTouchDevice }) {
  return (
    <div class="gesture-demo gesture-demo-snap">
      <div class="gesture-animation continuous-snap-animation" aria-hidden="true">
        <FontAwesomeIcon icon={faArrowDown} class="gesture-arrow-icon snap-arrow-icon" />
        <span class="gesture-tap-rings"><i /><i /></span>
        <FontAwesomeIcon icon={faHandPointer} class="gesture-hand-icon" />
      </div>
      <strong>{isTouchDevice ? 'Double tap a page' : 'Double-click a page'}</strong>
      <span>Snap to the next page</span>
    </div>
  )
}

function KeyboardControl({ direction }) {
  const control = keyboardControls[direction]

  return (
    <div class={`gesture-demo keyboard-demo keyboard-demo-${direction}`}>
      <div class="keyboard-animation" aria-hidden="true">
        <kbd>{control.key}</kbd>
        <FontAwesomeIcon icon={faHandPointer} class="keyboard-hand-icon" />
      </div>
      <strong>{control.label}</strong>
      <span>{control.result}</span>
    </div>
  )
}

function GestureGuide({ isTouchDevice, readerMode = 'single', onClose, onDismiss }) {
  const continuous = readerMode === 'continuous'
  const title = continuous
    ? (isTouchDevice ? 'Scroll with a vertical swipe' : 'Scroll with keys or a trackpad')
    : (isTouchDevice ? 'Navigate with a tap or swipe' : 'Navigate with your keyboard')

  return (
    <div class="gesture-guide-layer" onClick={onClose}>
      <div class="gesture-guide-wrap" onClick={(event) => event.stopPropagation()}>
        <aside class="gesture-guide-popover" role="dialog" aria-labelledby="gesture-guide-title">
          <span class="gesture-guide-kicker">Quick controls</span>
          <h2 id="gesture-guide-title">{title}</h2>

          <div class="gesture-demos">
            {continuous ? (
              isTouchDevice ? (
                <>
                  <SwipeGesture direction="up" />
                  <SwipeGesture direction="down" />
                  <SnapGesture isTouchDevice />
                </>
              ) : (
                <>
                  <KeyboardControl direction="up" />
                  <KeyboardControl direction="down" />
                  <SnapGesture isTouchDevice={false} />
                </>
              )
            ) : isTouchDevice ? (
              <>
                <TapGesture direction="left" />
                <TapGesture direction="right" />
              </>
            ) : (
              <>
                <KeyboardControl direction="left" />
                <KeyboardControl direction="right" />
              </>
            )}
          </div>

          <div class="gesture-swipe-tip">
            <FontAwesomeIcon icon={continuous
              ? (isTouchDevice ? faArrowsUpDown : faComputerMouse)
              : (isTouchDevice ? faArrowsLeftRight : faKeyboard)} />
            <span>
              {continuous ? (
                isTouchDevice
                  ? <><strong>Double tap a page</strong> to snap forward, or swipe to scroll.</>
                  : <><strong>Double-click a page</strong> to snap forward, or use a trackpad.</>
              ) : (
                isTouchDevice
                  ? <><strong>Swipe or drag</strong> across the page to move too.</>
                  : <><strong>Press either arrow key</strong> or click the page controls.</>
              )}
            </span>
          </div>
        </aside>

        <button class="gesture-guide-dismiss" type="button" onClick={onDismiss}>
          Got it — don't show this again
        </button>
      </div>
    </div>
  )
}

export default GestureGuide
