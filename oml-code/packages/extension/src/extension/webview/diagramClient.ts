import 'reflect-metadata';
import 'sprotty/css/sprotty.css';
import './diagramClient.css';

import { Container, injectable } from 'inversify';
import {
  ConsoleLogger,
  IActionDispatcher,
  LogLevel,
  ModelViewer,
  LocalModelSource,
  PolylineEdgeView,
  RectangularNodeView,
  SEdgeImpl,
  SGraphImpl,
  SGraphView,
  SLabelImpl,
  SLabelView,
  SNodeImpl,
  SChildElementImpl,
  TYPES,
  configureModelElement,
  loadDefaultModules,
  overrideViewerOptions
} from 'sprotty';
import type { IView, RenderingContext } from 'sprotty';
import type { SModelRoot } from 'sprotty-protocol';
import { h } from 'snabbdom';
import type { VNode } from 'snabbdom';

// Create a simple Sprotty setup without sprotty-vscode-webview
function createOmlContainer(baseDiv: string): Container {
  const container = new Container();
  loadDefaultModules(container);
  // Client no longer performs layout; layout is computed on the server.
  overrideViewerOptions(container, {
    baseDiv,
    needsClientLayout: false,
    needsServerLayout: true
  });

  // Reduce noise from Sprotty
  container.rebind(TYPES.ILogger).to(ConsoleLogger).inSingletonScope();
  container.rebind(TYPES.LogLevel).toConstantValue(LogLevel.error);

  // No ELK factory binding needed on the client when layout is server-side.

  // Helper to get theme colors dynamically based on VS Code theme
  function getThemeColors() {
    const themeKind = document.documentElement.getAttribute('data-vscode-theme-kind');
    const isLight = themeKind === 'light';
    
    return {
      bgColor: isLight ? '#ffffff' : '#1e1e1e',
      edgeColor: isLight ? '#8e8e8e' : '#646695'
    };
  }

  // Custom views that keep markers in the VDOM
  class OmlGraphView extends SGraphView {
    override render(model: any, context: any) {
      const vnode: any = super.render(model, context);
      // Use 'ns' property to ensure SVG namespace for case-sensitive attributes
      const svgNS = 'http://www.w3.org/2000/svg';
      const { bgColor, edgeColor } = getThemeColors();
      const selectColor = '#00b7ff';
      const lightSelectColor = '#0066cc';
      const isLight = document.documentElement.getAttribute('data-vscode-theme-kind') === 'light';
      const activeSelectColor = isLight ? lightSelectColor : selectColor;

      const defs = h('defs', { ns: svgNS }, [
        // === Default state markers ===
        // Relation: open V-shaped arrow (default)
        h('marker#oml-open-arrow', {
          ns: svgNS,
          attrs: {
            viewBox: '0 0 14 12',
            refX: '12',
            refY: '6',
            markerUnits: 'userSpaceOnUse',
            markerWidth: '16',
            markerHeight: '16',
            orient: 'auto'
          }
        }, [
          h('path', {
            ns: svgNS,
            attrs: {
              d: 'M0,0 L12,6 L0,12',
              fill: 'none',
              stroke: edgeColor,
              'stroke-width': '1.5',
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round'
            }
          })
        ]),
        // Specialization: closed filled triangle (default)
        h('marker#oml-closed-triangle', {
          ns: svgNS,
          attrs: {
            viewBox: '-2 0 14 12',
            refX: '12',
            refY: '6',
            markerUnits: 'userSpaceOnUse',
            markerWidth: '16',
            markerHeight: '16',
            orient: 'auto',
            overflow: 'visible'
          }
        }, [
          h('path', {
            ns: svgNS,
            attrs: {
              d: 'M0,0 L10,5 L0,10 Z',
              fill: bgColor,
              stroke: edgeColor,
              'stroke-width': '1.5',
              'stroke-linejoin': 'miter'
            }
          })
        ]),

        // === Hover state markers (cyan) ===
        // Relation: open V-shaped arrow (hover)
        h('marker#oml-open-arrow-hover', {
          ns: svgNS,
          attrs: {
            viewBox: '0 0 14 12',
            refX: '12',
            refY: '6',
            markerUnits: 'userSpaceOnUse',
            markerWidth: '16',
            markerHeight: '16',
            orient: 'auto'
          }
        }, [
          h('path', {
            ns: svgNS,
            attrs: {
              d: 'M0,0 L12,6 L0,12',
              fill: 'none',
              stroke: activeSelectColor,
              'stroke-width': '1.5',
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round'
            }
          })
        ]),
        // Specialization: closed filled triangle (hover)
        h('marker#oml-closed-triangle-hover', {
          ns: svgNS,
          attrs: {
            viewBox: '-2 0 14 12',
            refX: '12',
            refY: '6',
            markerUnits: 'userSpaceOnUse',
            markerWidth: '16',
            markerHeight: '16',
            orient: 'auto',
            overflow: 'visible'
          }
        }, [
          h('path', {
            ns: svgNS,
            attrs: {
              d: 'M0,0 L10,5 L0,10 Z',
              fill: bgColor,
              stroke: activeSelectColor,
              'stroke-width': '1.5',
              'stroke-linejoin': 'miter'
            }
          })
        ]),

        // === Selected state markers (cyan) ===
        // Relation: open V-shaped arrow (selected)
        h('marker#oml-open-arrow-selected', {
          ns: svgNS,
          attrs: {
            viewBox: '0 0 14 12',
            refX: '12',
            refY: '6',
            markerUnits: 'userSpaceOnUse',
            markerWidth: '16',
            markerHeight: '16',
            orient: 'auto'
          }
        }, [
          h('path', {
            ns: svgNS,
            attrs: {
              d: 'M0,0 L12,6 L0,12',
              fill: 'none',
              stroke: activeSelectColor,
              'stroke-width': '1.5',
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round'
            }
          })
        ]),
        // Specialization: closed filled triangle (selected)
        h('marker#oml-closed-triangle-selected', {
          ns: svgNS,
          attrs: {
            viewBox: '-2 0 14 12',
            refX: '12',
            refY: '6',
            markerUnits: 'userSpaceOnUse',
            markerWidth: '16',
            markerHeight: '16',
            orient: 'auto',
            overflow: 'visible'
          }
        }, [
          h('path', {
            ns: svgNS,
            attrs: {
              d: 'M0,0 L10,5 L0,10 Z',
              fill: bgColor,
              stroke: activeSelectColor,
              'stroke-width': '1.5',
              'stroke-linejoin': 'miter'
            }
          })
        ])
      ]);
      (vnode as any).children = (vnode as any).children ? [defs, ...(vnode as any).children] : [defs];
      return vnode;
    }
  }

  class OmlEdgeView extends PolylineEdgeView {
    protected override renderLine(edge: any, segments: any[], context: any, args?: any): VNode {
      const lineVNode = super.renderLine(edge, segments, context, args) as VNode;
      const kind = (edge as any)?.kind ?? (edge as any)?.data?.kind ?? 'relation';
      const hasMarker = (edge as any)?.hasMarker ?? true; // default to true for backward compatibility
      
      // Determine which marker to use based on edge kind and hasMarker flag
      let markerId: string | undefined;
      if (kind === 'specialization') {
        markerId = 'oml-closed-triangle';
      } else if (kind === 'relation' && hasMarker) {
        markerId = 'oml-open-arrow';
      }
      // If kind === 'relation' and !hasMarker, markerId stays undefined (no marker)
      
      const attrsTarget = (lineVNode.data ?? (lineVNode.data = {})) as any;
      const attrs = (attrsTarget.attrs ?? (attrsTarget.attrs = {}));
      delete attrs['marker-start'];
      delete attrs['marker-mid'];
      
      if (markerId) {
        attrs['marker-end'] = `url(#${markerId})`;
      } else {
        delete attrs['marker-end'];
      }
      
      return lineVNode;
    }
  }

  // Use the default SLabelView for labels; ELK/Sprotty handle label placement.

  // No client-side LayoutConfigurator necessary when layout is server-side.

  // Model elements
  configureModelElement(container, 'graph', SGraphImpl, OmlGraphView);
  configureModelElement(container, 'node:rect', SNodeImpl, RectangularNodeView);
  // Use the default label view
  configureModelElement(container, 'label', SLabelImpl, SLabelView);
  configureModelElement(container, 'edge', SEdgeImpl, OmlEdgeView);

  // Register no-op views for routing handles to silence missing-view errors.
  // These are added by Sprotty's routing feedback; we don't need to render them.
  @injectable()
  class EmptyView implements IView {
    render(element: any, context: RenderingContext): VNode {
      const svgNS = 'http://www.w3.org/2000/svg';
      return (h as any)('g', { ns: svgNS, attrs: { visibility: 'hidden' } }, []);
    }
  }
  configureModelElement(container, 'routing-point', SChildElementImpl, EmptyView as any);
  configureModelElement(container, 'volatile-routing-point', SChildElementImpl, EmptyView as any);
  configureModelElement(container, 'bezier-routing-point', SChildElementImpl, EmptyView as any);
  configureModelElement(container, 'bezier-create-routing-point', SChildElementImpl, EmptyView as any);
  configureModelElement(container, 'bezier-remove-routing-point', SChildElementImpl, EmptyView as any);

  // Do not register a client-side layout configurator.

  // Ensure LocalModelSource is bound
  if (!container.isBound(TYPES.ModelSource)) {
    container.bind(TYPES.ModelSource).to(LocalModelSource).inSingletonScope();
  }

  // Disable the move module so nodes cannot be dragged.
  // The moveModule binds MoveMouseListener as a TYPES.MouseListener.
  // We unbind all move-related listeners to prevent node movement.
  if (container.isBound(TYPES.MouseListener)) {
    const allListeners = container.getAll(TYPES.MouseListener);
    const filtered = allListeners.filter((listener: any) => {
      const ctor = listener?.constructor?.name || '';
      return !ctor.includes('Move');
    });
    if (filtered.length > 0) {
      container.unbind(TYPES.MouseListener);
      filtered.forEach(listener => {
        container.bind(TYPES.MouseListener).toConstantValue(listener);
      });
    }
  }

  return container;
}

