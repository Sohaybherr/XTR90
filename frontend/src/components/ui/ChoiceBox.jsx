function ChoiceBox({ ariaLabel, className = '', items, onChange, value }) {
  return (
    <div className={`choice-box${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const isActive = item.value === value

        return (
          <button
            aria-selected={isActive}
            className={`choice-box__button${isActive ? ' choice-box__button--active' : ''}`}
            key={item.value}
            onClick={() => onChange(item.value)}
            role="tab"
            type="button"
          >
            <span>{item.label}</span>
            {item.count !== undefined && item.count !== null ? <small>{item.count}</small> : null}
          </button>
        )
      })}
    </div>
  )
}

export default ChoiceBox
