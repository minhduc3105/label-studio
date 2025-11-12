import React from "react";
import { Button, SimpleCard, Typography } from "@humansignal/ui";
// (Tùy chọn: bạn có thể tạo và import file CSS/SCSS
// để làm cho phần highlight "active" đẹp hơn)
// import './ToolList.scss';

/**
 * Hiển thị danh sách các Tools.
 * @param {object[]} tools - Danh sách các tool object
 * @param {function} onEdit - Hàm gọi khi nhấn nút "Edit" (nhận 1 tool object)
 * @param {function} onDelete - Hàm gọi khi nhấn nút "Delete" (nhận 1 tool object)
 * @param {number|string} [activeToolId] - (Tùy chọn) ID của tool đang được kích hoạt
 */
export const ToolList = ({ tools, onEdit, onDelete, activeToolId }) => {
  return (
    <div
      className="tool-list"
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {tools.map((tool) => {
        // Kiểm tra xem tool này có phải là tool đang "active" không
        const isActive = tool.id === activeToolId;

        return (
          // Sử dụng SimpleCard để bọc mỗi tool
          <SimpleCard
            key={tool.id}
            className="bg-primary-background border-primary-border-subtler p-base"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              // Ví dụ highlight đơn giản bằng border
              border: isActive ? "2px solid #007bff" : "2px solid transparent",
            }}
          >
            {/* Phần thông tin (Tên và Endpoint) */}
            <div style={{ flex: 1, marginRight: "1rem" }}>
              <Typography variant="body" size="medium" weight="medium">
                {tool.name || "Untitled Tool"}
                {isActive && (
                  <span
                    style={{
                      Warning: "#007bff",
                      marginLeft: "8px",
                      fontSize: "0.8rem",
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
                style={{ wordBreak: "break-all" }}
              >
                {tool.endpoint || "No endpoint URL"}
              </Typography>
            </div>

            {/* Phần nút (Edit và Delete) */}
            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
              <Button
                size="small"
                // Gọi hàm onEdit và truyền tool object này lên component cha
                onClick={() => onEdit(tool)}
                aria-label={`Edit ${tool.name}`}
              >
                Edit
              </Button>
              <Button
                size="small"
                look="danger"
                // Gọi hàm onDelete và truyền tool object này lên component cha
                onClick={() => onDelete(tool)}
                aria-label={`Delete ${tool.name}`}
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
