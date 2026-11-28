import { useCallback, useEffect, useRef, useState } from 'react';

const MOUSE_DRAG_THRESHOLD_PX = 5;
const TOUCH_CANCEL_SCROLL_PX = 8;
const TOUCH_LONG_PRESS_MS = 220;
const SNAP_DURATION_MS = 170;
const RETURN_DURATION_MS = 230;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getDropSecFromPoint(clientX, clientY) {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') {
    return null;
  }
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    const target = el.closest?.('[data-drop-sec]');
    if (target) {
      return target.getAttribute('data-drop-sec');
    }
  }
  return null;
}

function getTargetRectForSec(sec, clientX, clientY) {
  if (typeof document === 'undefined' || !sec) {
    return null;
  }

  if (typeof document.elementsFromPoint === 'function') {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const el of elements) {
      const slot = el.closest?.('.drop-zone-slot[data-drop-sec]');
      if (slot && slot.getAttribute('data-drop-sec') === sec) {
        return slot.getBoundingClientRect();
      }
    }
  }

  const escapedSec =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(sec)
      : sec;

  const firstSlot = document.querySelector(`.drop-zone-slot[data-drop-sec="${escapedSec}"]`);
  if (firstSlot) {
    return firstSlot.getBoundingClientRect();
  }

  const fallbackEl = document.querySelector(`[data-drop-sec="${escapedSec}"]`);
  return fallbackEl ? fallbackEl.getBoundingClientRect() : null;
}

/**
 * Custom Pointer Drag hook สำหรับลากการ์ดรายวิชาสลับ Section พร้อมแอนิเมชัน snap / return
 */
