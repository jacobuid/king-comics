import {
  faArrowLeft,
  faArrowRight,
  faArrowsLeftRight,
  faHandPointer,
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

function GestureGuide({ onDismiss }) {
  return (
    <div class="gesture-guide-layer">
      <div class="gesture-guide-wrap">
        <aside class="gesture-guide-popover" role="dialog" aria-labelledby="gesture-guide-title">
          <span class="gesture-guide-kicker">Quick controls</span>
          <h2 id="gesture-guide-title">Navigate with a tap or swipe</h2>

          <div class="gesture-demos">
            <TapGesture direction="left" />
            <TapGesture direction="right" />
          </div>

          <div class="gesture-swipe-tip">
            <FontAwesomeIcon icon={faArrowsLeftRight} />
            <span><strong>Swipe or drag</strong> across the page to move too.</span>
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
