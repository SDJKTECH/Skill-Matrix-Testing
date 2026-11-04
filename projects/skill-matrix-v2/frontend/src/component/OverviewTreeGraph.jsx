import React, { useMemo, useEffect, useState, useRef } from "react";
import { useOverview, nodeLabelToEntityType } from "../context/OverviewContext";
import { useAuth } from "../hooks/useAuth";
import OverviewNodeTooltip from "./OverviewNodeTooltip";

/* ---------- CONFIG ---------- */

const NODE_RADIUS = 18;
const LEVEL_GAP = 300; // was 260
const VERTICAL_GAP = 36; // was 24

/* ---------- COLORS ---------- */

const NODE_COLORS = {
  Employee: "#8b5cf6", // Purple
  Manager: "#8b5cf6", // Purple
  AssociatesSection: "#a855f7", // Violet
  Training: "#22c55e", // Green
  TrainingsSection: "#22c55e", // Green
  SkillsSection: "#3b82f6", // Blue
  CertificationsSection: "#f59e0b", // Gold/Orange
  // Old schema (functionsV2)
  Domain: "#60a5fa", // Light Blue
  Discipline: "#3b82f6", // Medium Blue
  Skill: "#1e40af", // Dark Blue
  Framework: "#1e3a8a", // Navy
  // New schema (functions folder)
  Category: "#60a5fa", // Light Blue
  Subcategory: "#3b82f6", // Medium Blue
  "Sub-Subcategory": "#1e40af", // Dark Blue
  Tool: "#1e3a8a", // Navy
  Certification: "#f59e0b", // Gold/Orange
  default: "#94a3b8", // Gray
};

const THEME_COLORS = {
  light: {
    canvasBg: "#ffffff",
    text: "#0f172a",
    subtleText: "#475569",
    link: "#cbd5e1",
  },
  dark: {
    canvasBg: "#020617",
    text: "#e5e7eb",
    subtleText: "#94a3b8",
    link: "#334155",
  },
};

const TRAINING_STATUS_RING_COLOR = {
  Completed: "#22c55e", // green
  Certified: "#22c55e", // green
  "In Progress": "#eab308", // yellow
  Dropped: "#ef4444", // red
};

const getNodeStrokeColor = (node) => {
  // Training nodes use status ring color
  if (node.label === "Training") {
    return TRAINING_STATUS_RING_COLOR[node.status] || NODE_COLORS.Training;
  }

  // Highlight employees/managers who have associates under them
  if (
    (node.label === "Employee" || node.label === "Manager") &&
    Array.isArray(node.children) &&
    node.children.some((child) => child.label === "AssociatesSection")
  ) {
    // Distinct color for employees with associates
    return "#ec4899"; // Pink
  }

  return NODE_COLORS[node.label] || NODE_COLORS.default;
};

// View modes for filtering what to display
const VIEW_MODES = {
  ALL: "all",
  TRAINING: "training",
  SKILLS: "skills",
  CERTIFICATIONS: "certifications",
};

const getNodeKey = (node) => `${node.label}-${node.id ?? node.name}`;

const hasChildren = (node) => Array.isArray(node.children) && node.children.length > 0;

const extractYearsAndStatuses = (
  nodes,
  years = new Set(),
  statuses = new Set()
) => {
  if (!nodes) return { years, statuses };

  // ✅ If array root
  if (Array.isArray(nodes)) {
    nodes.forEach((node) => extractYearsAndStatuses(node, years, statuses));
    return { years, statuses };
  }

  const node = nodes; // now it's a single node

  if (node.label === "Training") {
    if (node.period && typeof node.period === "string") {
      const year = node.period.split("-")[0];
      years.add(year);
    }

    if (node.status !== undefined && node.status !== null) {
      statuses.add(String(node.status));
    }
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child) =>
      extractYearsAndStatuses(child, years, statuses)
    );
  }

  return { years, statuses };
};

/* ---------- LAYOUT ENGINE ---------- */

// Builds a path-based key so duplicate-named nodes at different tree positions
// get unique keys (e.g. two "Data Integration" nodes under different domains).
const makeNodeKey = (node, parentKey) => {
  const simple = `${node.label}-${node.id ?? node.name}`;
  return parentKey ? `${parentKey}|${simple}` : simple;
};

const layoutNode = (node, depth, yOffset, expanded, parentKey = "") => {
  const nodeKey = makeNodeKey(node, parentKey);
  const isExpanded = expanded.has(nodeKey);
  const children = isExpanded && hasChildren(node) ? node.children : [];

  if (children.length === 0) {
    return {
      height: NODE_RADIUS * 2,
      nodes: [
        {
          ...node,
          _key: nodeKey,
          x: depth * LEVEL_GAP,
          y: yOffset + NODE_RADIUS,
        },
      ],
      links: [],
    };
  }

  let cursorY = yOffset;
  const nodes = [];
  const links = [];

  children.forEach((child, idx) => {
    const childLayout = layoutNode(child, depth + 1, cursorY, expanded, nodeKey);
    nodes.push(...childLayout.nodes);
    links.push(...childLayout.links);
    cursorY += childLayout.height;
    if (idx !== children.length - 1) cursorY += VERTICAL_GAP;
  });

  const parentY = yOffset + (cursorY - yOffset) / 2;

  nodes.push({
    ...node,
    _key: nodeKey,
    x: depth * LEVEL_GAP,
    y: parentY,
  });

  // Find each child by its path-based key (not just label+name)
  children.forEach((child) => {
    const childKey = makeNodeKey(child, nodeKey);
    const childNode = nodes.find((n) => n._key === childKey);
    if (childNode) {
      links.push({
        from: { x: depth * LEVEL_GAP, y: parentY },
        to: { x: (depth + 1) * LEVEL_GAP, y: childNode.y },
      });
    }
  });

  return { height: cursorY - yOffset, nodes, links };
};

/* ---------- MAIN COMPONENT ---------- */

