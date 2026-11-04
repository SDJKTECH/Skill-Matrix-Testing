import React, { useState, useMemo, useEffect, useRef } from "react";
import { FaSearch, FaSave, FaDownload, FaFilter } from "react-icons/fa";
import { useCertificates } from "../context/CertificateContext";
import { getHeaderName } from "../helper/utility";
// Shared multi-select filter dropdown (search-within-options, checkboxes,
// Clear/Apply) — originally built for the Training Batches table, reused
// here (and in skillDataTable.jsx) so certificate filtering behaves the
// same way as everywhere else instead of a one-off dropdown per table.
import InlineMultiSelectFilter from "../features/training/shared/components/filters/MultiSelectFilter";

const CertDataTable = ({
  data,
  header,
  employeeInfo,
  preselectedCertificates,
}) => {
  const visibleHeaders = [
    "certProvider",
    "certName",
    "certLevel",
    "validYears",
  ];
  const { saveEmployeeCertificates, downloadCertificateMatrix, isSaving } =
    useCertificates();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedRows, setSelectedRows] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({});
  const [activeFilterHeader, setActiveFilterHeader] = useState(null);
  // Default to false = "All" selected (show all certificates)
  const [showUnselectedOnly, setShowUnselectedOnly] = useState(false);

  // 🟢 useRef for scroll preservation
  const tableContainerRef = useRef(null);

  // Restore scroll after changes
  const preserveScroll = (callback) => {
    const container = tableContainerRef.current;
    const scrollTop = container ? container.scrollTop : 0;

    callback();

    requestAnimationFrame(() => {
      if (container) container.scrollTop = scrollTop;
    });
  };

  // Preselect certificates
  useEffect(() => {
    if (
      preselectedCertificates &&
      typeof preselectedCertificates === "object"
    ) {
      setSelectedRows((prev) => {
        // Convert keys to numbers to match mappingId type
        const preselectedIds = Object.keys(preselectedCertificates).map(id => 
          Number(id) || id
        );
        const uniqueIds = Array.from(new Set([...prev, ...preselectedIds]));
        return uniqueIds;
      });
    }
  }, [preselectedCertificates]);

  // Toggle selection with scroll preservation
  const toggleSelect = (mappingId) => {
    preserveScroll(() => {
      setSelectedRows((prev) =>
        prev.includes(mappingId)
          ? prev.filter((id) => id !== mappingId)
          : [...prev, mappingId]
      );
    });
  };

  // Filter logic with hierarchical support
  const getUniqueValues = (headerKey) => {
    // Get filtered data based on parent filters
    let filteredData = data;

    // Apply parent filters in hierarchical order
    if (headerKey !== "certProvider") {
      const providerFilter = filters["certProvider"];
      if (providerFilter && providerFilter.length > 0) {
        filteredData = filteredData.filter((row) =>
          providerFilter.includes(row["certProvider"])
        );
      }
    }

    if (headerKey === "certLevel" || headerKey === "validYears") {
      const nameFilter = filters["certName"];
      if (nameFilter && nameFilter.length > 0) {
        filteredData = filteredData.filter((row) =>
          nameFilter.includes(row["certName"])
        );
      }
    }

    if (headerKey === "validYears") {
      const levelFilter = filters["certLevel"];
      if (levelFilter && levelFilter.length > 0) {
        filteredData = filteredData.filter((row) =>
          levelFilter.includes(row["certLevel"])
        );
      }
    }

    const vals = filteredData
      .map((row) => row[headerKey])
      .filter((v) => v !== undefined && v !== null && v !== "");
    return Array.from(new Set(vals)).sort();
  };

  // Replaces the whole selected-values array for one column filter (called
  // by InlineMultiSelectFilter's onChange, which always hands back the
  // complete new selection). Cert Provider → Cert Name → Cert Level → Valid
  // Years form a hierarchy, so changing a filter higher up clears whatever
  // was picked in the columns below it, same reasoning as skillDataTable.jsx.
  const setFilterValues = (headerKey, values) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [headerKey]: values };

      // Clear dependent filters when parent filter changes
      if (headerKey === "certProvider") {
        // Clear certName, certLevel, and validYears filters
        newFilters["certName"] = [];
        newFilters["certLevel"] = [];
        newFilters["validYears"] = [];
      } else if (headerKey === "certName") {
        // Clear certLevel and validYears filters
        newFilters["certLevel"] = [];
        newFilters["validYears"] = [];
      } else if (headerKey === "certLevel") {
        // Clear validYears filter
        newFilters["validYears"] = [];
      }

      return newFilters;
    });
    setCurrentPage(1);
  };

  useEffect(() => {
    if (searchTerm.trim()) setFilters({});
  }, [searchTerm]);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const isAOther =
        a.certProvider?.toLowerCase() === "other" &&
        a.certName?.toLowerCase() === "other" &&
        (!a.certLevel || a.certLevel?.toLowerCase() === "other");
      const isBOther =
        b.certProvider?.toLowerCase() === "other" &&
        b.certName?.toLowerCase() === "other" &&
        (!b.certLevel || b.certLevel?.toLowerCase() === "other");
      if (isAOther && !isBOther) return 1;
      if (!isAOther && isBOther) return -1;
      if (a.certProvider?.toLowerCase() !== b.certProvider?.toLowerCase())
        return a.certProvider?.toLowerCase() < b.certProvider?.toLowerCase()
          ? -1
          : 1;
      if (a.certName?.toLowerCase() !== b.certName?.toLowerCase())
        return a.certName?.toLowerCase() < b.certName?.toLowerCase() ? -1 : 1;
      if (a.certLevel && b.certLevel)
        return a.certLevel?.toLowerCase() < b.certLevel?.toLowerCase() ? -1 : 1;
      return 0;
    });
  }, [data]);

  const filteredData = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();
    const selectedRowsData = sortedData.filter(
      (row) => selectedRows.includes(row.mappingId) || row.selected === 1
    );

    const hasFilters = Object.values(filters).some(
      (vals) => vals && vals.length > 0
    );

    let filterMatchedRows = [];
    if (!lowerSearch && hasFilters) {
      filterMatchedRows = sortedData.filter((row) =>
        Object.entries(filters).every(
          ([key, selectedVals]) =>
            !selectedVals ||
            selectedVals.length === 0 ||
            selectedVals.includes(row[key])
        )
      );
    }

    let searchMatchedRows = [];
    if (lowerSearch) {
      searchMatchedRows = sortedData.filter((row) =>
        visibleHeaders.some((header) =>
          String(row[header] || "")
            .toLowerCase()
            .includes(lowerSearch)
        )
      );
    }

    // Step 4️⃣ - Decide which rows to include
    let finalRows = [];

    if (lowerSearch) {
      // 🚫 Ignore filters when searching
      finalRows = [...selectedRowsData, ...searchMatchedRows];
    } else if (hasFilters) {
      finalRows = [...selectedRowsData, ...filterMatchedRows];
    } else {
      finalRows = [...selectedRowsData];
    }

    // Step 5️⃣ - Remove duplicates (by mappingId), then restore sortedData's
    // natural order — finalRows puts already-selected rows first, which
    // would otherwise make a row jump to the top of the list the moment its
    // checkbox is checked (selectedRowsData always leads the concatenation).
    const uniqueRows = [
      ...new Map(finalRows.map((r) => [r.mappingId, r])).values(),
    ];
    const naturalOrder = new Map(sortedData.map((r, i) => [r.mappingId, i]));
    uniqueRows.sort((a, b) => naturalOrder.get(a.mappingId) - naturalOrder.get(b.mappingId));

    // ✅ Filter to show only unselected certificates if toggle is active
    if (showUnselectedOnly) {
      return uniqueRows.filter(
        (row) => !selectedRows.includes(row.mappingId) && row.selected !== 1
      );
    }

    return uniqueRows;
  }, [filters, searchTerm, sortedData, selectedRows, showUnselectedOnly]);

  // Reads from `data` (the full, unfiltered certificate list from props),
  // never from `filteredData`/`paginatedData` (what's currently rendered).
  // Those shrink to nothing when "Hide selected certificates" is on, or to
  // a search/filter subset otherwise — building the save payload from
  // either would silently drop already-selected certificates whenever the
  // display happens to be filtered (see the equivalent, previously-buggy
  // save path in skillDataTable.jsx's handleSaveClick for what goes wrong
  // if this ever gets "simplified" to use the filtered array instead).
  const handleSaveClick = async () => {
    const selectedCertificates = data.filter((row) =>
      selectedRows.includes(row.mappingId)
    );

    try {
      await saveEmployeeCertificates(employeeInfo, selectedCertificates);
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(
    startIndex,
    startIndex + itemsPerPage
  );
  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));

  return (
    <div className="flex flex-col h-full p-2 bg-white dark:bg-gray-900 shadow rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header + Search + Actions */}
      <div className="flex flex-col md:flex-row items-center mb-4 gap-2 w-full">
        <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">
          Employee Certificates
        </h2>
        <div className="flex flex-1 justify-center px-2">
          <div className="relative w-full max-w-lg">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <FaSearch className="text-blue-500 w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search certificate..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="block w-full pl-10 pr-3 py-3 text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 
                focus:ring-blue-400 focus:border-blue-400 hover:border-gray-400
                dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-400 dark:focus:ring-blue-400 dark:focus:border-blue-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 justify-center md:justify-end w-full md:w-auto">
          {/* Toggle Button to Hide Selected Certificates */}
          <button
            type="button"
            onClick={() => {
              setShowUnselectedOnly(!showUnselectedOnly);
              setCurrentPage(1); // Reset to first page when toggling
            }}
            className={`flex items-center gap-2 px-3 py-1.5 border font-medium rounded-lg transition shadow-md ${
              showUnselectedOnly
                ? "bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 border-blue-600 dark:border-blue-700"
                : "bg-white/20 backdrop-blur-md border-white/30 text-gray-700 hover:bg-white/30 hover:text-gray-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {showUnselectedOnly
              ? "Show selected certificates"
              : "Hide selected certificates"}
          </button>

          {/* Download Certificate List */}
          <button
            onClick={downloadCertificateMatrix}
            className="flex items-center gap-2 px-2 py-1 border font-medium rounded-lg transition shadow-md 
      bg-white/20 backdrop-blur-md border-white/30 text-green-600 
      hover:bg-white/30 hover:text-green-700 
      dark:bg-slate-800 dark:border-slate-600 dark:text-green-400 
      dark:hover:bg-slate-700 dark:hover:text-green-300"
          >
            <FaDownload className="w-4 h-4" />
            Certificate List
          </button>
          <button
            onClick={handleSaveClick}
            disabled={isSaving}
            className={`flex items-center gap-2 px-2 py-1 border font-medium rounded-lg transition shadow-md ${
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

      {/* Data Table */}
      <div ref={tableContainerRef} className="flex-1 h-[370px] overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-slate-400 dark:[&::-webkit-scrollbar-thumb:hover]:bg-slate-500">
        <table className="w-full min-w-[600px] border border-gray-200 dark:border-slate-700 rounded-lg table-fixed">
          <thead className="bg-gray-100 dark:bg-slate-800 sticky top-0 z-10">
            <tr>
              {visibleHeaders.map((headerKey) => (
                <th
                  key={headerKey}
                  className="relative px-4 py-2 text-center text-sm font-medium text-gray-700 dark:text-slate-200 h-12"
                >
                  <div className="flex justify-center items-center gap-1">
                    <span>{getHeaderName(headerKey)}</span>
                    {(() => {
                      const selectedVals = filters[headerKey] || [];
                      const uniqueVals = getUniqueValues(headerKey);
                      const allSelected =
                        selectedVals.length === uniqueVals.length &&
                        uniqueVals.length > 0;
                      const hasActiveFilter =
                        selectedVals.length > 0 && !allSelected;
                      const isDropdownOpen = activeFilterHeader === headerKey;

                      let iconColor = "text-gray-400 dark:text-slate-400"; // default gray
                      if (isDropdownOpen) {
                        iconColor = "text-blue-500"; // blue when dropdown is open
                      } else if (hasActiveFilter) {
                        iconColor = "text-green-500 dark:text-green-400"; // green when filter is active (not all selected)
                      }
                      // If allSelected, keep it gray (same as no filter)

                      return (
                        // renderTrigger swaps InlineMultiSelectFilter's own
                        // default "select-box with chevron" trigger for just
                        // the small funnel icon this table already used —
                        // see the identical pattern in skillDataTable.jsx for
                        // the full explanation of renderTrigger/onOpenChange.
                        <InlineMultiSelectFilter
                          label={getHeaderName(headerKey)}
                          allLabel={`All ${getHeaderName(headerKey)}`}
                          options={uniqueVals}
                          selected={selectedVals}
                          onChange={(values) => setFilterValues(headerKey, values)}
                          onOpenChange={(isOpen) => setActiveFilterHeader(isOpen ? headerKey : null)}
                          renderTrigger={({ triggerProps, selected }) => (
                            <span
                              {...triggerProps}
                              title={selected.length ? `${selected.length} selected` : `All ${getHeaderName(headerKey)}`}
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
              ))}

              <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 dark:text-slate-200 h-12 w-[5%]">
                Select
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedData.length === 0 ? (
              <tr className="h-12">
                <td
                  colSpan={5}
                  className="text-center py-6 text-gray-500 dark:text-slate-400 italic"
                >
                  {showUnselectedOnly
                    ? "No unselected certificates found. All certificates are selected or no certificates match your filters."
                    : "Search to start adding certificates"}
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => (
                <tr
                  key={row.mappingId}
                  className="border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 h-12 align-middle"
                >
                  <td
                    className="px-4 py-2 text-gray-700 dark:text-slate-200 truncate text-ellipsis align-middle"
                    title={row.certProvider}
                  >
                    {row.certProvider || "-"}
                  </td>
                  <td
                    className="px-4 py-2 text-gray-700 dark:text-slate-200 truncate text-ellipsis align-middle"
                    title={row.certName}
                  >
                    {row.certName || "-"}
                  </td>
                  <td className="px-4 py-2 text-gray-700 dark:text-slate-200 align-middle">
                    {row.certLevel || "-"}
                  </td>
                  <td className="px-4 py-2 text-gray-700 dark:text-slate-200 align-middle">
                    {row.validYears || "-"}
                  </td>
                  <td className="px-4 py-2 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(row.mappingId)}
                      onChange={() => toggleSelect(row.mappingId)}
                      className="w-4 h-4 cursor-pointer accent-blue-600 dark:accent-blue-400 focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[99999]">
          {" "}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg max-w-md w-full">
            {" "}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {" "}
              Add Certificate{" "}
            </h3>{" "}
            {/* Form fields retained for future use */}{" "}
          </div>{" "}
        </div>
      )}
    </div>
  );
};

export default CertDataTable;
