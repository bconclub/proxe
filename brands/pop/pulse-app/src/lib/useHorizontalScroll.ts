/** Web hook: makes a horizontal ScrollView slide on desktop via mouse-wheel AND
 *  click-drag (grab to slide). A drag past a few px suppresses the trailing click
 *  so dragging the row doesn't accidentally select a chip. No-op on native. */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export function useHorizontalScroll() {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;
    const node = ref.current.getScrollableNode ? ref.current.getScrollableNode() : ref.current;
    if (!node || !node.addEventListener) return;

    const onWheel = (e: any) => {
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        node.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };

    let down = false;
    let moved = false;
    let startX = 0;
    let startLeft = 0;
    const onDown = (e: any) => {
      down = true;
      moved = false;
      startX = e.clientX;
      startLeft = node.scrollLeft;
    };
    const onMove = (e: any) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      node.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      if (moved) {
        // swallow the click that follows a drag so no chip gets selected
        const supp = (ev: any) => {
          ev.stopPropagation();
          ev.preventDefault();
          node.removeEventListener('click', supp, true);
        };
        node.addEventListener('click', supp, true);
        setTimeout(() => node.removeEventListener('click', supp, true), 60);
      }
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    node.style.cursor = 'grab';
    node.style.userSelect = 'none';

    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return ref;
}
