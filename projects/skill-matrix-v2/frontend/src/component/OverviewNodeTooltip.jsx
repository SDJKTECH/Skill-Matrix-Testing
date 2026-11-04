export default function OverviewNodeTooltip({
  node,
  position,
  theme,
  TRAINING_FIELD_ORDER,
  NODE_COLORS,
}) {
  if (!node) return null;

  const commentValue = (value) => {
    const v = value === null || value === undefined ? "" : String(value).trim();
    return v ? v : "—";
  };

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{
        left: position.x + 16,
        top: position.y - 70,
        background: theme.canvasBg,
        color: theme.text,
        border: `1px solid ${theme.link}`,
        minWidth: 200,
        maxWidth: 360,
      }}
    >
      <div
        className="font-semibold mb-2"
        style={{ color: NODE_COLORS[node.label] }}
      >
        {node.name}
      </div>

      <div className="space-y-1" style={{ color: theme.subtleText }}>
        {node.label === "Training" ? (
          <>
            {TRAINING_FIELD_ORDER.filter(
              (key) =>
                ![
                  "comment",
                  "employee_comment",
                  "department_comment",
                  "manager_comment",
                ].includes(key) && node[key] !== undefined && node[key] !== null
            ).map((key) => (
              <div key={key} className="flex gap-1">
                <span className="font-medium capitalize">
                  {key.replace(/_/g, " ")}:
                </span>
                <span className="truncate">
                  {node[key] === null || node[key] === undefined
                    ? ""
                    : String(node[key])}
                </span>
              </div>
            ))}

            <div
              className="mt-2 pt-2 border-t space-y-1"
              style={{ borderColor: theme.link }}
            >
              <div className="font-medium" style={{ color: theme.text }}>
                Comments
              </div>
              <div className="space-y-1">
                <div>
                  <div className="font-medium">Employee:</div>
                  <div className="whitespace-pre-wrap break-words">
                    {commentValue(node.employee_comment)}
                  </div>
                </div>
                <div>
                  <div className="font-medium">Manager:</div>
                  <div className="whitespace-pre-wrap break-words">
                    {commentValue(node.manager_comment)}
                  </div>
                </div>
                <div>
                  <div className="font-medium">Department:</div>
                  <div className="whitespace-pre-wrap break-words">
                    {commentValue(node.department_comment)}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : node.label === "Employee" || node.label === "Manager" ? (
          <>
            {node.email && (
              <div className="flex gap-1">
                <span className="font-medium">Email:</span>
                <span className="truncate">{node.email}</span>
              </div>
            )}
            {(node.skillCount > 0 || node.certCount > 0 || node.trainingCount > 0) && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: theme.link }}>
                <div className="font-medium mb-1">Summary:</div>
                {(node.skillCategoryCount > 0 || node.skillSubcategoryCount > 0 ||
                  node.skillSubSubcategoryCount > 0 || node.skillToolCount > 0) && (
                  <div className="mb-2 space-y-0.5">
                    <div className="text-xs font-semibold" style={{ color: "#3b82f6" }}>Skills Breakdown:</div>
                    {node.skillCategoryCount > 0 && (
                      <div className="flex gap-1 text-xs pl-2">
                        <span className="font-medium">Categories:</span>
                        <span>{node.skillCategoryCount}</span>
                      </div>
                    )}
                    {node.skillSubcategoryCount > 0 && (
                      <div className="flex gap-1 text-xs pl-2">
                        <span className="font-medium">Subcategories:</span>
                        <span>{node.skillSubcategoryCount}</span>
                      </div>
                    )}
                    {node.skillSubSubcategoryCount > 0 && (
                      <div className="flex gap-1 text-xs pl-2">
                        <span className="font-medium">Sub-Subcategories:</span>
                        <span>{node.skillSubSubcategoryCount}</span>
                      </div>
                    )}
                    {node.skillToolCount > 0 && (
                      <div className="flex gap-1 text-xs pl-2">
                        <span className="font-medium">Tools:</span>
                        <span>{node.skillToolCount}</span>
                      </div>
                    )}
                    {node.skillCount > 0 && (
                      <div className="flex gap-1 text-xs pl-2 pt-0.5 border-t" style={{ borderColor: theme.link }}>
                        <span className="font-semibold">Total Skills:</span>
                        <span className="font-semibold">{node.skillCount}</span>
                      </div>
                    )}
                  </div>
                )}
                {node.certCount > 0 && (
                  <div className="flex gap-1 text-xs">
                    <span className="font-medium" style={{ color: "#f59e0b" }}>Certifications:</span>
                    <span>{node.certCount}</span>
                  </div>
                )}
                {node.trainingCount > 0 && (
                  <div className="flex gap-1 text-xs">
                    <span className="font-medium" style={{ color: "#22c55e" }}>Trainings:</span>
                    <span>{node.trainingCount}</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : node.label === "Certification" ? (
          <>
            {node.certProvider && (
              <div className="flex gap-1">
                <span className="font-medium">Provider:</span>
                <span className="truncate">{node.certProvider}</span>
              </div>
            )}
            {node.certLevel && (
              <div className="flex gap-1">
                <span className="font-medium">Level:</span>
                <span className="truncate">{node.certLevel}</span>
              </div>
            )}
            {node.approvalStatus && (
              <div className="flex gap-1">
                <span className="font-medium">Status:</span>
                <span className="truncate">{node.approvalStatus}</span>
              </div>
            )}
            {node.validYears && (
              <div className="flex gap-1">
                <span className="font-medium">Valid Years:</span>
                <span className="truncate">{node.validYears}</span>
              </div>
            )}
          </>
        ) : (
          Object.entries(node)
            .filter(
              ([key, value]) =>
                !["children", "x", "y", "skillCount", "skillCategoryCount", "skillSubcategoryCount",
                  "skillSubSubcategoryCount", "skillToolCount", "certCount", "trainingCount"].includes(key) &&
                  key !== "id" &&
                  key !== "_key" &&
                  value !== undefined &&
                  value !== null
            )
            .map(([key, value]) => (
              <div key={key} className="flex gap-1">
                <span className="font-medium capitalize">
                  {key.replace(/_/g, " ")}:
                </span>
                <span className="truncate">
                  {Array.isArray(value)
                    ? `${value.length} items`
                    : typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </span>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