export function usePointerSectionDrag({ onCommitSwitch }) {
  const [dragState, setDragState] = useState(null);

  const commitRef = useRef(onCommitSwitch);
  commitRef.current = onCommitSwitch;

  const sessionRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const animTimerRef = useRef(null);
  const cleanupListenersRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (animTimerRef.current !== null) {
      window.clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
  }, []);

  const detachSession = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
      cleanupListenersRef.current = null;
    }
    if (typeof document !== 'undefined') {
      document.body.classList.remove('is-timetable-dragging');
    }
    sessionRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      detachSession();
      clearTimers();
    };
  }, [detachSession, clearTimers]);

  const startPointerTracking = useCallback(
    (event, { course }) => {
      if (!course || !event) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.target.closest?.('button, a, input')) return;

      detachSession();
      clearTimers();

      const rect = event.currentTarget.getBoundingClientRect();
      const originRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };

      const session = {
        pointerId: event.pointerId,
        pointerType: event.pointerType || 'mouse',
        subjectId: course.subjectId,
        course,
        originRect,
        startX: event.clientX,
        startY: event.clientY,
        grabOffsetX: event.clientX - rect.left,
        grabOffsetY: event.clientY - rect.top,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        active: false,
        hoverSec: null,
      };

      sessionRef.current = session;

      function activateDrag(clientX, clientY) {
        if (sessionRef.current !== session || session.active) return;
        session.active = true;
        session.lastClientX = clientX;
        session.lastClientY = clientY;
        document.body.classList.add('is-timetable-dragging');

        setDragState({
          phase: 'dragging',
          subjectId: session.subjectId,
          course: session.course,
          originRect: session.originRect,
          x: clientX - session.grabOffsetX,
          y: clientY - session.grabOffsetY,
          width: session.originRect.width,
          height: session.originRect.height,
          tilt: 0,
          hoverSec: null,
          targetRect: null,
        });
      }

      function finishDrag({ canceled, clientX, clientY }) {
        const wasActive = session.active;
        const targetSec = canceled ? null : session.hoverSec;
        const subjectId = session.subjectId;

        detachSession();

        if (!wasActive) {
          return;
        }

        const reduced = prefersReducedMotion();

        if (targetSec) {
          const targetRectRaw = getTargetRectForSec(targetSec, clientX, clientY);
          const targetRect = targetRectRaw
            ? {
                left: targetRectRaw.left,
                top: targetRectRaw.top,
                width: targetRectRaw.width,
                height: targetRectRaw.height,
              }
            : null;

          if (reduced || !targetRect) {
            commitRef.current?.(subjectId, targetSec);
            setDragState(null);
            return;
          }

          setDragState((prev) =>
            prev
              ? {
                  ...prev,
                  phase: 'snapping',
                  x: targetRect.left,
                  y: targetRect.top,
                  width: targetRect.width,
                  height: targetRect.height,
                  tilt: 0,
                  targetRect,
                }
              : null
          );

          animTimerRef.current = window.setTimeout(() => {
            animTimerRef.current = null;
            commitRef.current?.(subjectId, targetSec);
            setDragState(null);
          }, SNAP_DURATION_MS);
          return;
        }

        if (reduced) {
          setDragState(null);
          return;
        }

        setDragState((prev) =>
          prev
            ? {
                ...prev,
                phase: 'returning',
                x: prev.originRect.left,
                y: prev.originRect.top,
                width: prev.originRect.width,
                height: prev.originRect.height,
                tilt: 0,
                hoverSec: null,
              }
            : null
        );

        animTimerRef.current = window.setTimeout(() => {
          animTimerRef.current = null;
          setDragState(null);
        }, RETURN_DURATION_MS);
      }

      function handlePointerMove(moveEvent) {
        if (sessionRef.current !== session || moveEvent.pointerId !== session.pointerId) {
          return;
        }

        const dist = Math.hypot(
          moveEvent.clientX - session.startX,
          moveEvent.clientY - session.startY
        );

        if (!session.active) {
          if (session.pointerType === 'touch') {
            session.lastClientX = moveEvent.clientX;
            session.lastClientY = moveEvent.clientY;
            if (dist > TOUCH_CANCEL_SCROLL_PX) {
              detachSession();
            }
            return;
          }

          if (dist > MOUSE_DRAG_THRESHOLD_PX) {
            activateDrag(moveEvent.clientX, moveEvent.clientY);
          } else {
            return;
          }
        }

        const dx = moveEvent.clientX - session.lastClientX;
        session.lastClientX = moveEvent.clientX;
        session.lastClientY = moveEvent.clientY;

        const tilt = Math.max(-4, Math.min(4, dx * 0.35));
        const hoverSec = getDropSecFromPoint(moveEvent.clientX, moveEvent.clientY);
        session.hoverSec = hoverSec;

        setDragState((prev) =>
          prev && prev.phase === 'dragging'
            ? {
                ...prev,
                x: moveEvent.clientX - session.grabOffsetX,
                y: moveEvent.clientY - session.grabOffsetY,
                tilt,
                hoverSec,
              }
            : prev
        );
      }

      function handleTouchMove(touchEvent) {
        if (sessionRef.current === session && session.active) {
          touchEvent.preventDefault();
        }
      }

      function handlePointerUp(upEvent) {
        if (sessionRef.current !== session || upEvent.pointerId !== session.pointerId) {
          return;
        }
        if (session.active) {
          session.hoverSec = getDropSecFromPoint(upEvent.clientX, upEvent.clientY);
        }
        finishDrag({
          canceled: false,
          clientX: upEvent.clientX,
          clientY: upEvent.clientY,
        });
      }

      function handlePointerCancel(cancelEvent) {
        if (sessionRef.current !== session || cancelEvent.pointerId !== session.pointerId) {
          return;
        }
        finishDrag({
          canceled: true,
          clientX: cancelEvent.clientX,
          clientY: cancelEvent.clientY,
        });
      }

      function handleKeyDown(keyEvent) {
        if (keyEvent.key === 'Escape' && sessionRef.current === session) {
          finishDrag({
            canceled: true,
            clientX: session.lastClientX,
            clientY: session.lastClientY,
          });
        }
      }

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });

      cleanupListenersRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('touchmove', handleTouchMove);
      };

      if (session.pointerType === 'touch') {
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          if (sessionRef.current === session && !session.active) {
            activateDrag(session.lastClientX, session.lastClientY);
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              navigator.vibrate(12);
            }
          }
        }, TOUCH_LONG_PRESS_MS);
      }
    },
    [clearTimers, detachSession]
  );

  return {
    dragState,
    startPointerTracking,
  };
}
