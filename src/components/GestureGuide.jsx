import {
  faArrowLeft,
  faArrowRight,
  faArrowsLeftRight,
  faHandPointer,
  faKeyboard,
} from '@fortawesome/free-solid-svg-icons'
import FontAwesomeIcon from './FontAwesomeIcon.jsx'

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

function KeyboardControl({ direction }) {
  const isLeft = direction === 'left'

  return (
    <div class={`gesture-demo keyboard-demo keyboard-demo-${direction}`}>
      <div class="keyboard-animation" aria-hidden="true">
        <kbd>{isLeft ? '←' : '→'}</kbd>
        <FontAwesomeIcon icon={faHandPointer} class="keyboard-hand-icon" />
      </div>
      <strong>{isLeft ? 'Left arrow key' : 'Right arrow key'}</strong>
      <span>{isLeft ? 'Previous page' : 'Next page'}</span>
    </div>
  )
}

function GestureGuide({ isTouchDevice, onClose, onDismiss }) {
  return (
    <div class="gesture-guide-layer" onClick={onClose}>
      <div class="gesture-guide-wrap" onClick={(event) => event.stopPropagation()}>
        <aside class="gesture-guide-popover" role="dialog" aria-labelledby="gesture-guide-title">
          <span class="gesture-guide-kicker">Quick controls</span>
          <h2 id="gesture-guide-title">
            {isTouchDevice ? 'Navigate with a tap or swipe' : 'Navigate with your keyboard'}
          </h2>

          <div class="gesture-demos">
            {isTouchDevice ? (
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
            <FontAwesomeIcon icon={isTouchDevice ? faArrowsLeftRight : faKeyboard} />
            <span>
              {isTouchDevice
                ? <><strong>Swipe or drag</strong> across the page to move too.</>
                : <><strong>Press either arrow key</strong> or click the page controls.</>}
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
