import React from "react";
// (1) THÊM: Import 'Spinner'
import { Button, SimpleCard, Typography, Spinner } from "@humansignal/ui";
// import './ToolList.scss';

/**
 * Hiển thị danh sách các Tools.
 * ... (props cũ)
 * @param {function} onRunTool - Hàm gọi khi nhấn nút "Run Tool"
 * @param {object} runningTools - Object chứa ID của các tool đang chạy (ví dụ: {42: true})
 */
export const ToolList = ({
  tools,
  onEdit,
  onDelete,
  onRunTool,
  activeToolId,
  runningTools = {},
  onToolClick, // New prop for clicking on the card
}) => {
  return (
    <div
      className="tool-list"
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {tools.map((tool) => {
        const isActive = tool.id === activeToolId;
        const isRunning = !!runningTools[tool.id];

        return (
          <SimpleCard
            key={tool.id}
            className="bg-primary-background border-primary-border-subtler p-base tool-card"
            onClick={() => onToolClick && onToolClick(tool)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              border: isActive
                ? "2px solid var(--color-primary-border, #007bff)"
                : "1px solid var(--color-neutral-border, #dee2e6)",
              borderRadius: "8px",
              padding: "1.25rem",
              transition: "all 0.2s ease",
              opacity: isRunning ? 0.7 : 1,
              backgroundColor: isActive
                ? "var(--color-primary-background-subtle, #f0f7ff)"
                : "var(--color-neutral-background, #ffffff)",
              cursor: "pointer",
            }}
          >
            {/* Phần thông tin (Tên và Endpoint) */}
            <div style={{ flex: 1, marginRight: "1rem" }}>
              <Typography
                variant="body"
                size="medium"
                weight="medium"
                style={{
                  marginBottom: "0.5rem",
                  color: "var(--color-neutral-content, #212529)",
                  fontSize: "16px",
                }}
              >
                {tool.name || "Untitled Tool"}
                {isActive && (
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "12px",
                      color: "var(--color-primary-content, #007bff)",
                      fontWeight: "normal",
                    }}
                  >
                    (Active)
                  </span>
                )}
              </Typography>
              <Typography
                variant="body"
                size="small"
                className="text-neutral-content-subtler"
                style={{
                  wordBreak: "break-all",
                  fontSize: "13px",
                  color: "var(--color-neutral-content-subtle, #6c757d)",
                }}
              >
                🔗 {tool.endpoint || "No endpoint URL"}
              </Typography>
            </div>

            {/* Phần nút (Edit, Delete, và Run) */}
            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
              {/* (4) RENDER CÓ ĐIỀU KIỆN (Nút Run hoặc Spinner) */}
              {isRunning ? (
                // (a) Nếu đang chạy: Hiển thị Spinner
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "90px",
                    height: "36px",
                  }}
                >
                  <Spinner size="small" />
                </div>
              ) : (
                // (b) Nếu không chạy: Hiển thị nút "Run Tool"
                <Button
                  size="small"
                  look="filled"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRunTool(tool);
                  }}
                  aria-label={`Run ${tool.name}`}
                  style={{
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1rem",
                    borderRadius: "6px",
                    fontWeight: "500",
                    fontSize: "14px",
                    transition: "all 0.2s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#2563eb";
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(59, 130, 246, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#3b82f6";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  Run Tool
                </Button>
              )}

              <Button
                size="small"
                onClick={() => onEdit(tool)}
                aria-label={`Edit ${tool.name}`}
                disabled={isRunning}
                style={{
                  backgroundColor: "white",
                  color: "#64748b",
                  border: "1px solid #e2e8f0",
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  fontWeight: "500",
                  fontSize: "14px",
                  transition: "all 0.2s ease",
                  cursor: isRunning ? "not-allowed" : "pointer",
                  opacity: isRunning ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isRunning) {
                    e.currentTarget.style.backgroundColor = "#f8fafc";
                    e.currentTarget.style.borderColor = "#cbd5e1";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isRunning) {
                    e.currentTarget.style.backgroundColor = "white";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                  }
                }}
              >
                Edit
              </Button>
              <Button
                size="small"
                look="danger"
                onClick={() => onDelete(tool)}
                aria-label={`Delete ${tool.name}`}
                disabled={isRunning}
                style={{
                  backgroundColor: "white",
                  color: "#ef4444",
                  border: "1px solid #fecaca",
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  fontWeight: "500",
                  fontSize: "14px",
                  transition: "all 0.2s ease",
                  cursor: isRunning ? "not-allowed" : "pointer",
                  opacity: isRunning ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isRunning) {
                    e.currentTarget.style.backgroundColor = "#fef2f2";
                    e.currentTarget.style.borderColor = "#fca5a5";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isRunning) {
                    e.currentTarget.style.backgroundColor = "white";
                    e.currentTarget.style.borderColor = "#fecaca";
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </SimpleCard>
        );
      })}
    </div>
  );
};
