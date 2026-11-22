import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

function AccordionSection({
  bodyClassName = '',
  children,
  className = '',
  count,
  defaultOpen = false,
  headerClassName = '',
  id,
  lazy = false,
  onOpenChange,
  open,
  subtitle,
  title,
}) {
  const reactId = useId()
  const sectionId = id || `accordion-${reactId}`
  const buttonId = `${sectionId}-button`
  const panelId = `${sectionId}-panel`
  const isControlled = typeof open === 'boolean'
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = isControlled ? open : internalOpen
  const [hasOpened, setHasOpened] = useState(isOpen)
  const [height, setHeight] = useState(isOpen ? 'auto' : 0)
  const bodyRef = useRef(null)
  const frameRef = useRef(0)
  const heightRef = useRef(height)

  const shouldRender = !lazy || hasOpened || isOpen
  const countLabel = typeof count === 'number' ? count.toLocaleString() : count

  useEffect(() => {
    if (isOpen) setHasOpened(true)
  }, [isOpen])

  useEffect(() => {
    heightRef.current = height
  }, [height])

  useLayoutEffect(() => {
    if (!shouldRender || !bodyRef.current) return undefined

    const body = bodyRef.current
    window.cancelAnimationFrame(frameRef.current)

    if (isOpen) {
      if (heightRef.current !== 'auto') {
        setHeight(body.scrollHeight)
      }
    } else {
      setHeight(body.scrollHeight)
      frameRef.current = window.requestAnimationFrame(() => {
        setHeight(0)
      })
    }

    if (typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(() => {
      if (isOpen && heightRef.current !== 'auto') {
        setHeight(body.scrollHeight)
      }
    })
    observer.observe(body)

    return () => {
      window.cancelAnimationFrame(frameRef.current)
      observer.disconnect()
    }
  }, [isOpen, shouldRender])

  function handlePanelTransitionEnd(event) {
    if (event.target === event.currentTarget && event.propertyName === 'height' && isOpen) {
      setHeight('auto')
    }
  }

  function handleToggle() {
    const nextOpen = !isOpen
    if (!isControlled) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  return (
    <section className={`accordion-section${isOpen ? ' accordion-section--open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className={`accordion-section__header${headerClassName ? ` ${headerClassName}` : ''}`}
        id={buttonId}
        onClick={handleToggle}
        type="button"
      >
        <span className="accordion-section__chevron" aria-hidden="true">&gt;</span>
        <span className="accordion-section__title-group">
          <span className="accordion-section__title">{title}</span>
          {subtitle ? <span className="accordion-section__subtitle">{subtitle}</span> : null}
        </span>
        {countLabel !== undefined && countLabel !== null ? (
          <span className="accordion-section__count">{countLabel}</span>
        ) : null}
      </button>

      <div
        aria-labelledby={buttonId}
        className="accordion-section__panel"
        id={panelId}
        onTransitionEnd={handlePanelTransitionEnd}
        role="region"
        style={{ height }}
      >
        {shouldRender ? (
          <div className={`accordion-section__body${bodyClassName ? ` ${bodyClassName}` : ''}`} ref={bodyRef}>
            {children}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default AccordionSection
