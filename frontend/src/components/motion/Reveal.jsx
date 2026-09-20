import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Reveals its children once they scroll into view.
 * Purely additive: with JS disabled or reduced motion on, content is simply visible.
 */
export function Reveal({ as: Tag = 'div', delay = 0, className, children, ...props }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return setVisible(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setVisible(true);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect(); // reveal once, never re-hide
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} data-visible={visible} style={{ transitionDelay: delay ? `${delay}ms` : undefined }} className={cn('reveal', className)} {...props}>
      {children}
    </Tag>
  );
}

/** Staggers a list of children by a fixed step. */
export function RevealGroup({ children, step = 60, className, as: Tag = 'div', itemAs = 'div', ...props }) {
  return (
    <Tag className={className} {...props}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <Reveal as={itemAs} key={child?.key ?? i} delay={i * step}>
              {child}
            </Reveal>
          ))
        : children}
    </Tag>
  );
}
