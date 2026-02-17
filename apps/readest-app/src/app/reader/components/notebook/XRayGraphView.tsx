'use client';

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type {
  NodeObject,
  LinkObject,
  ForceGraphProps,
  ForceGraphMethods,
} from 'react-force-graph-2d';
import type { BookEntity, EntityType } from '@/services/ai/types';
import { useThemeStore } from '@/store/themeStore';

/** Rotate the hue of a hex color by `degrees`. */
function rotateHue(hex: string, degrees: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }

  h = (h + degrees + 360) % 360;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1: number, g1: number, b1: number;

  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function buildNodeColors(primary: string, accent: string): Record<EntityType, string> {
  return {
    character: primary,
    location: accent,
    theme: rotateHue(primary, 180), // complementary
    term: rotateHue(primary, 90), // perpendicular
    event: rotateHue(primary, -60), // warm shift
  };
}

const FALLBACK_COLORS: Record<EntityType, string> = {
  character: '#3b82f6',
  location: '#22c55e',
  theme: '#a855f7',
  term: '#f59e0b',
  event: '#f43f5e',
};

const TYPE_LABELS: Record<EntityType, string> = {
  character: 'Characters',
  location: 'Locations',
  theme: 'Themes',
  term: 'Terms',
  event: 'Events',
};

const LABEL_MAX_LENGTH = 20;
const MAJOR_RADIUS = 6;
const MINOR_RADIUS = 3.5;
// Zoom threshold: below this, only major nodes show labels
const LABEL_ZOOM_THRESHOLD = 1.5;

interface GraphNodeExtra {
  name: string;
  type: EntityType;
  importance: 'major' | 'minor';
  val: number;
}

type GraphNode = NodeObject<GraphNodeExtra>;
type GraphLink = LinkObject<GraphNodeExtra, object>;
type GraphRef = ForceGraphMethods<GraphNodeExtra, object>;
type ForceGraphComponent = React.ComponentType<
  ForceGraphProps<GraphNodeExtra, object> & { ref?: React.Ref<GraphRef> }
>;

interface XRayGraphViewProps {
  entities: BookEntity[];
  onSelectEntity: (entityId: string) => void;
  highlightedEntityId?: string;
}

function truncateLabel(name: string): string {
  if (name.length <= LABEL_MAX_LENGTH) return name;
  return name.slice(0, LABEL_MAX_LENGTH - 1) + '\u2026';
}

function buildGraphData(entities: BookEntity[]): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const nameToId = new Map<string, string>();
  for (const e of entities) {
    nameToId.set(e.name.toLowerCase(), e.id);
    for (const alias of e.aliases) {
      nameToId.set(alias.toLowerCase(), e.id);
    }
  }

  const entityIds = new Set(entities.map((e) => e.id));

  const nodes: GraphNode[] = entities.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    importance: e.importance,
    val: e.importance === 'major' ? 3 : 1,
  }));

  const linkSet = new Set<string>();
  const links: GraphLink[] = [];
  for (const entity of entities) {
    for (const connName of entity.connections) {
      const targetId = nameToId.get(connName.toLowerCase());
      if (targetId && entityIds.has(targetId) && targetId !== entity.id) {
        const key = [entity.id, targetId].sort().join('::');
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: entity.id, target: targetId });
        }
      }
    }
  }

  return { nodes, links };
}

function getNodeId(nodeOrId: string | number | GraphNode | undefined): string {
  if (typeof nodeOrId === 'object' && nodeOrId !== null) return String(nodeOrId.id ?? '');
  return String(nodeOrId ?? '');
}