// Bootstrap viewer
const BASE_DIV_ID = 'sprotty';
const container = createOmlContainer(BASE_DIV_ID);
const viewer = container.get<ModelViewer>(ModelViewer);
const modelSource = container.get<LocalModelSource>(TYPES.ModelSource);
// No client-side layout engine – server provides laid-out SModel
let actionDispatcher = container.get<IActionDispatcher>(TYPES.IActionDispatcher);

    // Wrap dispatcher to block moves as final safety net.
  // Markers inherit selection styling via CSS, so no JS color update needed.
  const originalDispatch = actionDispatcher.dispatch.bind(actionDispatcher);
  (actionDispatcher as any).dispatch = (action: any) => {
    if (action?.kind === 'setBounds') {
      return;
    }
    return originalDispatch(action);
  };

// Wire message handling
// VS Code webview API declaration for TS
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscodeApi = acquireVsCodeApi();

// Watch for selection class changes on edges and swap marker references
function setupMarkerColorWatcher() {
  const root = document.getElementById(BASE_DIV_ID);
  if (!root) return;

  const svg = root.querySelector('svg');
  if (!svg) return;

  const updateMarkerReferences = () => {
    // Get all edges in the diagram
    const edges = svg.querySelectorAll('g.sprotty-edge');
    
    edges.forEach((edge) => {
      const isSelected = edge.classList.contains('selected');
      const hasHoverAttr = edge.hasAttribute('data-hover');
      
      // Find the polyline, path, or line element with marker-end attribute
      const lineElement = edge.querySelector('polyline, path, line') as SVGElement | null;
      if (!lineElement) return;

      const currentMarkerEnd = lineElement.getAttribute('marker-end');
      if (!currentMarkerEnd) return;

      // Determine which marker is being used
      const isOpenArrow = currentMarkerEnd.includes('oml-open-arrow');
      const isClosedTriangle = currentMarkerEnd.includes('oml-closed-triangle');

      let newMarkerEnd: string;
      
      if (isSelected) {
        // Switch to selected marker variants
        if (isOpenArrow) {
          newMarkerEnd = 'url(#oml-open-arrow-selected)';
        } else if (isClosedTriangle) {
          newMarkerEnd = 'url(#oml-closed-triangle-selected)';
        } else {
          return;
        }
      } else if (hasHoverAttr) {
        // Switch to hover marker variants
        if (isOpenArrow) {
          newMarkerEnd = 'url(#oml-open-arrow-hover)';
        } else if (isClosedTriangle) {
          newMarkerEnd = 'url(#oml-closed-triangle-hover)';
        } else {
          return;
        }
      } else {
        // Switch back to default markers
        if (isOpenArrow) {
          newMarkerEnd = 'url(#oml-open-arrow)';
        } else if (isClosedTriangle) {
          newMarkerEnd = 'url(#oml-closed-triangle)';
        } else {
          return;
        }
      }

      // Update the marker reference if it changed
      if (lineElement.getAttribute('marker-end') !== newMarkerEnd) {
        lineElement.setAttribute('marker-end', newMarkerEnd);
      }
    });
  };

  // Use MutationObserver to watch for class changes on edge elements
  const observer = new MutationObserver(() => {
    updateMarkerReferences();
  });

  // Watch the SVG subtree for class and attribute changes
  observer.observe(svg, {
    subtree: true,
    attributeFilter: ['class', 'data-hover'],
    attributeOldValue: true
  });

  // Add mouseenter/mouseleave listeners to all edges to set data-hover attribute
  const addHoverListeners = () => {
    const edges = svg.querySelectorAll('g.sprotty-edge');
    edges.forEach((edge) => {
      if (edge.hasAttribute('data-hover-listeners')) return; // already added
      
      edge.addEventListener('mouseenter', () => {
        edge.setAttribute('data-hover', 'true');
      });
      
      edge.addEventListener('mouseleave', () => {
        edge.removeAttribute('data-hover');
      });
      
      edge.setAttribute('data-hover-listeners', 'true');
    });
  };

  // Add hover listeners on initial load
  addHoverListeners();
  
  // Re-add hover listeners when new edges are created (observed by MutationObserver)
  const reinitObserver = new MutationObserver(() => {
    addHoverListeners();
  });
  
  reinitObserver.observe(svg, {
    subtree: true,
    childList: true
  });

  // Initial update
  updateMarkerReferences();
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (message?.type === 'updateModel') {
    try {
  // Server now provides a fully laid-out SModel; set it directly.
      const root: SModelRoot = message.model as SModelRoot;
      try { console.log('[OML Diagram] updateModel received. root kind:', (root as any).type, 'children:', (root as any).children?.length); } catch {}
      // Prefer morphing updates for smooth animations.
      try {
        // Dispatch UpdateModel action so animationModule can morph the view.
        actionDispatcher.dispatch({ kind: 'updateModel', newRoot: root, animate: true } as any);
      } catch (_) {
        // Fallback to LocalModelSource if dispatcher path is not available.
        if (typeof (modelSource as any).updateModel === 'function') {
          (modelSource as any).updateModel(root);
        } else {
          modelSource.setModel(root);
        }
      }
      // Set up marker watcher after first model load
      setTimeout(() => setupMarkerColorWatcher(), 100);
    } catch (err) {
      console.error('[OML Diagram] Error processing model:', err);
    }
  }
});

