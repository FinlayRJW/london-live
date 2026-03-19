import { useRef, useCallback, useEffect, type ReactNode } from "react";
import { useMapStore } from "../stores/mapStore.ts";

/** Snap points as fractions of viewport height */
const SNAP_CLOSED = 0;
const SNAP_HALF = 0.5;
const SNAP_FULL = 0.92;
const SNAPS = [SNAP_CLOSED, SNAP_HALF, SNAP_FULL];

function closestSnap(fraction: number): number {
  let best = SNAPS[0];
  let bestDist = Math.abs(fraction - best);
  for (let i = 1; i < SNAPS.length; i++) {
    const dist = Math.abs(fraction - SNAPS[i]);
    if (dist < bestDist) {
      best = SNAPS[i];
      bestDist = dist;
    }
  }
  return best;
}

interface BottomSheetProps {
  children: ReactNode;
}

export function BottomSheet({ children }: BottomSheetProps) {
  const open = useMapStore((s) => s.bottomSheetOpen);
  const setOpen = useMapStore((s) => s.setBottomSheetOpen);

  const sheetRef = useRef<HTMLDivElement>(null);
  const snapRef = useRef(SNAP_CLOSED);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startSnap = useRef(0);

  const animateTo = useCallback((snap: number) => {
    snapRef.current = snap;
    const el = sheetRef.current;
    if (!el) return;
    const translateY = (1 - snap) * 100;
    el.style.transition = "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
    el.style.transform = `translateY(${translateY}%)`;
  }, []);

  // Sync open state -> animation
  useEffect(() => {
    if (open) {
      animateTo(SNAP_HALF);
      document.body.classList.add("sheet-open");
    } else {
      animateTo(SNAP_CLOSED);
      document.body.classList.remove("sheet-open");
    }
    return () => {
      document.body.classList.remove("sheet-open");
    };
  }, [open, animateTo]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      startY.current = e.clientY;
      startSnap.current = snapRef.current;
      const el = sheetRef.current;
      if (el) el.style.transition = "none";
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dy = startY.current - e.clientY;
      const vh = window.innerHeight;
      const deltaFrac = dy / vh;
      const newSnap = Math.max(0, Math.min(SNAP_FULL, startSnap.current + deltaFrac));
      const el = sheetRef.current;
      if (el) {
        el.style.transform = `translateY(${(1 - newSnap) * 100}%)`;
      }
      snapRef.current = newSnap;
    },
    [],
  );

  const handlePointerUp = useCallback(
    () => {
      if (!dragging.current) return;
      dragging.current = false;
      const snap = closestSnap(snapRef.current);
      animateTo(snap);
      if (snap === SNAP_CLOSED) {
        setOpen(false);
      }
    },
    [animateTo, setOpen],
  );

  const handleBackdropClick = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[1100]"
          onClick={handleBackdropClick}
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-[1200] flex flex-col bg-sidebar-bg rounded-t-2xl shadow-2xl"
        style={{
          height: `${SNAP_FULL * 100}vh`,
          transform: "translateY(100%)",
          willChange: "transform",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
}