const XRayGraphView: React.FC<XRayGraphViewProps> = ({
  entities,
  onSelectEntity,
  highlightedEntityId,
}) => {
  const { themeCode } = useThemeStore();
  const nodeColors = useMemo(() => {
    const palette = themeCode?.palette;
    if (!palette) return FALLBACK_COLORS;
    return buildNodeColors(palette.primary, palette.accent);
  }, [themeCode]);

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<GraphRef | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 300, height: 400 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [ForceGraph, setForceGraph] = useState<ForceGraphComponent | null>(null);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const zoomRef = useRef(1);
  const fittedRef = useRef(false);
  const prevEntityKeyRef = useRef('');
  const nodePositionsRef = useRef(new Map<string, { x: number; y: number }>());
  const graphDataRef = useRef<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const [hiddenTypes, setHiddenTypes] = useState<Set<EntityType>>(new Set());

  const toggleType = useCallback((type: EntityType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // Dynamically import to avoid SSR issues with canvas
  useEffect(() => {
    import('react-force-graph-2d').then((mod) => {
      setForceGraph(() => mod.default as unknown as ForceGraphComponent);
    });
  }, []);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleEntities = useMemo(
    () => (hiddenTypes.size === 0 ? entities : entities.filter((e) => !hiddenTypes.has(e.type))),
    [entities, hiddenTypes],
  );

  const graphData = useMemo(() => {
    const data = buildGraphData(visibleEntities);
    const cache = nodePositionsRef.current;
    for (const node of data.nodes) {
      const pos = cache.get(String(node.id));
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }
    graphDataRef.current = data;
    return data;
  }, [visibleEntities]);

  // Configure d3-force charge for better spacing once graph mounts
  useEffect(() => {
    if (!graphRef.current) return;
    const charge = graphRef.current.d3Force('charge');
    if (charge && typeof charge['strength'] === 'function') {
      const strength = Math.min(-80, -200 - visibleEntities.length * 2);
      charge['strength'](strength);
      graphRef.current.d3ReheatSimulation();
    }
  }, [ForceGraph, visibleEntities.length]);

  // Save all current node positions to cache
  const savePositions = useCallback(() => {
    const cache = nodePositionsRef.current;
    for (const node of graphDataRef.current.nodes) {
      if (node.x != null && node.y != null) {
        cache.set(String(node.id), { x: node.x, y: node.y });
      }
    }
  }, []);

  const handleEngineStop = useCallback(() => {
    savePositions();
    if (!fittedRef.current && graphRef.current) {
      fittedRef.current = true;
      graphRef.current.zoomToFit(400, 40);
    }
  }, [savePositions]);

  // Reset fit flag only when the actual set of entities changes (not just the array reference)
  // Skip reset if all nodes already have cached positions (returning to a previously seen graph)
  useEffect(() => {
    const key = entities
      .map((e) => e.id)
      .sort()
      .join(',');
    if (key !== prevEntityKeyRef.current) {
      prevEntityKeyRef.current = key;
      const cache = nodePositionsRef.current;
      const allCached = entities.length > 0 && entities.every((e) => cache.has(e.id));
      fittedRef.current = allCached;
    }
  }, [entities]);

  // Also reset fit when legend toggles change
  useEffect(() => {
    fittedRef.current = false;
  }, [hiddenTypes]);

  // Set of node ids connected to the hovered node
  const connectedIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const ids = new Set<string>([hoveredNodeId]);
    for (const link of graphData.links) {
      const src = getNodeId(link.source);
      const tgt = getNodeId(link.target);
      if (src === hoveredNodeId) ids.add(tgt);
      if (tgt === hoveredNodeId) ids.add(src);
    }
    return ids;
  }, [hoveredNodeId, graphData.links]);

  // Visible entity types for legend
  const visibleTypes = useMemo(() => {
    const types = new Set<EntityType>();
    for (const e of entities) types.add(e.type);
    return types;
  }, [entities]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      savePositions();
      if (node?.id) onSelectEntity(String(node.id));
    },
    [onSelectEntity, savePositions],
  );

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNodeId(node?.id != null ? String(node.id) : null);
  }, []);

  const handleZoom = useCallback((transform: { k: number }) => {
    const wasAbove = zoomRef.current >= LABEL_ZOOM_THRESHOLD;
    const isAbove = transform.k >= LABEL_ZOOM_THRESHOLD;
    zoomRef.current = transform.k;
    if (wasAbove !== isAbove) {
      // Defer setState to avoid updating during ForceGraph2D render cycle
      requestAnimationFrame(() => setShowZoomHint(!isAbove));
    }
  }, []);

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const type = node.type;
      const isMajor = node.importance === 'major';
      const radius = isMajor ? MAJOR_RADIUS : MINOR_RADIUS;
      const nodeId = String(node.id ?? '');
      const isHovered = hoveredNodeId === nodeId;
      const isConnectedToHover = connectedIds !== null && connectedIds.has(nodeId);
      const isDimmed = connectedIds !== null && !isConnectedToHover;
      const alpha = isDimmed ? 0.12 : 1;
      const color = nodeColors[type] || '#888';
      const palette = themeCode?.palette;
      const pillBg = palette?.['base-300'] || '#1e1e28';
      const labelFg = palette?.['base-content'] || '#f0f0f5';
      const lr = parseInt(labelFg.slice(1, 3), 16);
      const lg = parseInt(labelFg.slice(3, 5), 16);
      const lb = parseInt(labelFg.slice(5, 7), 16);

      ctx.globalAlpha = alpha;

      // Glow for hovered node
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 5, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}30`;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Subtle border
      if (!isDimmed) {
        ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, 0.3)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Highlight ring for selected entity
      if (highlightedEntityId === nodeId) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Label visibility logic:
      // - Always show for hovered node and its connections
      // - At low zoom: only major nodes
      // - At high zoom: all nodes
      const showLabel =
        isHovered ||
        isConnectedToHover ||
        (isMajor && globalScale >= 0.6) ||
        globalScale >= LABEL_ZOOM_THRESHOLD;

      if (showLabel) {
        const label = truncateLabel(node.name);
        const fontSize = Math.min(Math.max(11 / globalScale, 2.5), 6);
        const fontWeight = isMajor || isHovered ? 'bold' : 'normal';
        ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const textWidth = ctx.measureText(label).width;
        const paddingH = 2 / globalScale;
        const paddingV = 1 / globalScale;
        const labelY = y + radius + 2;

        // Background pill — use theme base-300 color
        const bgAlpha = isHovered ? 0.85 : 0.65;
        const pr = parseInt(pillBg.slice(1, 3), 16);
        const pg = parseInt(pillBg.slice(3, 5), 16);
        const pb = parseInt(pillBg.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${bgAlpha * alpha})`;
        const pillWidth = textWidth + paddingH * 2;
        const pillHeight = fontSize + paddingV * 2;
        const cornerRadius = 1.5 / globalScale;
        const pillX = x - pillWidth / 2;
        const pillY = labelY - paddingV;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, cornerRadius);
        ctx.fill();

        // Text — use theme base-content color
        ctx.fillStyle = isDimmed
          ? `rgba(${lr}, ${lg}, ${lb}, ${alpha * 0.6})`
          : isHovered
            ? labelFg
            : `rgba(${lr}, ${lg}, ${lb}, 0.92)`;
        ctx.fillText(label, x, labelY);
      }

      ctx.globalAlpha = 1;
    },
    [hoveredNodeId, connectedIds, highlightedEntityId, nodeColors, themeCode],
  );

  const nodePointerAreaPaint = useCallback(
    (node: GraphNode, paintColor: string, ctx: CanvasRenderingContext2D) => {
      const radius = node.importance === 'major' ? 10 : 7;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
      ctx.fillStyle = paintColor;
      ctx.fill();
    },
    [],
  );

  const linkColor = useCallback(
    (link: GraphLink) => {
      if (!connectedIds) return 'rgba(150,150,150,0.2)';
      const src = getNodeId(link.source);
      const tgt = getNodeId(link.target);
      if (connectedIds.has(src) && connectedIds.has(tgt)) return 'rgba(180,180,200,0.5)';
      return 'rgba(150,150,150,0.05)';
    },
    [connectedIds],
  );

  if (entities.length === 0) {
    return (
      <div className='flex h-full items-center justify-center'>
        <p className='text-muted-foreground text-xs'>No entities to display</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className='relative h-full w-full'>
      {/* Legend */}
      <div className='bg-base-100/80 absolute right-2 top-2 z-10 rounded-lg px-2 py-1.5 backdrop-blur-sm'>
        {Array.from(visibleTypes).map((type) => {
          const isHidden = hiddenTypes.has(type);
          return (
            <button
              key={type}
              className='flex w-full cursor-pointer items-center gap-1.5 py-0.5'
              onClick={() => toggleType(type)}
            >
              <span
                className='inline-block size-2 rounded-full transition-opacity'
                style={{
                  backgroundColor: isHidden ? '#9ca3af' : nodeColors[type],
                  opacity: isHidden ? 0.4 : 1,
                }}
              />
              <span
                className={`text-[10px] transition-opacity ${isHidden ? 'text-base-content/40 line-through' : 'text-base-content/70'}`}
              >
                {TYPE_LABELS[type]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Zoom hint */}
      {showZoomHint && (
        <div className='text-base-content/30 absolute bottom-2 left-1/2 z-10 -translate-x-1/2 text-[10px]'>
          Scroll to zoom in for labels
        </div>
      )}

      {/* Graph */}
      {ForceGraph && (
        <ForceGraph
          ref={graphRef as React.Ref<GraphRef>}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => 'replace'}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={0.5}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onZoom={handleZoom}
          onEngineStop={handleEngineStop}
          cooldownTicks={150}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          enableNodeDrag={true}
          backgroundColor='transparent'
          minZoom={0.3}
          maxZoom={10}
          warmupTicks={50}
        />
      )}
    </div>
  );
};

export default React.memo(XRayGraphView);