// Ask extension host for a model on startup
vscodeApi.postMessage({ type: 'requestModel' });

// No client-side transformation; the server provides the SModel directly.

// --- Lightweight pan + zoom -----------------------------------------------------------
// Apply a CSS transform to the base '#sprotty' div to support drag-to-pan
// and wheel/pinch-to-zoom without touching Sprotty's internal camera state.
(() => {
  const root = document.getElementById(BASE_DIV_ID) as HTMLElement | null;
  if (!root) return;
  // Use the base container as the transform target for reliability
  const target = root;

  // State
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let panX = 0;
  let panY = 0;
  let scale = 1;
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 3;

  // Touch pinch state
  let pinchActive = false;
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchStartPanX = 0;
  let pinchStartPanY = 0;
  let pinchCenterX = 0;
  let pinchCenterY = 0;

  // Helpers
  const setTransform = () => {
    target.style.transformOrigin = '0 0';
    target.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  };

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  // Zoom logic that keeps the screen point (cx, cy) stable while changing scale
  const zoomAt = (newScale: number, cx: number, cy: number) => {
    const s0 = scale;
    const s1 = clamp(newScale, MIN_SCALE, MAX_SCALE);
    if (s1 === s0) return;
    // Keep point (cx, cy) stationary: pan' = pan + (1 - s1/s0) * (p - pan)
    panX = panX + (1 - s1 / s0) * (cx - panX);
    panY = panY + (1 - s1 / s0) * (cy - panY);
    scale = s1;
    setTransform();
  };

  // Mouse panning (background or middle mouse)
  const onMouseDown = (e: MouseEvent) => {
    const el = e.target as Element;
    const hitInteractive = el.closest('g.sprotty-node, g.sprotty-edge') !== null;
    // Start panning on middle button anywhere, or left button on background only
    if (e.button === 1 || (e.button === 0 && !hitInteractive)) {
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      root.style.cursor = 'grabbing';
      e.preventDefault();
    }
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    setTransform();
  };
  const onMouseUp = () => {
    if (!isPanning) return;
    isPanning = false;
    root.style.cursor = 'grab';
  };

  // Wheel zoom (trackpad pinch is also delivered as a wheel event in Chromium)
  const onWheel = (e: WheelEvent) => {
    // Zoom toward the pointer position
    const rect = root.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Smooth zoom factor; negative deltaY zooms in
    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    zoomAt(scale * zoomFactor, cx, cy);
    e.preventDefault();
  };

  // Touch: one finger pans, two fingers pinch-zoom (and pan)
  const getTouch = (e: TouchEvent, index: number) => e.touches.item(index)!;
  const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1);

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      const t = getTouch(e, 0);
      isPanning = true;
      startX = t.clientX - panX;
      startY = t.clientY - panY;
    } else if (e.touches.length === 2) {
      pinchActive = true;
      const t0 = getTouch(e, 0);
      const t1 = getTouch(e, 1);
      pinchStartDist = dist(t0.clientX, t0.clientY, t1.clientX, t1.clientY);
      pinchStartScale = scale;
      pinchStartPanX = panX;
      pinchStartPanY = panY;
      const rect = root.getBoundingClientRect();
      pinchCenterX = (t0.clientX + t1.clientX) / 2 - rect.left;
      pinchCenterY = (t0.clientY + t1.clientY) / 2 - rect.top;
      isPanning = false; // defer to pinch
    }
  };
  const onTouchMove = (e: TouchEvent) => {
    if (pinchActive && e.touches.length === 2) {
      const t0 = getTouch(e, 0);
      const t1 = getTouch(e, 1);
      const d = dist(t0.clientX, t0.clientY, t1.clientX, t1.clientY);
      const newScale = clamp(pinchStartScale * (d / pinchStartDist), MIN_SCALE, MAX_SCALE);
      // Update pan to keep pinch center stable across scale change
      const s0 = scale;
      const s1 = newScale;
      panX = pinchStartPanX + (1 - s1 / s0) * (pinchCenterX - pinchStartPanX);
      panY = pinchStartPanY + (1 - s1 / s0) * (pinchCenterY - pinchStartPanY);
      scale = newScale;
      setTransform();
      e.preventDefault();
      return;
    }
    if (isPanning && e.touches.length === 1) {
      const t = getTouch(e, 0);
      panX = t.clientX - startX;
      panY = t.clientY - startY;
      setTransform();
      e.preventDefault();
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) {
      isPanning = false;
      pinchActive = false;
    } else if (e.touches.length === 1) {
      // back to single-finger pan
      pinchActive = false;
      const t = getTouch(e, 0);
      startX = t.clientX - panX;
      startY = t.clientY - panY;
    }
  };

  // Init styles and listeners
  root.style.willChange = 'transform';
  root.style.cursor = 'grab';
  root.addEventListener('mousedown', onMouseDown, { capture: true });

  // Prevent node dragging: swallow drag events originating on nodes but allow click for selection.
  root.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    const targetEl = e.target as Element;
    const onNode = targetEl.closest('g.sprotty-node') !== null;
    if (!onNode) return;
    let moved = false;
    const cancelDrag = (ev: MouseEvent) => {
      moved = true;
      ev.stopImmediatePropagation();
      ev.preventDefault();
    };
    const up = () => {
      window.removeEventListener('mousemove', cancelDrag, true);
      window.removeEventListener('mouseup', up, true);
    };
    window.addEventListener('mousemove', cancelDrag, true);
    window.addEventListener('mouseup', up, true);
  }, { capture: true });
  window.addEventListener('mousemove', onMouseMove, { capture: true });
  window.addEventListener('mouseup', onMouseUp, { capture: true });
  root.addEventListener('wheel', onWheel, { passive: false, capture: true });

  root.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
  window.addEventListener('touchend', onTouchEnd, { capture: true });

  // Double-click to reset view
  root.addEventListener('dblclick', () => {
    panX = 0;
    panY = 0;
    scale = 1;
    setTransform();
  });
})();