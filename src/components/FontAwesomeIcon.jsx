function FontAwesomeIcon({ icon, class: className = '', ...props }) {
  const [width, height, , , pathData] = icon.icon
  const paths = Array.isArray(pathData) ? pathData : [pathData]

  return (
    <svg
      class={className}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths.map((path, index) => <path d={path} key={index} />)}
    </svg>
  )
}

export default FontAwesomeIcon