export default function OverviewTreeGraph() {
  const { user } = useAuth();
  const {
    overviewHierarchy,
    getOverviewHierarchy,
    loading,
    saveComment,
  } = useOverview();
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 1200, height: 800 });

  useEffect(() => {
    if (user?.dbEmployeeId ?? user?.employeeId) {
      getOverviewHierarchy();
    }
  }, [user?.dbEmployeeId, user?.employeeId]);

  const [filters, setFilters] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null); // 'employee', 'area', 'status', 'year', 'skill', 'cert', or null
  const filterBarRef = useRef(null);
  // View mode: multi-select flags for training/skills/certifications/associates
  const [viewModes, setViewModes] = useState({
    training: true,
    skills: true,
    certifications: true,
    associates: true,
  });
  const [filterSearch, setFilterSearch] = useState({
    employee: '',
    area: '',
    status: '',
    year: '',
    skillDomain: '',
    certProvider: '',
  });

  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Local UI-only state for training comments (no API integration yet)
  const [trainingComments, setTrainingComments] = useState({});
  const [commentModal, setCommentModal] = useState({
    open: false,
    node: null,
    text: "",
  });

  const addFilter = (nodeType, field, value) => {
    setFilters((prev) => {
      const existing = prev.find(
        (f) => f.nodeType === nodeType && f.field === field
      );

      if (existing) {
        // add value if not present
        if (!existing.values.includes(value)) {
          return prev.map((f) =>
            f === existing ? { ...f, values: [...f.values, value] } : f
          );
        }
        return prev;
      }

      // new filter
      return [...prev, { nodeType, field, values: [value] }];
    });
  };

  const toggleFilterValue = (nodeType, field, value) => {
    setFilters((prev) => {
      const existing = prev.find(
        (f) => f.nodeType === nodeType && f.field === field
      );

      if (existing) {
        if (existing.values.includes(value)) {
          // Remove value
          const newValues = existing.values.filter((v) => v !== value);
          if (newValues.length === 0) {
            return prev.filter((f) => f !== existing);
          }
          return prev.map((f) =>
            f === existing ? { ...f, values: newValues } : f
          );
        } else {
          // Add value
          return prev.map((f) =>
            f === existing ? { ...f, values: [...f.values, value] } : f
          );
        }
      } else {
        // Create new filter
        return [...prev, { nodeType, field, values: [value] }];
      }
    });
  };

  const clearFilters = () => {
    setFilters([]);
  };

  const isFilterValueSelected = (nodeType, field, value) => {
    const filter = filters.find(
      (f) => f.nodeType === nodeType && f.field === field
    );
    return filter?.values.includes(value) || false;
  };

  const removeFilter = (nodeType, field, value) => {
    setFilters((prev) =>
      prev
        .map((f) => {
          if (f.nodeType === nodeType && f.field === field) {
            const newValues = f.values.filter((v) => v !== value);
            if (newValues.length === 0) return null;
            return { ...f, values: newValues };
          }
          return f;
        })
        .filter(Boolean)
    );
  };

  const nodeMatchesFilters = (node, filters) => {
    // Map old labels to new labels for compatibility
    const labelMapping = {
      'Domain': 'Category',
      'Discipline': 'Subcategory',
      'Skill': 'Sub-Subcategory',
      'Framework': 'Tool'
    };
    
    // Check both the actual label and mapped label
    const nodeLabels = [node.label];
    if (labelMapping[node.label]) {
      nodeLabels.push(labelMapping[node.label]);
    }
    if (Object.values(labelMapping).includes(node.label)) {
      // Find the old label
      const oldLabel = Object.keys(labelMapping).find(k => labelMapping[k] === node.label);
      if (oldLabel) nodeLabels.push(oldLabel);
    }
    
    const relevantFilters = filters.filter((f) => nodeLabels.includes(f.nodeType));

    // No filters for this node type:
    // - If there are active Training filters only, treat this node as non-matching
    //   so that higher-level Employee/Associates nodes can be pruned when they
    //   don't have any matching training descendants.
    // - Otherwise (mixed or no filters), consider it a match.
    if (relevantFilters.length === 0) {
      if (filters.length > 0 && filters.every((f) => f.nodeType === "Training")) {
        return false;
      }
      return true;
    }

    return relevantFilters.every((filter) => {
      const nodeValue = node[filter.field];
      if (nodeValue === undefined || nodeValue === null) return false;

      // Special handling for period (e.g. "23-jun" vs "2023")
      if (filter.field === "period") {
        const raw = String(nodeValue).toLowerCase(); // "23-jun"
        const yearPart = raw.split("-")[0]; // "23"
        const fullYear = yearPart.length === 2 ? "20" + yearPart : yearPart; // "2023"

        return filter.values.some((v) => String(v) === fullYear);
      }

      const nodeValueStr = String(nodeValue).toLowerCase();

      return filter.values.some((v) =>
        nodeValueStr.includes(String(v).toLowerCase())
      );
    });
  };

  const filterTreeByAdvancedFilters = (node, filters) => {
    if (!node) return null;

    // Section nodes (SkillsSection, CertificationsSection, TrainingsSection, AssociatesSection) are containers
    // Always include them if they have filtered children
    const isSectionNode = ["SkillsSection", "CertificationsSection", "TrainingsSection", "AssociatesSection"].includes(node.label);
    
    const relevantFiltersForThisNode = filters.filter(
      (f) => f.nodeType === node.label
    );

    const selfMatches = nodeMatchesFilters(node, filters);

    let filteredChildren = [];
    if (node.children && node.children.length > 0) {
      filteredChildren = node.children
        .map((child) => filterTreeByAdvancedFilters(child, filters))
        .filter(Boolean);
    }

    // If there are active Training filters, prune employees/associates that
    // do not have any descendant trainings matching those filters.
    const hasTrainingFilters = filters.some((f) => f.nodeType === "Training");

    const hasTrainingDescendant = (children) => {
      const stack = [...(children || [])];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        if (current.label === "Training" || current.label === "TrainingsSection") {
          return true;
        }
        if (current.children && current.children.length > 0) {
          stack.push(...current.children);
        }
      }
      return false;
    };

    // 🚨 KEY LOGIC
    if (isSectionNode) {
      // Section nodes: include if they have filtered children
      if (filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    }

    if (relevantFiltersForThisNode.length > 0) {
      if (!selfMatches) return null;

      return {
        ...node,
        children: filteredChildren,
      };
    }

    // When training filters are active, hide Employee/Manager/AssociatesSection
    // nodes that have no descendant trainings left after filtering and do not
    // themselves have any direct matching filters.
    if (
      hasTrainingFilters &&
      (node.label === "Employee" ||
        node.label === "Manager" ||
        node.label === "AssociatesSection")
    ) {
      if (!hasTrainingDescendant(filteredChildren) && !selfMatches) {
        return null;
      }
    }

    if (selfMatches || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      };
    }

    return null;
  };

  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    if (overviewHierarchy && overviewHierarchy.length > 0) {
      // Only auto-expand root on initial load; preserve current expansion state on updates
      setExpanded((prev) =>
        prev && prev.size > 0 ? prev : new Set([getNodeKey(overviewHierarchy[0])])
      );
    }
  }, [overviewHierarchy]);

  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains("dark")
  );

  const zoomHintTimeout = React.useRef(null);

  const extractTrainingFilterOptions = (node, acc) => {
    if (!node) return acc;

    if (node.label === "Training") {
      if (node.name) acc.name.add(node.name);
      if (node.period) {
        const raw = String(node.period).split("-")[0]; // "2023" or "23"
        acc.period.add(raw.length === 2 ? "20" + raw : raw);
      }
      if (node.area) acc.area.add(node.area);
      if (node.sub_area) acc.sub_area.add(node.sub_area);
      if (node.status) acc.status.add(node.status);
      if (node.type) acc.type.add(node.type);
    }

    node.children?.forEach((child) => extractTrainingFilterOptions(child, acc));

    return acc;
  };

  const extractSkillFilterOptions = (node, acc) => {
    if (!node) return acc;

    // Support both old schema (Domain/Discipline/Skill/Framework) and new schema (Category/Subcategory/Sub-Subcategory/Tool)
    if ((node.label === "Domain" || node.label === "Category") && node.name) {
      acc.domain.add(node.name);
    }
    if ((node.label === "Discipline" || node.label === "Subcategory") && node.name) {
      acc.discipline.add(node.name);
    }
    if ((node.label === "Skill" || node.label === "Sub-Subcategory") && node.name) {
      acc.skill.add(node.name);
    }
    if ((node.label === "Framework" || node.label === "Tool") && node.name) {
      acc.framework.add(node.name);
    }
    if (node.levelSelected) {
      acc.level.add(node.levelSelected);
    }

    node.children?.forEach((child) => extractSkillFilterOptions(child, acc));

    return acc;
  };

  const extractCertificationFilterOptions = (node, acc) => {
    if (!node) return acc;

    if (node.label === "Certification") {
      if (node.name) acc.name.add(node.name);
      if (node.certProvider) acc.provider.add(node.certProvider);
      if (node.certLevel) acc.level.add(node.certLevel);
      if (node.approvalStatus) acc.status.add(node.approvalStatus);
    }

    node.children?.forEach((child) => extractCertificationFilterOptions(child, acc));

    return acc;
  };

  const trainingFilterOptions = useMemo(() => {
    const acc = {
      name: new Set(),
      period: new Set(),
      area: new Set(),
      sub_area: new Set(),
      status: new Set(),
      type: new Set(),
    };

    if (!overviewHierarchy || overviewHierarchy.length === 0) {
      return acc;
    }

    overviewHierarchy.forEach((root) => {
      extractTrainingFilterOptions(root, acc);
    });

    return acc;
  }, [overviewHierarchy]);

  const skillFilterOptions = useMemo(() => {
    const acc = {
      domain: new Set(),
      discipline: new Set(),
      skill: new Set(),
      framework: new Set(),
      level: new Set(),
    };

    if (!overviewHierarchy || overviewHierarchy.length === 0) {
      return acc;
    }

    overviewHierarchy.forEach((root) => {
      extractSkillFilterOptions(root, acc);
    });

    return acc;
  }, [overviewHierarchy]);

  const certificationFilterOptions = useMemo(() => {
    const acc = {
      name: new Set(),
      provider: new Set(),
      level: new Set(),
      status: new Set(),
    };

    if (!overviewHierarchy || overviewHierarchy.length === 0) {
      return acc;
    }

    overviewHierarchy.forEach((root) => {
      extractCertificationFilterOptions(root, acc);
    });

    return acc;
  }, [overviewHierarchy]);

  const trainingOptionsMap = useMemo(() => {
    return {
      name: Array.from(trainingFilterOptions.name).sort(),
      period: Array.from(trainingFilterOptions.period).sort(),
      area: Array.from(trainingFilterOptions.area).sort(),
      sub_area: Array.from(trainingFilterOptions.sub_area).sort(),
      status: Array.from(trainingFilterOptions.status).sort(),
      type: Array.from(trainingFilterOptions.type).sort(),
    };
  }, [trainingFilterOptions]);

  const skillOptionsMap = useMemo(() => {
    return {
      domain: Array.from(skillFilterOptions.domain).sort(),
      discipline: Array.from(skillFilterOptions.discipline).sort(),
      skill: Array.from(skillFilterOptions.skill).sort(),
      framework: Array.from(skillFilterOptions.framework).sort(),
      level: Array.from(skillFilterOptions.level).sort(),
    };
  }, [skillFilterOptions]);

  const certificationOptionsMap = useMemo(() => {
    return {
      name: Array.from(certificationFilterOptions.name).sort(),
      provider: Array.from(certificationFilterOptions.provider).sort(),
      level: Array.from(certificationFilterOptions.level).sort(),
      status: Array.from(certificationFilterOptions.status).sort(),
    };
  }, [certificationFilterOptions]);

  const TRAINING_FILTER_FIELDS = useMemo(
    () => [
      {
        key: "name",
        label: "Name",
        inputType: "select",
        options: trainingOptionsMap.name,
      },
      {
        key: "period",
        label: "Year",
        inputType: "select",
        options: trainingOptionsMap.period,
      },
      {
        key: "area",
        label: "Area",
        inputType: "select",
        options: trainingOptionsMap.area,
      },
      {
        key: "sub_area",
        label: "Sub Area",
        inputType: "select",
        options: trainingOptionsMap.sub_area,
      },
      {
        key: "status",
        label: "Status",
        inputType: "select",
        options: trainingOptionsMap.status,
      },
      {
        key: "type",
        label: "Type",
        inputType: "select",
        options: trainingOptionsMap.type,
      },
    ],
    [trainingOptionsMap]
  );

  const extractEmployeeFilterOptions = (node, acc) => {
    if (!node) return acc;

    if (node.label === "Employee") {
      if (node.name) acc.name.add(node.name);
      if (node.email) acc.email.add(node.email);
    }

    node.children?.forEach((child) => extractEmployeeFilterOptions(child, acc));
    return acc;
  };

  // Extract employee names for filter dropdown
  const employeeNames = useMemo(() => {
    const names = new Set();
    const extractNames = (node) => {
      if (!node) return;
      if (node.label === "Employee" && node.name) {
        names.add(node.name);
      }
      node.children?.forEach((child) => extractNames(child));
    };
    if (overviewHierarchy && overviewHierarchy.length > 0) {
      extractNames(overviewHierarchy[0]);
    }
    return Array.from(names).sort();
  }, [overviewHierarchy]);

  // Extract areas, statuses, and years for filter dropdowns
  const filterOptions = useMemo(() => {
    const areas = new Set();
    const statuses = new Set();
    const years = new Set();

    const extractOptions = (node) => {
      if (!node) return;
      if (node.label === "Training") {
        if (node.area) areas.add(node.area);
        if (node.status) statuses.add(String(node.status));
        if (node.period) {
          const yearPart = node.period.split("-")[0];
          const fullYear = yearPart.length === 2 ? "20" + yearPart : yearPart;
          years.add(fullYear);
        }
      }
      node.children?.forEach((child) => extractOptions(child));
    };

    if (overviewHierarchy && overviewHierarchy.length > 0) {
      extractOptions(overviewHierarchy[0]);
    }

    return {
      areas: Array.from(areas).sort(),
      statuses: Array.from(statuses).sort(),
      years: Array.from(years).sort(),
    };
  }, [overviewHierarchy]);

  const EMPLOYEE_FILTER_FIELDS = useMemo(
    () => [
      {
        key: "name",
        label: "Name",
        inputType: "text", // keep text, dropdown would be ugly for long names
      },
      {
        key: "email",
        label: "Email",
        inputType: "text",
      },
    ],
    []
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Close dropdown when clicking outside and clear search
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && filterBarRef.current && !filterBarRef.current.contains(event.target)) {
        // Clear search when closing dropdown
        setFilterSearch({
          employee: '',
          area: '',
          status: '',
          year: '',
          skillDomain: '',
          certProvider: '',
        });
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openDropdown]);

  // Update container size on mount and resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const theme = isDark ? THEME_COLORS.dark : THEME_COLORS.light;

  // Filter tree by view mode
  const filterTreeByViewMode = (node, activeModes) => {
    if (!node) return null;

    // Filter children based on view mode
    let filteredChildren = [];
    if (node.children && node.children.length > 0) {
      filteredChildren = node.children
        .map((child) => {
          // Handle section nodes
          if (child.label === "TrainingsSection") {
            if (activeModes.training) {
              return filterTreeByViewMode(child, activeModes);
            }
            return null;
          }
          if (child.label === "SkillsSection") {
            if (activeModes.skills) {
              return filterTreeByViewMode(child, activeModes);
            }
            return null;
          }
          if (child.label === "CertificationsSection") {
            if (activeModes.certifications) {
              return filterTreeByViewMode(child, activeModes);
            }
            return null;
          }
          if (child.label === "AssociatesSection") {
            if (activeModes.associates) {
              return filterTreeByViewMode(child, activeModes);
            }
            return null;
          }
          // Recursively filter other nodes
          return filterTreeByViewMode(child, activeModes);
        })
        .filter(Boolean);
    }

    return {
      ...node,
      children: filteredChildren,
    };
  };

  const filteredTree = useMemo(() => {
    if (!overviewHierarchy || overviewHierarchy.length === 0) {
      return null;
    }

    let tree = overviewHierarchy[0]; // root

    // Apply view mode filter (multi-select)
    tree = filterTreeByViewMode(tree, viewModes);

    // Apply advanced filters
    tree = filterTreeByAdvancedFilters(tree, filters);

    return tree;
  }, [overviewHierarchy, filters, viewModes]);

  const TRAINING_FIELD_ORDER = [
    "module",
    "name",
    "status",
    "period",
    "start_date",
    "end_date",
    "area",
    "sub_area",
    "course_level",
    "type",
    "comment",
  ];

  const { nodes, links } = useMemo(() => {
    if (!filteredTree) return { nodes: [], links: [] };
    const layout = layoutNode(filteredTree, 0, 40, expanded);
    return { nodes: layout.nodes, links: layout.links };
  }, [filteredTree, expanded]);

  // Calculate SVG dimensions based on content
  const svgDimensions = useMemo(() => {
    if (nodes.length === 0) return { width: '100%', height: '100%' };
    
    const maxX = Math.max(...nodes.map(n => n.x), 0) + LEVEL_GAP + 200; // Add padding
    const maxY = Math.max(...nodes.map(n => n.y), 0) + 200; // Add padding
    
    return {
      width: Math.max(maxX, containerSize.width),
      height: Math.max(maxY, containerSize.height),
    };
  }, [nodes, containerSize]);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 40, y: 40 });
  const [dragStart, setDragStart] = useState(null);
  const lastViewBeforeExpand = useRef(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimeoutRef = useRef(null);
  const nodeToCenterRef = useRef(null);

  const collectAllDescendantKeys = (node, set, nodeKey) => {
    if (!node?.children) return;

    node.children.forEach((child) => {
      const childKey = makeNodeKey(child, nodeKey);
      set.add(childKey);
      collectAllDescendantKeys(child, set, childKey);
    });
  };

  const toggleNode = (node) => {
    // Use the path-based key stored on the layout node so duplicate-named
    // nodes at different positions in the tree are handled independently.
    const key = node._key ?? getNodeKey(node);

    // Determine current expand state before updating
    const isCurrentlyExpanded = expanded.has(key);

    if (!isCurrentlyExpanded) {
      lastViewBeforeExpand.current = { offset, zoom };
      nodeToCenterRef.current = key;
    } else {
      nodeToCenterRef.current = key;
      lastViewBeforeExpand.current = null;
    }

    setExpanded((prev) => {
      const next = new Set(prev);

      if (next.has(key)) {
        next.delete(key);

        const descendants = new Set();
        collectAllDescendantKeys(node, descendants, key);
        descendants.forEach((k) => next.delete(k));
      } else {
        next.add(key);
      }

      return next;
    });
  };

  // Effect to center node after expansion or collapse
  useEffect(() => {
    if (nodeToCenterRef.current && nodes.length > 0 && containerRef.current) {
      const nodeToCenter = nodes.find((n) => (n._key ?? getNodeKey(n)) === nodeToCenterRef.current);
      
      if (nodeToCenter) {
        setIsTransitioning(true);
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
        }

        // Use a small delay to ensure DOM has updated
        const timeoutId = setTimeout(() => {
          if (!containerRef.current) return;
          
          const containerRect = containerRef.current.getBoundingClientRect();
          if (containerRect.width === 0 || containerRect.height === 0) {
            setIsTransitioning(false);
            nodeToCenterRef.current = null;
            return;
          }
          
          const containerCenterX = containerRect.width / 2;
          const containerCenterY = containerRect.height / 2;

          // Calculate the offset needed to center the node
          // Account for the transform offset (40px) and zoom
          const targetOffsetX = containerCenterX - (nodeToCenter.x * zoom) - 40;
          const targetOffsetY = containerCenterY - (nodeToCenter.y * zoom);

          // Smoothly animate to center the node
          setOffset({ x: targetOffsetX, y: targetOffsetY });
          
          // Disable transition after animation completes
          transitionTimeoutRef.current = setTimeout(() => {
            setIsTransitioning(false);
            nodeToCenterRef.current = null;
          }, 600);
        }, 100);

        return () => clearTimeout(timeoutId);
      } else {
        // Node not found, clear the ref
        nodeToCenterRef.current = null;
      }
    }
  }, [nodes, zoom]);

  // Auto-fit graph to viewport on initial load only
  const hasInitializedFit = useRef(false);
  useEffect(() => {
    // Only auto-fit on initial load, not when user is interacting
    if (nodes.length > 0 && containerRef.current && !hasInitializedFit.current && !isTransitioning && !nodeToCenterRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      if (containerRect.width === 0 || containerRect.height === 0) return;
      
      const minX = Math.min(...nodes.map(n => n.x), 0);
      const maxX = Math.max(...nodes.map(n => n.x), 0);
      const minY = Math.min(...nodes.map(n => n.y), 0);
      const maxY = Math.max(...nodes.map(n => n.y), 0);
      
      const graphWidth = maxX - minX;
      const graphHeight = maxY - minY;
      
      if (graphWidth > 0 && graphHeight > 0) {
        const padding = 100;
        const availableWidth = containerRect.width - padding;
        const availableHeight = containerRect.height - padding;
        
        const zoomX = availableWidth / graphWidth;
        const zoomY = availableHeight / graphHeight;
        const fitZoom = Math.min(zoomX, zoomY, 1); // Don't zoom in more than 1x
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        const targetOffsetX = (containerRect.width / 2) - (centerX * fitZoom) - 40;
        const targetOffsetY = (containerRect.height / 2) - (centerY * fitZoom);
        
        setZoom(fitZoom);
        setOffset({ x: targetOffsetX, y: targetOffsetY });
        hasInitializedFit.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Cleanup transition timeout on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <style>{`
        .training-tree-scroll-container::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
        .training-tree-scroll-container {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        
        /* Smooth transitions for graph elements */
        .graph-transition-group {
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .graph-node {
          transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 0.3s ease-in-out;
        }
        
        .graph-link {
          transition: d 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 0.3s ease-in-out;
        }
      `}</style>
      <div
        className="h-full flex flex-col rounded-xl border border-slate-200 dark:border-slate-700"
        style={{ background: theme.canvasBg }}
      >
      {/* Filter Bar */}
      <div ref={filterBarRef} className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {/* View Mode Toggle (multi-select) */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">View:</span>
          <div className="flex items-center gap-1 rounded-lg">
            <button
              onClick={() => setViewModes({ training: true, skills: true, certifications: true, associates: true })}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewModes.training && viewModes.skills && viewModes.certifications && viewModes.associates
                  ? "bg-blue-500 text-white border border-blue-500 shadow-sm"
                  : "border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              All
            </button>
            <button
              onClick={() =>
                setViewModes((prev) => ({ ...prev, training: !prev.training }))
              }
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewModes.training
                  ? "bg-blue-500 text-white border border-blue-500 shadow-sm"
                  : "border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Training
            </button>
            <button
              onClick={() =>
                setViewModes((prev) => ({ ...prev, skills: !prev.skills }))
              }
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewModes.skills
                  ? "bg-blue-500 text-white border border-blue-500 shadow-sm"
                  : "border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Skills
            </button>
            <button
              onClick={() =>
                setViewModes((prev) => ({ ...prev, certifications: !prev.certifications }))
              }
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewModes.certifications
                  ? "bg-blue-500 text-white border border-blue-500 shadow-sm"
                  : "border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Certifications
            </button>
            <button
              onClick={() =>
                setViewModes((prev) => ({ ...prev, associates: !prev.associates }))
              }
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewModes.associates
                  ? "bg-blue-500 text-white border border-blue-500 shadow-sm"
                  : "border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Associates
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Employee Filter */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'employee' ? null : 'employee')}
              onMouseEnter={() => setOpenDropdown('employee')}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md
                transition-all duration-200 ease-in-out
                ${openDropdown === 'employee' 
                  ? 'bg-blue-50 dark:bg-blue-950/50 border-2 border-blue-500 text-blue-700 dark:text-blue-300 shadow-sm' 
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm'
                }
              `}
            >
              <span>Employee</span>
              <svg 
                className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'employee' ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {filters.find(f => f.nodeType === 'Employee' && f.field === 'name')?.values.length > 0 && (
                <span className="ml-0.5 text-[10px] font-semibold bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {filters.find(f => f.nodeType === 'Employee' && f.field === 'name')?.values.length}
                </span>
              )}
            </button>
            {openDropdown === 'employee' && (
              <div 
                className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[220px]"
                onMouseEnter={() => setOpenDropdown('employee')}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                {/* Search Input */}
                <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={filterSearch.employee}
                    onChange={(e) => setFilterSearch({...filterSearch, employee: e.target.value})}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {/* Select All */}
                <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <label className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={employeeNames.length > 0 && employeeNames.filter(name => 
                        name.toLowerCase().includes(filterSearch.employee.toLowerCase())
                      ).every(name => 
                        isFilterValueSelected('Employee', 'name', name)
                      )}
                      onChange={(e) => {
                        const filteredNames = employeeNames.filter(name => 
                          name.toLowerCase().includes(filterSearch.employee.toLowerCase())
                        );
                        if (e.target.checked) {
                          filteredNames.forEach(name => {
                            if (!isFilterValueSelected('Employee', 'name', name)) {
                              toggleFilterValue('Employee', 'name', name);
                            }
                          });
                        } else {
                          filteredNames.forEach(name => {
                            if (isFilterValueSelected('Employee', 'name', name)) {
                              toggleFilterValue('Employee', 'name', name);
                            }
                          });
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    Select All
                  </label>
                </div>
                {/* Filtered Options */}
                <div className="max-h-40 overflow-y-auto py-0.5">
                  {employeeNames
                    .filter(name => name.toLowerCase().includes(filterSearch.employee.toLowerCase()))
                    .map((name) => (
                      <label
                        key={name}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isFilterValueSelected('Employee', 'name', name)}
                          onChange={() => toggleFilterValue('Employee', 'name', name)}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="flex-1">{name}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Area Filter */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'area' ? null : 'area')}
              onMouseEnter={() => setOpenDropdown('area')}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md
                transition-all duration-200 ease-in-out
                ${openDropdown === 'area' 
                  ? 'bg-blue-50 dark:bg-blue-950/50 border-2 border-blue-500 text-blue-700 dark:text-blue-300 shadow-sm' 
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm'
                }
              `}
            >
              <span>Area</span>
              <svg 
                className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'area' ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {filters.find(f => f.nodeType === 'Training' && f.field === 'area')?.values.length > 0 && (
                <span className="ml-0.5 text-[10px] font-semibold bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {filters.find(f => f.nodeType === 'Training' && f.field === 'area')?.values.length}
                </span>
              )}
            </button>
            {openDropdown === 'area' && (
              <div 
                className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[220px]"
                onMouseEnter={() => setOpenDropdown('area')}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                {/* Search Input */}
                <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={filterSearch.area}
                    onChange={(e) => setFilterSearch({...filterSearch, area: e.target.value})}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {/* Select All */}
                <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <label className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={filterOptions.areas.length > 0 && filterOptions.areas.filter(area => 
                        area.toLowerCase().includes(filterSearch.area.toLowerCase())
                      ).every(area => 
                        isFilterValueSelected('Training', 'area', area)
                      )}
                      onChange={(e) => {
                        const filteredAreas = filterOptions.areas.filter(area => 
                          area.toLowerCase().includes(filterSearch.area.toLowerCase())
                        );
                        if (e.target.checked) {
                          filteredAreas.forEach(area => {
                            if (!isFilterValueSelected('Training', 'area', area)) {
                              toggleFilterValue('Training', 'area', area);
                            }
                          });
                        } else {
                          filteredAreas.forEach(area => {
                            if (isFilterValueSelected('Training', 'area', area)) {
                              toggleFilterValue('Training', 'area', area);
                            }
                          });
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    Select All
                  </label>
                </div>
                {/* Filtered Options */}
                <div className="max-h-40 overflow-y-auto py-0.5">
                  {filterOptions.areas
                    .filter(area => area.toLowerCase().includes(filterSearch.area.toLowerCase()))
                    .map((area) => (
                      <label
                        key={area}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isFilterValueSelected('Training', 'area', area)}
                          onChange={() => toggleFilterValue('Training', 'area', area)}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="flex-1">{area}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Status Filter */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
              onMouseEnter={() => setOpenDropdown('status')}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md
                transition-all duration-200 ease-in-out
                ${openDropdown === 'status' 
                  ? 'bg-blue-50 dark:bg-blue-950/50 border-2 border-blue-500 text-blue-700 dark:text-blue-300 shadow-sm' 
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm'
                }
              `}
            >
              <span>Status</span>
              <svg 
                className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'status' ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {filters.find(f => f.nodeType === 'Training' && f.field === 'status')?.values.length > 0 && (
                <span className="ml-0.5 text-[10px] font-semibold bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {filters.find(f => f.nodeType === 'Training' && f.field === 'status')?.values.length}
                </span>
              )}
            </button>
            {openDropdown === 'status' && (
              <div 
                className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[220px]"
                onMouseEnter={() => setOpenDropdown('status')}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                {/* Search Input */}
                <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={filterSearch.status}
                    onChange={(e) => setFilterSearch({...filterSearch, status: e.target.value})}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {/* Select All */}
                <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <label className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={filterOptions.statuses.length > 0 && filterOptions.statuses.filter(status => 
                        status.toLowerCase().includes(filterSearch.status.toLowerCase())
                      ).every(status => 
                        isFilterValueSelected('Training', 'status', status)
                      )}
                      onChange={(e) => {
                        const filteredStatuses = filterOptions.statuses.filter(status => 
                          status.toLowerCase().includes(filterSearch.status.toLowerCase())
                        );
                        if (e.target.checked) {
                          filteredStatuses.forEach(status => {
                            if (!isFilterValueSelected('Training', 'status', status)) {
                              toggleFilterValue('Training', 'status', status);
                            }
                          });
                        } else {
                          filteredStatuses.forEach(status => {
                            if (isFilterValueSelected('Training', 'status', status)) {
                              toggleFilterValue('Training', 'status', status);
                            }
                          });
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    Select All
                  </label>
                </div>
                {/* Filtered Options */}
                <div className="max-h-40 overflow-y-auto py-0.5">
                  {filterOptions.statuses
                    .filter(status => status.toLowerCase().includes(filterSearch.status.toLowerCase()))
                    .map((status) => (
                      <label
                        key={status}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isFilterValueSelected('Training', 'status', status)}
                          onChange={() => toggleFilterValue('Training', 'status', status)}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="flex-1">{status}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Year Filter */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'year' ? null : 'year')}
              onMouseEnter={() => setOpenDropdown('year')}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md
                transition-all duration-200 ease-in-out
                ${openDropdown === 'year' 
                  ? 'bg-blue-50 dark:bg-blue-950/50 border-2 border-blue-500 text-blue-700 dark:text-blue-300 shadow-sm' 
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm'
                }
              `}
            >
              <span>Year</span>
              <svg 
                className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'year' ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {filters.find(f => f.nodeType === 'Training' && f.field === 'period')?.values.length > 0 && (
                <span className="ml-0.5 text-[10px] font-semibold bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {filters.find(f => f.nodeType === 'Training' && f.field === 'period')?.values.length}
                </span>
              )}
            </button>
            {openDropdown === 'year' && (
              <div 
                className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[220px]"
                onMouseEnter={() => setOpenDropdown('year')}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                {/* Search Input */}
                <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={filterSearch.year}
                    onChange={(e) => setFilterSearch({...filterSearch, year: e.target.value})}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {/* Select All */}
                <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <label className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={filterOptions.years.length > 0 && filterOptions.years.filter(year => 
                        year.toString().includes(filterSearch.year)
                      ).every(year => 
                        isFilterValueSelected('Training', 'period', year)
                      )}
                      onChange={(e) => {
                        const filteredYears = filterOptions.years.filter(year => 
                          year.toString().includes(filterSearch.year)
                        );
                        if (e.target.checked) {
                          filteredYears.forEach(year => {
                            if (!isFilterValueSelected('Training', 'period', year)) {
                              toggleFilterValue('Training', 'period', year);
                            }
                          });
                        } else {
                          filteredYears.forEach(year => {
                            if (isFilterValueSelected('Training', 'period', year)) {
                              toggleFilterValue('Training', 'period', year);
                            }
                          });
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    Select All
                  </label>
                </div>
                {/* Filtered Options */}
                <div className="max-h-40 overflow-y-auto py-0.5">
                  {filterOptions.years
                    .filter(year => year.toString().includes(filterSearch.year))
                    .map((year) => (
                      <label
                        key={year}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isFilterValueSelected('Training', 'period', year)}
                          onChange={() => toggleFilterValue('Training', 'period', year)}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="flex-1">{year}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Skills Category/Domain Filter */}
          {skillOptionsMap.domain.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'skill-domain' ? null : 'skill-domain')}
                onMouseEnter={() => setOpenDropdown('skill-domain')}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md
                  transition-all duration-200 ease-in-out
                  ${openDropdown === 'skill-domain' 
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-2 border-blue-500 text-blue-700 dark:text-blue-300 shadow-sm' 
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm'
                  }
                `}
              >
                <span>Skill Category</span>
                <svg 
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'skill-domain' ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {(filters.find(f => f.nodeType === 'Domain' && f.field === 'name')?.values.length > 0 ||
                  filters.find(f => f.nodeType === 'Category' && f.field === 'name')?.values.length > 0) && (
                  <span className="ml-0.5 text-[10px] font-semibold bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {(filters.find(f => f.nodeType === 'Domain' && f.field === 'name')?.values.length || 0) +
                     (filters.find(f => f.nodeType === 'Category' && f.field === 'name')?.values.length || 0)}
                  </span>
                )}
              </button>
              {openDropdown === 'skill-domain' && (
                <div 
                  className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[220px]"
                  onMouseEnter={() => setOpenDropdown('skill-domain')}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  {/* Search Input */}
                  <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                    <input
                      type="text"
                      placeholder="Search..."
                      value={filterSearch.skillDomain}
                      onChange={(e) => setFilterSearch({...filterSearch, skillDomain: e.target.value})}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {/* Select All */}
                  <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <label className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={skillOptionsMap.domain.length > 0 && skillOptionsMap.domain.filter(domain => 
                          domain.toLowerCase().includes(filterSearch.skillDomain.toLowerCase())
                        ).every(domain => 
                          isFilterValueSelected('Domain', 'name', domain) || isFilterValueSelected('Category', 'name', domain)
                        )}
                        onChange={(e) => {
                          const filteredDomains = skillOptionsMap.domain.filter(domain => 
                            domain.toLowerCase().includes(filterSearch.skillDomain.toLowerCase())
                          );
                          if (e.target.checked) {
                            filteredDomains.forEach(domain => {
                              if (!isFilterValueSelected('Domain', 'name', domain)) {
                                toggleFilterValue('Domain', 'name', domain);
                              }
                              if (!isFilterValueSelected('Category', 'name', domain)) {
                                toggleFilterValue('Category', 'name', domain);
                              }
                            });
                          } else {
                            filteredDomains.forEach(domain => {
                              if (isFilterValueSelected('Domain', 'name', domain)) {
                                toggleFilterValue('Domain', 'name', domain);
                              }
                              if (isFilterValueSelected('Category', 'name', domain)) {
                                toggleFilterValue('Category', 'name', domain);
                              }
                            });
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      Select All
                    </label>
                  </div>
                  {/* Filtered Options */}
                  <div className="max-h-40 overflow-y-auto py-0.5">
                    {skillOptionsMap.domain
                      .filter(domain => domain.toLowerCase().includes(filterSearch.skillDomain.toLowerCase()))
                      .map((domain) => (
                        <label
                          key={domain}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isFilterValueSelected('Domain', 'name', domain) || isFilterValueSelected('Category', 'name', domain)}
                            onChange={() => {
                              // Try both node types for compatibility
                              toggleFilterValue('Domain', 'name', domain);
                              toggleFilterValue('Category', 'name', domain);
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="flex-1">{domain}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Certification Provider Filter */}
          {certificationOptionsMap.provider.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'cert-provider' ? null : 'cert-provider')}
                onMouseEnter={() => setOpenDropdown('cert-provider')}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md
                  transition-all duration-200 ease-in-out
                  ${openDropdown === 'cert-provider' 
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-500 text-amber-700 dark:text-amber-300 shadow-sm' 
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm'
                  }
                `}
              >
                <span>Cert Provider</span>
                <svg 
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'cert-provider' ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {filters.find(f => f.nodeType === 'Certification' && f.field === 'certProvider')?.values.length > 0 && (
                  <span className="ml-0.5 text-[10px] font-semibold bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {filters.find(f => f.nodeType === 'Certification' && f.field === 'certProvider')?.values.length}
                  </span>
                )}
              </button>
              {openDropdown === 'cert-provider' && (
                <div 
                  className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[220px]"
                  onMouseEnter={() => setOpenDropdown('cert-provider')}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  {/* Search Input */}
                  <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                    <input
                      type="text"
                      placeholder="Search..."
                      value={filterSearch.certProvider}
                      onChange={(e) => setFilterSearch({...filterSearch, certProvider: e.target.value})}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  {/* Select All */}
                  <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <label className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={certificationOptionsMap.provider.length > 0 && certificationOptionsMap.provider.filter(provider => 
                          provider.toLowerCase().includes(filterSearch.certProvider.toLowerCase())
                        ).every(provider => 
                          isFilterValueSelected('Certification', 'certProvider', provider)
                        )}
                        onChange={(e) => {
                          const filteredProviders = certificationOptionsMap.provider.filter(provider => 
                            provider.toLowerCase().includes(filterSearch.certProvider.toLowerCase())
                          );
                          if (e.target.checked) {
                            filteredProviders.forEach(provider => {
                              if (!isFilterValueSelected('Certification', 'certProvider', provider)) {
                                toggleFilterValue('Certification', 'certProvider', provider);
                              }
                            });
                          } else {
                            filteredProviders.forEach(provider => {
                              if (isFilterValueSelected('Certification', 'certProvider', provider)) {
                                toggleFilterValue('Certification', 'certProvider', provider);
                              }
                            });
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-amber-600 focus:ring-2 focus:ring-amber-500"
                      />
                      Select All
                    </label>
                  </div>
                  {/* Filtered Options */}
                  <div className="max-h-40 overflow-y-auto py-0.5">
                    {certificationOptionsMap.provider
                      .filter(provider => provider.toLowerCase().includes(filterSearch.certProvider.toLowerCase()))
                      .map((provider) => (
                        <label
                          key={provider}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isFilterValueSelected('Certification', 'certProvider', provider)}
                            onChange={() => toggleFilterValue('Certification', 'certProvider', provider)}
                            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-amber-600 focus:ring-2 focus:ring-amber-500"
                          />
                          <span className="flex-1">{provider}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Clear Button */}
          {filters.length > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 ease-in-out"
              title="Clear all filters"
            >
              <svg 
                className="w-5 h-5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>


      {/* SVG CANVAS */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden training-tree-scroll-container"
        style={{ 
          background: theme.canvasBg,
          scrollbarWidth: 'none',
          MsOverflowStyle: 'none',
        }}
      >
        {/* Scroll hint: Ctrl+scroll to zoom, plain scroll to pan */}
        {/* Scroll hint: Ctrl+scroll to zoom, plain scroll to pan */}
        <OverviewNodeTooltip
          node={hoveredNode}
          position={tooltipPos}
          theme={theme}
          TRAINING_FIELD_ORDER={TRAINING_FIELD_ORDER}
          NODE_COLORS={NODE_COLORS}
        />
        {/* No training found */}
        {!loading && (!overviewHierarchy || overviewHierarchy.length === 0) && (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-slate-400 text-sm">
            No data found.
          </div>
        )}
        {!loading && overviewHierarchy && filteredTree && (
          <svg
            width={svgDimensions.width}
            height={svgDimensions.height}
            style={{ minWidth: '100%', minHeight: '100%' }}
            onWheel={(e) => {
              e.preventDefault();
              if (e.ctrlKey) {
                // Ctrl + scroll → zoom
                setZoom((z) =>
                  Math.min(1.8, Math.max(0.3, z + (e.deltaY > 0 ? -0.08 : 0.08)))
                );
              } else {
                // Plain scroll → pan
                setIsTransitioning(false);
                setOffset((p) => ({
                  x: p.x - e.deltaX,
                  y: p.y - e.deltaY,
                }));
              }
            }}
            onMouseDown={(e) => setDragStart({ x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => {
              if (!dragStart) return;
              // Disable transitions while dragging for immediate feedback
              setIsTransitioning(false);
              setOffset((p) => ({
                x: p.x + e.clientX - dragStart.x,
                y: p.y + e.clientY - dragStart.y,
              }));
              setDragStart({ x: e.clientX, y: e.clientY });
            }}
            onMouseUp={() => setDragStart(null)}
            className="cursor-grab"
          >
            <defs>
              <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow
                  dx="0"
                  dy="2"
                  stdDeviation="3"
                  floodOpacity="0.2"
                />
              </filter>
            </defs>

            <g
              className={isTransitioning ? "graph-transition-group" : ""}
              style={{
                transition: isTransitioning 
                  ? "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)" 
                  : "none"
              }}
              transform={`translate(${offset.x + 40}, ${
                offset.y
              }) scale(${zoom})`}
            >
              {/* Links */}
              {links.map((l, i) => (
                <path
                  key={i}
                  className="graph-link"
                  d={`M ${l.from.x + 60} ${l.from.y}
                C ${l.from.x + 140} ${l.from.y},
                  ${l.to.x - 140} ${l.to.y},
                  ${l.to.x - 60} ${l.to.y}`}
                  fill="none"
                  stroke={theme.link}
                  strokeWidth="1.5"
                  opacity="0.8"
                />
              ))}

              {/* Nodes */}
              {nodes.map((node) => {
                const color = getNodeStrokeColor(node);
                // Use path-based _key so duplicate-named nodes collapse/expand independently
                const nodeKey = node._key ?? getNodeKey(node);
                const isExpanded = expanded.has(nodeKey);
                const isEmployee = node.label === "Employee" || node.label === "Manager";
                const isSkillNode = ["SkillsSection", "Category", "Subcategory", "Sub-Subcategory"].includes(node.label);
                const hasChildCount = isSkillNode && node.childCount !== undefined && node.childCount > 0;
                const isTrainingNode = node.label === "Training";

                // Adjust node width if it has a badge
                const nodeWidth = hasChildCount ? 140 : 120;
                const nodeHeight = 40;

                return (
                  <g
                    key={nodeKey}
                    className="graph-node cursor-pointer"
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => hasChildren(node) && toggleNode(node)}
                    onMouseEnter={(e) => {
                      setHoveredNode(node);
                      const rect = containerRef.current?.getBoundingClientRect();
                      setTooltipPos({
                        x: rect ? e.clientX - rect.left : e.clientX,
                        y: rect ? e.clientY - rect.top : e.clientY,
                      });
                    }}
                    onMouseMove={(e) => {
                      const rect = containerRef.current?.getBoundingClientRect();
                      setTooltipPos({
                        x: rect ? e.clientX - rect.left : e.clientX,
                        y: rect ? e.clientY - rect.top : e.clientY,
                      });
                    }}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <rect
                      x={-nodeWidth / 2}
                      y={-nodeHeight / 2}
                      width={nodeWidth}
                      height={nodeHeight}
                      rx={12}
                      ry={12}
                      fill={theme.canvasBg}
                      stroke={color}
                      strokeWidth="2"
                      filter="url(#shadow)"
                    />

                    {hasChildren(node) && (
                      <g
                        transform={`translate(${nodeWidth / 2 + 10}, 0)`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNode(node);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <circle
                          r="10"
                          fill={theme.canvasBg}
                          stroke={color}
                          strokeWidth="2"
                        />
                        <text
                          x="0"
                          y="5"
                          textAnchor="middle"
                          fontSize="14"
                          fontWeight="bold"
                          fill={color}
                        >
                          {isExpanded ? "−" : "+"}
                        </text>
                      </g>
                    )}

                    {/* Node name — wrapped in foreignObject so long text stays inside the box */}
                    <foreignObject
                      x={-nodeWidth / 2}
                      y={-nodeHeight / 2}
                      width={nodeWidth}
                      height={nodeHeight}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        xmlns="http://www.w3.org/1999/xhtml"
                        style={{
                          width: "100%",
                          height: "100%",
                          boxSizing: "border-box",
                          padding: hasChildCount ? "2px 8px 14px" : "4px 8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          wordBreak: "break-word",
                          overflowWrap: "break-word",
                          overflow: "hidden",
                          textAlign: "center",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: theme.text,
                          lineHeight: 1.25,
                        }}
                      >
                        {node.name}
                      </div>
                    </foreignObject>

                    {/* Count badge for skill hierarchy nodes */}
                    {hasChildCount && (
                      <g transform="translate(0, 10)">
                        <circle
                          r="14"
                          fill={color}
                          opacity="0.15"
                        />
                        <text
                          x="0"
                          y="4"
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="700"
                          fill={color}
                        >
                          {node.childCount}
                        </text>
                      </g>
                    )}

                    {/* Add Comment button for Training nodes */}
                    {isTrainingNode && (
                      <g
                        // Position slightly outside the top-right corner of the training node,
                        // similar to other attached controls
                        transform={`translate(${nodeWidth / 2 + 10}, ${-nodeHeight / 7 + 20})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCommentModal({
                            open: true,
                            node,
                            text:
                              trainingComments[node.id] ??
                              node.manager_comment ??
                              node.comment ??
                              "",
                          });
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        {/* Speech-bubble style comment icon */}
                        <rect
                          x="-7"
                          y="-6"
                          width="14"
                          height="10"
                          rx="3"
                          ry="3"
                          fill={NODE_COLORS.Training}
                          fillOpacity="0.12"
                          stroke={NODE_COLORS.Training}
                          strokeWidth="1.5"
                        />
                        {/* Small tail */}
                        <path
                          d="M -2 4 L 0 6 L 2 4"
                          fill={NODE_COLORS.Training}
                          fillOpacity="0.12"
                          stroke={NODE_COLORS.Training}
                          strokeWidth="1"
                        />
                        {/* Ellipsis inside bubble */}
                        <circle cx="-3" cy="-1" r="0.7" fill={NODE_COLORS.Training} />
                        <circle cx="0" cy="-1" r="0.7" fill={NODE_COLORS.Training} />
                        <circle cx="3" cy="-1" r="0.7" fill={NODE_COLORS.Training} />
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
      {/* Add Comment Modal for Training nodes (UI-only, no API yet) */}
      {commentModal.open && commentModal.node && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl p-4 w-full max-w-md">
            <h2 className="text-sm font-semibold mb-2 text-slate-800 dark:text-slate-100">
              Add Comment - {commentModal.node.name}
            </h2>
            <textarea
              className="w-full h-28 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Type your comment here..."
              value={commentModal.text}
              onChange={(e) =>
                setCommentModal((prev) => ({ ...prev, text: e.target.value }))
              }
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() =>
                  setCommentModal({
                    open: false,
                    node: null,
                    text: "",
                  })
                }
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
                onClick={async () => {
                  if (!commentModal.node) return;

                  const trimmed = commentModal.text?.trim() ?? "";
                  const employeeId = commentModal.node.employee_id;

                  const entityType = nodeLabelToEntityType(commentModal.node.label);
                  const saved = await saveComment(
                    commentModal.node.id,
                    entityType,
                    trimmed,
                    employeeId
                  );

                  if (saved) {
                    setTrainingComments((prev) => ({
                      ...prev,
                      [commentModal.node.id]: trimmed,
                    }));
                    setCommentModal({
                      open: false,
                      node: null,
                      text: "",
                    });
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
