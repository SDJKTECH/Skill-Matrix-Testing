import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// Sample tree data structure
const initialTreeData = {
    name: 'Naveen',
    children: [
      {
        name: 'Ravi',
        children: [
          { name: 'Azure',status: 'Completed' },
          { name: 'AWS',status: 'Completed'  },
          { name: 'GCP',status: 'Completed'  },
        ],
      },
      {
        name: 'Kiran',
        children: [
          { name: 'Azure' },
          { name: 'DevOps' },
        ],
      },
      {
        name: 'Suman',
        children: [
          { name: 'AWS' },
          { name: 'Kubernetes' },
        ],
      },
      {
        name: 'Priya',
        children: [
          { name: 'Azure' },
          { name: 'AI/ML' },
        ],
      },
      {
        name: 'Arun',
        children: [
          { name: 'GCP' },
          { name: 'Docker' },
        ],
      },
      {
        name:"Skills",
        children: [
          { name: 'Azure',status: 'Completed' },
          { name: 'AWS',status: 'Completed'  },
          { name: 'GCP',status: 'Completed'  },
        ],
      }
    ],
  };
  

export default function TreeGraph() {
  const [treeData] = useState(initialTreeData);
  const [filterText, setFilterText] = useState("");
  const [filteredData, setFilteredData] = useState(initialTreeData);
  const [expandedNodes, setExpandedNodes] = useState(new Set(['Citrus']));
  const [lastUpdated] = useState(() => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  });
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const hasInitialized = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Pan and zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Filter tree data
  const filterTree = useCallback((node, filter) => {
    if (!filter) return node;

    const nameMatches = node.name.toLowerCase().includes(filter.toLowerCase());
    const hasMatchingChildren =
      node.children &&
      node.children.some((child) => {
        const filteredChild = filterTree(child, filter);
        return filteredChild !== null;
      });

    if (nameMatches || hasMatchingChildren) {
      const filteredNode = { ...node };
      if (node.children) {
        filteredNode.children = node.children
          .map((child) => filterTree(child, filter))
          .filter((child) => child !== null);
      }
      return filteredNode;
    }

    return null;
  }, []);

  // Handle filter text change
  useEffect(() => {
    if (filterText) {
      const filtered = filterTree(treeData, filterText);
      setFilteredData(filtered || { name: "No matches", children: [] });
    } else {
      setFilteredData(treeData);
    }
  }, [filterText, treeData, filterTree]);

  // Update dimensions on resize - use full viewport
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleReset = () => {
    setFilterText("");
    setFilteredData(initialTreeData);
    setExpandedNodes(new Set(['Citrus']));
    setPan({ x: 0, y: 0 });
    setZoom(1);
    hasInitialized.current = false;
  };

  const createCurvePath = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const cp1x = x1 + dx * 0.4;
    const cp1y = y1;
    const cp2x = x1 + dx * 0.6;
    const cp2y = y2;
    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  };

  const renderTree = (data, expandedSet) => {
    const svgWidth = Math.max(dimensions.width || 1200, 1200);
    const svgHeight = Math.max(dimensions.height || 800, 800);
    const rootX = 150;
    const rootY = svgHeight / 2;
    const level1X = Math.min(400, svgWidth * 0.35);
    const level2X = Math.min(700, svgWidth * 0.65);
    
    const lines = [];
    const nodes = [];
    
    const isRootExpanded = expandedSet.has(data.name);
    nodes.push({
      x: rootX,
      y: rootY,
      name: data.name,
      level: 0,
      hasChildren: data.children && data.children.length > 0,
      isExpanded: isRootExpanded,
      nodePath: data.name,
    });

    if (isRootExpanded && data.children) {
      const level1Count = data.children.length;
      const availableHeight = svgHeight - 100;
      const level1Spacing = Math.max(100, availableHeight / Math.max(1, level1Count + 1));
      const level1StartY = rootY - ((level1Count - 1) * level1Spacing) / 2;

      data.children.forEach((child, i) => {
        const level1Y = level1StartY + i * level1Spacing;
        const isChildExpanded = expandedSet.has(child.name);
        
        lines.push({
          path: createCurvePath(rootX + 30, rootY, level1X - 30, level1Y),
        });

        nodes.push({
          x: level1X,
          y: level1Y,
          name: child.name,
          level: 1,
          hasChildren: child.children && child.children.length > 0,
          isExpanded: isChildExpanded,
          nodePath: child.name,
        });

        if (isChildExpanded && child.children) {
          const level2Count = child.children.length;
          const level2Spacing = Math.max(70, Math.min(120, 400 / Math.max(1, level2Count)));
          const level2StartY = level1Y - ((level2Count - 1) * level2Spacing) / 2;

          child.children.forEach((leaf, j) => {
            const level2Y = level2StartY + j * level2Spacing;
            const leafPath = `${child.name}.${leaf.name}`;
            
            lines.push({
              path: createCurvePath(level1X + 30, level1Y, level2X - 30, level2Y),
            });

            nodes.push({
              x: level2X,
              y: level2Y,
              name: leaf.name,
              level: 2,
              hasChildren: false,
              isExpanded: false,
              nodePath: leafPath,
            });
          });
        }
      });
    }

    return { lines, nodes, svgWidth, svgHeight };
  };

  const treeLayout = useMemo(() => renderTree(filteredData, expandedNodes), [filteredData, expandedNodes, dimensions.width, dimensions.height]);
  const { lines, nodes, svgWidth, svgHeight } = treeLayout;

  // Auto-center on initial load
  useEffect(() => {
    if (dimensions.width > 0 && nodes.length > 0 && !hasInitialized.current) {
      const minX = Math.min(...nodes.map(n => n.x));
      const maxX = Math.max(...nodes.map(n => n.x));
      const minY = Math.min(...nodes.map(n => n.y));
      const maxY = Math.max(...nodes.map(n => n.y));
      
      const graphWidth = maxX - minX;
      const graphHeight = maxY - minY;
      
      if (graphWidth > 0 && graphHeight > 0) {
        const zoomX = (dimensions.width * 0.8) / graphWidth;
        const zoomY = (dimensions.height * 0.8) / graphHeight;
        const fitZoom = Math.min(zoomX, zoomY, 1);
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const panX = dimensions.width / 2 - centerX * fitZoom;
        const panY = dimensions.height / 2 - centerY * fitZoom;
        
        setPan({ x: panX, y: panY });
        setZoom(fitZoom);
        hasInitialized.current = true;
      }
    }
  }, [dimensions.width, dimensions.height, nodes]);

  const toggleNode = (nodeName) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeName)) {
        newSet.delete(nodeName);
        const childrenPaths = Array.from(newSet).filter((path) =>
          path.startsWith(`${nodeName}.`)
        );
        childrenPaths.forEach((childPath) => newSet.delete(childPath));
      } else {
        newSet.add(nodeName);
      }
      return newSet;
    });
  };

  // Pan handlers - only pan the canvas, not nodes
  const handleMouseDown = (e) => {
    if (e.button === 0 && e.target.tagName === 'svg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom handler
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(2, zoom * delta));
    setZoom(newZoom);
  };

  return (
    <div className="w-full h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Top Controls */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter nodes"
              className="w-64 pl-10 pr-4 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg 
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 
                dark:text-gray-200 dark:placeholder-gray-400"
            />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Reset
          </button>
        </div>

        <div className="text-gray-600 dark:text-gray-300 text-sm font-medium">
          Last Updated: {lastUpdated}
        </div>
      </div>

      {/* Tree Visualization - Full Screen */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-gray-50 dark:bg-gray-900"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            minWidth: '100%',
            minHeight: '100%',
          }}
        >
          {/* Draw lines */}
          {lines.map((line, i) => (
            <path
              key={`line-${i}`}
              d={line.path}
              stroke="#60a5fa"
              strokeWidth="2"
              fill="none"
              opacity="0.6"
            />
          ))}

          {/* Draw nodes */}
          {nodes.map((node, i) => (
            <g
              key={`node-${i}`}
              style={{ cursor: 'pointer' }}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={(e) => {
                e.stopPropagation();
                if (node.hasChildren) {
                  toggleNode(node.nodePath);
                }
              }}
            >
              <circle
                cx="0"
                cy="0"
                r="30"
                fill="white"
                stroke={node.hasChildren ? "#60a5fa" : "#e5e7eb"}
                strokeWidth={node.hasChildren ? "2.5" : "1.5"}
                style={{
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
                  transition: "all 0.2s ease",
                }}
              />
              <text
                x="0"
                y="6"
                textAnchor="middle"
                fill="#1f2937"
                style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {node.name}
              </text>
              {node.hasChildren && (
                <g>
                  <circle
                    cx="40"
                    cy="0"
                    r="12"
                    fill="#60a5fa"
                    opacity="0.2"
                  />
                  <circle
                    cx="40"
                    cy="0"
                    r="12"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                  />
                  <text
                    x="40"
                    y="5"
                    textAnchor="middle"
                    fill="#60a5fa"
                    style={{
                      fontSize: "18px",
                      fontWeight: "bold",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  >
                    {node.isExpanded ? "−" : "+"}
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}