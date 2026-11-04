import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  FaTimesCircle,
  FaFilter,
  FaSave,
  FaDownload,
  FaSearch,
} from "react-icons/fa";
import { SiTarget } from "react-icons/si";
import { getHeaderName } from "../helper/utility";
import { FaQuestion } from "react-icons/fa6";
import LevelDetailModal from "./LevelDetailModal";
import { useAuth } from "../hooks/useAuth";
import { useSkills } from "../context/SkillContext";
// Shared multi-select filter dropdown (search-within-options, checkboxes,
// Clear/Apply) — originally built for the Training Batches table, reused
// here so Domain/Discipline/Skill Area/Framework filtering behaves the same
// way across the app instead of this table having its own one-off dropdown.
import InlineMultiSelectFilter from "../features/training/shared/components/filters/MultiSelectFilter";
import toast from "react-hot-toast";

const SkillDataTable = ({ data, headers, employeeInfo, preselectedSkills }) => {
  const { setUser } = useAuth();
  const [filters, setFilters] = useState({});
  const [selectedRadios, setSelectedRadios] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [activeFilterHeader, setActiveFilterHeader] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [modalLevels, setModalLevels] = useState(null);
  const [emailError, setEmailError] = useState("");

  const [managerModalOpen, setManagerModalOpen] = useState(false);
  const [managerEmail, setManagerEmail] = useState("");
  const [pendingExpertSkills, setPendingExpertSkills] = useState([]);
  const [showUnselectedOnly, setShowUnselectedOnly] = useState(false);

  const tableRef = useRef(null);

  const preserveScroll = (callback) => {
    const container = tableRef.current;
    const scrollTop = container ? container.scrollTop : 0;

    callback(); // this triggers sorting/re-render

    requestAnimationFrame(() => {
      if (container) container.scrollTop = scrollTop;
    });
  };

  // IMPORTANT: this reads from `cleanedData` (the full, unfiltered skill
  // list), never from `processedData`/`paginatedData` (what's currently
  // rendered on screen). `processedData` is display-only — it shrinks to
  // nothing when "Hide selected skills" is on, or to a search/filter subset
  // otherwise. saveEmployeeSkills() below sends whichever array it's given
  // as the employee's COMPLETE skill list, and the backend deletes any
  // previously-saved skill that isn't present in that list. Passing the
  // display-filtered array here was a real bug: toggling "Hide selected
  // skills" and then clicking Save wiped every saved skill, because the
  // filtered view legitimately contained none of them. Always use
  // `cleanedData` (or `selectedRadios`, which is what actually holds every
  // selection regardless of what's currently visible) for anything that
  // gets submitted to the server.
  const handleSaveClick = () => {
    const newExpertSkills = cleanedData.filter((row) => {
      const selected = selectedRadios[row.skillhierarchy_id];
      return (
        selected && // a selection exists
        selected.Level === "L3" && // Expert level selected
        (!preselectedSkills || // check if it's newly selected
          !preselectedSkills[row.skillhierarchy_id] ||
          preselectedSkills[row.skillhierarchy_id].Level !== "L3")
      );
    });

    if (newExpertSkills.length > 0 && employeeInfo.managerEmail === "") {
      setPendingExpertSkills(newExpertSkills);
      setManagerModalOpen(true);
    } else {
      saveEmployeeSkills(employeeInfo, cleanedData, selectedRadios);
    }
  };

  const confirmSaveWithManager = () => {
    if (!managerEmail) {
      setEmailError("Manager email is required");
      return;
    }
    if (managerEmail === employeeInfo.email) {
      setEmailError("Manager email cannot be your own email");
      return;
    }
    // Optionally, you can attach the manager email to the payload
    setUser((prev) => ({ ...prev, managerEmail: managerEmail }));
    // Same `cleanedData` requirement as handleSaveClick above — do not swap
    // this for `processedData`, see the comment there for why.
    saveEmployeeSkills(
      employeeInfo,
      cleanedData,
      selectedRadios,
      managerEmail
    );

    setManagerModalOpen(false);
    setManagerEmail("");
    setPendingExpertSkills([]);
  };

  const { saveEmployeeSkills, isSaving, downloadSkillMatrix } = useSkills();

  const cleanedData = data.filter((row) =>
    Object.values(row).some((val) => val && val.toString().trim() !== "")
  ).map((row) => {
    // Normalize field names: map API field names to expected field names
    const normalizedRow = { ...row };
    
    // Map skill_area to skill_name if skill_area exists but skill_name doesn't
    if (normalizedRow.skill_area && !normalizedRow.skill_name) {
      normalizedRow.skill_name = normalizedRow.skill_area;
    }
    
    return normalizedRow;
  });

  const fixedHeaderOrder = [
    "domain_name",
    "discipline_name",
    "skill_name",
    "framework_name",
    "L1",
    "L2",
    "L3",
  ];

  const columnWidths = {
    domain_name: "w-[12%]",
    discipline_name: "w-[14%]",
    skill_name: "w-[14%]",
    framework_name: "w-[14%]",
    L1: "w-[10%]",
    L2: "w-[10%]",
    L3: "w-[10%]",
  };

  useEffect(() => {
    const initialFilters = {};
    headers.forEach((header) => {
      initialFilters[header] = [];
    });
    setFilters(initialFilters);
  }, [headers, data]);

  useEffect(() => {
    if (
      data.length > 0 &&
      preselectedSkills &&
      Object.keys(preselectedSkills).length > 0
    ) {
      // Ensure we keep full skill info: Level, Status, RejectReason
      const updatedSelections = {};

      data.forEach((item) => {
        const skill = preselectedSkills[item.skillhierarchy_id];
        if (skill) {
          updatedSelections[item.skillhierarchy_id] = {
            Level: skill.Level || null,
            Status: skill.Status || null,
            RejectReason: skill.RejectReason || null,
          };
        }
      });

      setSelectedRadios(updatedSelections);
    }
  }, [data, preselectedSkills]);

  // Helper to find actual data key from display header
  const findDataKey = (displayHeader, dataKeys) => {
    // Try exact match first
    if (dataKeys.includes(displayHeader)) {
      return displayHeader;
    }
    
    // Map alternative field names (for backward compatibility with master skills data)
    const fieldMappings = {
      skill_name: ["skill_area", "skillArea", "skill"],
      domain_name: ["domain", "Domain"],
      discipline_name: ["discipline", "Discipline"],
      framework_name: ["framework", "Framework"],
    };
    
    // Check if there's a mapping for this header
    if (fieldMappings[displayHeader]) {
      for (const altName of fieldMappings[displayHeader]) {
        if (dataKeys.includes(altName)) {
          return altName;
        }
      }
    }
    
    return displayHeader;
  };

  // Build mapping from display headers to actual data keys
  const headerToDataKeyMap = useMemo(() => {
    const map = {};
    if (cleanedData.length > 0) {
      const firstRow = cleanedData[0];
      const dataKeys = Object.keys(firstRow);

      // Map display headers to actual data keys
      fixedHeaderOrder.forEach((displayHeader) => {
        map[displayHeader] = findDataKey(displayHeader, dataKeys);
      });
    }
    return map;
  }, [cleanedData]);

  // Helper to normalize header names for data access
  const getDataKey = (header) => {
    return headerToDataKeyMap[header] || header;
  };

  // Get actual data keys for search
  const searchDataKeys = useMemo(() => {
    if (cleanedData.length === 0)
      return ["domain_name", "discipline_name", "skill_name", "framework_name"];
    const firstRow = cleanedData[0];
    const dataKeys = Object.keys(firstRow);
    return [
      findDataKey("domain_name", dataKeys),
      findDataKey("discipline_name", dataKeys),
      findDataKey("skill_name", dataKeys),
      findDataKey("framework_name", dataKeys),
    ];
  }, [cleanedData]);

  // Get actual data keys for sorting
  const sortDataKeys = useMemo(() => {
    if (cleanedData.length === 0)
      return ["domain_name", "discipline_name", "skill_name", "framework_name"];
    const firstRow = cleanedData[0];
    const dataKeys = Object.keys(firstRow);
    return [
      findDataKey("domain_name", dataKeys),
      findDataKey("discipline_name", dataKeys),
      findDataKey("skill_name", dataKeys),
      findDataKey("framework_name", dataKeys),
    ];
  }, [cleanedData]);

  // Sorting order (Domain → Discipline → Skill Area → Framework)
  const sortByCategory = (a, b) => {
    for (let field of sortDataKeys) {
      const valA = (a[field] || "").toString().toLowerCase();
      const valB = (b[field] || "").toString().toLowerCase();
      if (valA < valB) return -1;
      if (valA > valB) return 1;
    }
    return 0;
  };

  useEffect(() => {
    if (searchTerm) {
      setFilters({});
    }
  }, [searchTerm]);


  const processedData = useMemo(() => {
    // Local filtering logic
    let enriched = cleanedData.map((row) => {
      const selected = selectedRadios[row.skillhierarchy_id] || {};
      return {
        ...row,
        selectedLevel: selected.Level || null,
        RejectReason: selected.RejectReason || null,
        Status: selected.Status || null,
      };
    });

    // ✅ Always include selected skills
    const selected = enriched.filter((row) => row.selectedLevel);

    // ✅ Apply filters (only if NOT searching)
    let filtered = [];
    const hasActiveFilters = Object.values(filters).some(
      (vals) => vals && vals.length > 0
    );

    if (!searchTerm && hasActiveFilters) {
      filtered = enriched.filter((row) => {
        return Object.entries(filters).every(([header, selectedVals]) => {
          if (!selectedVals || selectedVals.length === 0) return true;
          const dataKey = getDataKey(header);
          return selectedVals.includes(row[dataKey]);
        });
      });
    }

    // ✅ Apply local search (only if not using global search)
    let searched = [];
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      searched = enriched.filter((row) => {
        const fields = searchDataKeys
          .map((key) => row[key])
          .map((f) => (f ? f.toString().toLowerCase() : ""))
          .join(" ");
        return fields.includes(searchLower);
      });
    }

    // ✅ Decide what to include
    let rest = [];
    if (searchTerm) {
      rest = searched; // 🚫 skip filters completely during search
    } else if (hasActiveFilters) {
      rest = filtered;
    } else {
      // ❌ No search & no filters → nothing
      rest = [];
    }

    // ✅ Combine: always include selected, then sort everything together
    // (not selected-first) so a row keeps its category position when you
    // select/deselect it — sorting selected rows to the front made the row
    // you just clicked jump to the top of the list on every toggle.
    const combined = [...selected, ...rest].filter(
      (row, index, self) =>
        index === self.findIndex((r) => r.skillhierarchy_id === row.skillhierarchy_id)
    );

    let finalData = combined.sort(sortByCategory);

    // ✅ Filter to show only unselected skills if toggle is active
    if (showUnselectedOnly) {
      finalData = finalData.filter((row) => !row.selectedLevel);
    }

    return finalData;
  }, [
    cleanedData,
    selectedRadios,
    searchTerm,
    filters,
    sortDataKeys,
    searchDataKeys,
    getDataKey,
    showUnselectedOnly,
  ]);

  // Pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = processedData.slice(
    startIndex,
    startIndex + itemsPerPage
  );
  const totalPages = Math.max(
    1,
    Math.ceil(processedData.length / itemsPerPage)
  );

  // Build nested map once using actual data keys
  const categoryMap = useMemo(() => {
    const map = {};
    if (cleanedData.length === 0) return map;

    cleanedData.forEach((row) => {
      const domain = row.domain_name || "Other";
      const discipline = row.discipline_name || "Other";
      const skill = row.skill_name || "Other";
      const framework = row.framework_name || "Other";

      if (!map[domain]) map[domain] = {};
      if (!map[domain][discipline]) map[domain][discipline] = {};
      if (!map[domain][discipline][skill]) map[domain][discipline][skill] = [];
      if (!map[domain][discipline][skill].includes(framework)) {
        map[domain][discipline][skill].push(framework);
      }
    });
    return map;
  }, [cleanedData]);

  // Modified getUniqueValues: context aware
  const getUniqueValues = (header) => {
    if (header === "domain_name") {
      return Object.keys(categoryMap);
    }

    if (header === "discipline_name") {
      // Get selected domains from filter
      const selectedDomains = filters["domain_name"]?.length
        ? filters["domain_name"]
        : Object.keys(categoryMap);

      const disciplines = new Set();
      selectedDomains.forEach((domain) => {
        Object.keys(categoryMap[domain] || {}).forEach((disc) => disciplines.add(disc));
      });
      return Array.from(disciplines).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );
    }

    if (header === "skill_name") {
      const selectedDomains = filters["domain_name"]?.length
        ? filters["domain_name"]
        : Object.keys(categoryMap);

      const selectedDisciplines = filters["discipline_name"]?.length
        ? filters["discipline_name"]
        : [];

      const skills = new Set();
      selectedDomains.forEach((domain) => {
        Object.keys(categoryMap[domain] || {}).forEach((disc) => {
          if (!selectedDisciplines.length || selectedDisciplines.includes(disc)) {
            Object.keys(categoryMap[domain][disc] || {}).forEach((skill) =>
              skills.add(skill)
            );
          }
        });
      });
      return Array.from(skills).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );
    }

    if (header === "framework_name") {
      const selectedDomains = filters["domain_name"]?.length
        ? filters["domain_name"]
        : Object.keys(categoryMap);

      const selectedDisciplines = filters["discipline_name"]?.length
        ? filters["discipline_name"]
        : [];

      const selectedSkills = filters["skill_name"]?.length
        ? filters["skill_name"]
        : [];

      const frameworks = new Set();
      selectedDomains.forEach((domain) => {
        Object.keys(categoryMap[domain] || {}).forEach((disc) => {
          if (!selectedDisciplines.length || selectedDisciplines.includes(disc)) {
            Object.keys(categoryMap[domain][disc] || {}).forEach((skill) => {
              if (!selectedSkills.length || selectedSkills.includes(skill)) {
                (categoryMap[domain][disc][skill] || []).forEach((framework) =>
                  frameworks.add(framework)
                );
              }
            });
          }
        });
      });
      return Array.from(frameworks).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );
    }

    // fallback
    const values = cleanedData
      .map((row) => row[header])
      .filter(Boolean);
    return [...new Set(values)].sort((a, b) =>
      a.toString().toLowerCase().localeCompare(b.toString().toLowerCase())
    );
  };

  const isRadioHeader = (header) => ["L1", "L2", "L3"].includes(header);

  // Replaces the whole selected-values array for one column filter (called
  // by InlineMultiSelectFilter's onChange, which always hands back the
  // complete new selection — add/remove/select-all/clear are all handled
  // inside that component, not here). Domain → Discipline → Skill Area →
  // Framework form a hierarchy, so changing a filter higher up clears
  // whatever was picked in the columns below it — otherwise a stale
  // Discipline/Skill/Framework selection from a Domain that's no longer
  // selected would silently keep filtering the table.
  const setFilterValues = (header, values) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [header]: values };

      // Clear dependent filters when parent filter changes
      if (header === "domain_name") {
        // Clear discipline_name, skill_name, and framework_name filters
        newFilters["discipline_name"] = [];
        newFilters["skill_name"] = [];
        newFilters["framework_name"] = [];
      } else if (header === "discipline_name") {
        // Clear skill_name and framework_name filters
        newFilters["skill_name"] = [];
        newFilters["framework_name"] = [];
      } else if (header === "skill_name") {
        // Clear framework_name filter
        newFilters["framework_name"] = [];
      }

      return newFilters;
    });

    setCurrentPage(1);
  };

  const getIconColor = (row) => {
    if (!selectedRadios[row.skillhierarchy_id]) return "text-transparent"; // no icon

    const selected = selectedRadios[row.skillhierarchy_id];
    const preselected = preselectedSkills?.[row.skillhierarchy_id];
    const level = selected.Level;
    
    // Check if this is a completely new selection (not in preselectedSkills at all)
    const isNewSelection = !preselected;
    
    // Check if the level has changed from what was saved
    const levelChanged = preselected && preselected.Level !== selected.Level;
    
    // If it's a new selection or level changed, it's unsaved → grey
    if (isNewSelection || levelChanged) {
      return "text-gray-400 dark:text-gray-500";
    }
    
    // If saved (exists in preselectedSkills and level matches), determine color by approval status
    const status = selected.Status || (preselected && preselected.Status);

    // "Pre-Approved" is a real backend status (saveEmployeeSkill_v2), not a
    // typo or a duplicate of "Approved": Basic/Intermediate picks are
    // auto-approved and saved with this status, while only Expert (L3)
    // picks go through the manual review flow and end up "Pending" then
    // "Approved"/"Rejected". Without this check, every Pre-Approved skill
    // fell through to the same gray used for brand-new/unsaved picks,
    // making a genuinely-saved skill look indistinguishable from one that
    // was never saved at all.
    if (status === "Approved" || status === "Pre-Approved") {
      return "text-green-500 dark:text-green-400";
    }
    if (status === "Pending") {
      return "text-yellow-500 dark:text-yellow-400";
    }
    
    // Rejected
    if (selected.Status === "Rejected" || (preselected && preselected.Status === "Rejected")) {
      return "text-red-600 dark:text-red-400";
    }
    
    // Default fallback
    return "text-gray-400 dark:text-gray-500";
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 shadow rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header + Reset */}
      <div className="flex flex-col md:flex-row items-center mb-1 gap-2 w-full p-2 pt-1">
        <h2 className="text-lg font-bold md:flex-none text-gray-800 dark:text-slate-100">
          Employee Skills
        </h2>

        {/* Centered search bar */}
        <div className="flex flex-1 justify-center px-2 w-full md:w-auto">
          <div className="relative w-full max-w-lg">
            {/* Search Icon */}
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <FaSearch className="text-blue-500 w-4 h-4" />
            </div>

            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search skill globally..."
              className={`block w-full pl-10 ${searchTerm ? 'pr-20' : 'pr-3'} py-3 text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 
            focus:ring-blue-400 focus:border-blue-400 hover:border-gray-400
            dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-400 dark:focus:ring-blue-400 dark:focus:border-blue-400`}
            />
            
            {/* Right side icons container */}
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-2">
              {/* Clear button */}
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 transition-colors z-10"
                  title="Clear search"
                >
                  <FaTimesCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Buttons aligned right */}
        <div className="grid grid-cols-2 md:flex md:flex-nowrap items-center gap-2 md:flex-none w-full md:w-auto md:justify-end">
          {/* Toggle Button to Hide Selected Skills */}
          <button
            type="button"
            onClick={() => {
              setShowUnselectedOnly(!showUnselectedOnly);
              setCurrentPage(1);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 border font-medium rounded-lg transition shadow-md justify-center text-sm ${
              showUnselectedOnly
                ? "bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 border-blue-600 dark:border-blue-700"
                : "bg-white/20 backdrop-blur-md border-white/30 text-gray-700 hover:bg-white/30 hover:text-gray-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {showUnselectedOnly
              ? "Show selected skills"
              : "Hide selected skills"}
          </button>
          <button
            onClick={() => downloadSkillMatrix()}
            className="flex items-center gap-2 px-2 py-1.5 border font-medium rounded-lg transition shadow-md text-sm
          bg-white/20 backdrop-blur-md border-white/30 text-green-600 hover:bg-white/30 hover:text-green-700
          dark:bg-slate-800 dark:border-slate-600 dark:text-green-400 dark:hover:bg-slate-700 dark:hover:text-green-300 justify-center"
          >
            <FaDownload className="w-4 h-4" />
            Skill Matrix
          </button>
          {/* <button
            onClick={() =>
              saveEmployeeSkills(employeeInfo, processedData, selectedRadios)
            }
            disabled={isSaving}
            className={`flex items-center gap-2 px-2 py-1 border font-medium rounded-lg transition shadow-md w-full md:w-auto justify-center ${
              isSaving
                ? "bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
                : "bg-white/20 backdrop-blur-md border-white/30 text-blue-600 hover:bg-white/30 hover:text-blue-700 dark:bg-slate-800 dark:border-slate-600 dark:text-blue-400 dark:hover:bg-slate-700 dark:hover:text-blue-300"
            }`}
          >
            <FaSave className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save"}
          </button> */}
          <button
            onClick={handleSaveClick}
            disabled={isSaving}
            className={`col-span-2 md:col-span-1 flex items-center gap-2 px-2 py-1.5 border font-medium rounded-lg transition shadow-md justify-center text-sm ${
              isSaving
                ? "bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
                : "bg-white/20 backdrop-blur-md border-white/30 text-blue-600 hover:bg-white/30 hover:text-blue-700 dark:bg-slate-800 dark:border-slate-600 dark:text-blue-400 dark:hover:bg-slate-700 dark:hover:text-blue-300"
            }`}
          >
            <FaSave className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Data table */}
      <div ref={tableRef} className="flex-1 h-[370px] overflow-auto relative [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-slate-400 dark:[&::-webkit-scrollbar-thumb:hover]:bg-slate-500">
        <table className="w-full min-w-[700px] border border-gray-200 dark:border-slate-700 rounded-lg table-fixed">
          <thead className="bg-gray-100 dark:bg-slate-800 sticky top-0 z-10">
            <tr>
              {fixedHeaderOrder.map((header) => {
                const showFilterIcon = [
                  "domain_name",
                  "discipline_name",
                  "skill_name",
                  "framework_name",
                ].includes(header);

                return (
                  <th
                    key={header}
                    className={`relative px-2 py-2 text-center text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-200 h-10 sm:h-12 ${
                      columnWidths[header] || "w-auto"
                    }`}
                  >
                    {/* Center header and filter icon */}
                    <div className="flex justify-center items-center gap-1">
                      <span>{getHeaderName(header)}</span>
                      {showFilterIcon &&
                        (() => {
                          const selectedVals = filters[header] || [];
                          const uniqueVals = getUniqueValues(header);
                          const allSelected =
                            selectedVals.length === uniqueVals.length &&
                            uniqueVals.length > 0;
                          const hasActiveFilter =
                            selectedVals.length > 0 && !allSelected;
                          const isDropdownOpen = activeFilterHeader === header;

                          let iconColor = "text-gray-400 dark:text-slate-400"; // default gray
                          if (isDropdownOpen) {
                            iconColor = "text-blue-500"; // blue when dropdown is open
                          } else if (hasActiveFilter) {
                            iconColor = "text-green-500 dark:text-green-400"; // green when filter is active (not all selected)
                          }
                          // If allSelected, keep it gray (same as no filter)

                          return (
                            // renderTrigger swaps out InlineMultiSelectFilter's
                            // own default "select-box with chevron" look for
                            // just the small funnel icon this table already
                            // used — the dropdown panel/search/checkboxes
                            // underneath are unchanged, only the closed-state
                            // trigger is custom. onOpenChange mirrors the
                            // dropdown's open/closed state back into
                            // activeFilterHeader purely so the icon can turn
                            // blue while its own panel is open; the component
                            // manages the actual open/close state internally.
                            <InlineMultiSelectFilter
                              label={getHeaderName(header)}
                              allLabel={`All ${getHeaderName(header)}`}
                              options={uniqueVals}
                              selected={selectedVals}
                              onChange={(values) => setFilterValues(header, values)}
                              onOpenChange={(isOpen) => setActiveFilterHeader(isOpen ? header : null)}
                              renderTrigger={({ triggerProps, selected }) => (
                                <span
                                  {...triggerProps}
                                  title={selected.length ? `${selected.length} selected` : `All ${getHeaderName(header)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerProps.onClick(e);
                                  }}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    triggerProps.onKeyDown(e);
                                  }}
                                  className="relative inline-flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <FaFilter size={12} className={iconColor} />
                                  {selected.length > 0 && (
                                    <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-blue-600 px-1 text-[8px] font-bold text-white shadow-sm ring-1 ring-white dark:ring-slate-800 leading-none">
                                      {selected.length}
                                    </span>
                                  )}
                                </span>
                              )}
                            />
                          );
                        })()}
                    </div>
                  </th>
                );
              })}

              <th className="w-[5%] px-2 py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-200 h-10 sm:h-12 text-center">
                &nbsp;
              </th>
              <th className="w-[8%] px-2 py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-200 h-10 sm:h-12 text-center">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((row) => (
                  <tr
                  key={row.skillhierarchy_id}
                  className="border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 h-10 sm:h-12 align-middle"
                >
                  {fixedHeaderOrder.map((header) => {
                    const dataKey = getDataKey(header);
                    return (
                      <td
                        key={header}
                        className={`px-2 py-1.5 text-xs sm:text-sm text-gray-700 dark:text-slate-200 truncate text-ellipsis align-middle ${
                          columnWidths[header] || "w-auto"
                        }`}
                        title={row[dataKey]}
                      >
                        {isRadioHeader(header) ? (
                          <div className="flex items-center justify-center">
                            <input
                              type="radio"
                              name={`level-radio-${row.skillhierarchy_id}`}
                              value={header}
                              checked={
                                selectedRadios[row.skillhierarchy_id]?.Level === header
                              }
                              onChange={() =>
                                preserveScroll(() => {
                                  setSelectedRadios((prev) => {
                                    const current = prev[row.skillhierarchy_id];
                                    const preselected = preselectedSkills?.[row.skillhierarchy_id];
                                    
                                    // If the new level matches what was saved, preserve Status and RejectReason
                                    const newSelection = { Level: header };
                                    if (preselected && preselected.Level === header) {
                                      newSelection.Status = preselected.Status;
                                      newSelection.RejectReason = preselected.RejectReason;
                                    } else if (current) {
                                      // Preserve existing Status/RejectReason if level changed but they exist
                                      if (current.Status) newSelection.Status = current.Status;
                                      if (current.RejectReason) newSelection.RejectReason = current.RejectReason;
                                    }
                                    
                                    return {
                                      ...prev,
                                      [row.skillhierarchy_id]: newSelection,
                                    };
                                  });
                                })
                              }
                              className="cursor-pointer accent-blue-600 dark:accent-blue-400 focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          row[dataKey]?.slice(0, 25) +
                          (row[dataKey]?.length > 25 ? "..." : "")
                        )}
                      </td>
                    );
                  })}

                  <td className="text-center">
                    <button
                      title="View Level Requirement"
                      onClick={() => {
                        // Try to get level details from row first
                        let levelDetails = {
                          L1: row["L1"] || row["l1"] || null,
                          L2: row["L2"] || row["l2"] || null,
                          L3: row["L3"] || row["l3"] || null,
                        };
                        
                        // If not found in row, try to find in cleanedData using skillhierarchy_id
                        if ((!levelDetails.L1 && !levelDetails.L2 && !levelDetails.L3) && row.skillhierarchy_id) {
                          const originalSkill = cleanedData.find(
                            (skill) => skill.skillhierarchy_id === row.skillhierarchy_id
                          );
                          if (originalSkill) {
                            levelDetails = {
                              L1: originalSkill["L1"] || originalSkill["l1"] || null,
                              L2: originalSkill["L2"] || originalSkill["l2"] || null,
                              L3: originalSkill["L3"] || originalSkill["l3"] || null,
                            };
                          }
                        }
                        
                        // If still not found, try to find in original data prop
                        if ((!levelDetails.L1 && !levelDetails.L2 && !levelDetails.L3) && row.skillhierarchy_id) {
                          const masterSkill = data.find(
                            (skill) => skill.skillhierarchy_id === row.skillhierarchy_id ||
                                      skill.id === row.skillhierarchy_id
                          );
                          if (masterSkill) {
                            levelDetails = {
                              L1: masterSkill["L1"] || masterSkill["l1"] || masterSkill["Basic"] || null,
                              L2: masterSkill["L2"] || masterSkill["l2"] || masterSkill["Intermediate"] || null,
                              L3: masterSkill["L3"] || masterSkill["l3"] || masterSkill["Expert"] || null,
                            };
                          }
                        }
                        
                        setModalLevels({
                          L1: levelDetails.L1 || "-",
                          L2: levelDetails.L2 || "-",
                          L3: levelDetails.L3 || "-",
                        });
                        setOpen(true);
                      }}
                      className="p-2 rounded-full text-blue-500 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-slate-700 transition-colors duration-200"
                    >
                      <FaQuestion className="h-4" />
                    </button>
                  </td>

                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-5">
                      <div className="h-5 w-5 flex items-center justify-center">
                        {selectedRadios[row.skillhierarchy_id] && (
                          <SiTarget
                            className={"h-4 w-4 " + getIconColor(row)}
                            title={
                              selectedRadios[row.skillhierarchy_id]?.Status === "Rejected"
                                ? "Rejection Reason:\n" +
                                  selectedRadios[row.skillhierarchy_id]?.RejectReason
                                : selectedRadios[row.skillhierarchy_id]?.Status ||
                                  "New Skill"
                            }
                          />
                        )}
                      </div>

                      {selectedRadios[row.skillhierarchy_id] ? (
                        <button
                          title="Clear selection"
                          onClick={() =>
                            preserveScroll(() => {
                              setSelectedRadios((prev) => {
                                const updated = { ...prev };
                                delete updated[row.skillhierarchy_id];
                                return updated;
                              });
                            })
                          }
                          className=" rounded-full text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-slate-700 transition-colors duration-200"
                        >
                          <FaTimesCircle className="w-5 h-5 " />
                        </button>
                      ) : (
                        <span> </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr className="h-12">
                <td
                  colSpan={fixedHeaderOrder.length + 2}
                  className="text-center py-6 text-gray-500 dark:text-slate-400"
                >
                  {showUnselectedOnly
                    ? "No unselected skills found. All skills are selected or no skills match your filters."
                    : "Start by Searching the Framework, Domain or Discipline"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LevelDetailModal
        open={open}
        onClose={() => setOpen(false)}
        title="Level Details"
        levels={modalLevels || { L1: "-", L2: "-", L3: "-" }}
      />

      {managerModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-96 p-4 relative">
            <h3 className="text-lg font-semibold mb-3">
              Manager Approval Required
            </h3>
            <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">
              The following newly selected Expert skills require manager
              approval:
            </p>
            <ul className="mb-2 list-disc list-inside text-sm text-gray-700 dark:text-gray-300 max-h-40 overflow-auto">
              {pendingExpertSkills.slice(0, 5).map((row, idx) => (
                <li key={row.skillhierarchy_id}>
                  {row.framework_name}
                  {idx === 4 && pendingExpertSkills.length > 5 && (
                    <span className="ml-1 text-gray-500 dark:text-gray-400 italic">
                      +{pendingExpertSkills.length - 5} more
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <input
              type="email"
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
              placeholder="Manager Email"
              className={`w-full border rounded-lg p-2 text-sm mb-2 dark:bg-gray-700 dark:text-gray-200 ${
                emailError
                  ? "border-red-500 focus:ring-red-500"
                  : "border-gray-300 focus:ring-blue-500 dark:border-gray-600"
              }`}
            />
            {emailError && (
              <p className="text-red-500 text-xs mb-2">{emailError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setManagerModalOpen(false);
                  setEmailError("");
                }}
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!managerEmail || !emailRegex.test(managerEmail)) {
                    setEmailError("Please enter a valid email");
                    return;
                  }
                  setEmailError("");
                  confirmSaveWithManager();
                }}
                className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mt-4">
        <div className="flex items-center gap-2">
          <label
            htmlFor="itemsPerPage"
            className="text-sm text-gray-700 dark:text-slate-200"
          >
            Items per page:
          </label>
          <select
            id="itemsPerPage"
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="border rounded px-2 py-1 text-sm text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600"
          >
            {[5, 10, 20, 50, 100].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            className="px-3 py-1 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-gray-700 dark:text-slate-200">
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            className="px-3 py-1 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkillDataTable;
