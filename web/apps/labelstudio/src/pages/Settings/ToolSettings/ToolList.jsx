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
  onRunTool, // (2) NHẬN PROP MỚI
  activeToolId,
  runningTools = {}, // (2) NHẬN PROP MỚI (và gán giá trị mặc định là object rỗng)
}) => {
  return (
    <div
      className="tool-list"
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {tools.map((tool) => {
        const isActive = tool.id === activeToolId;

        // (3) KIỂM TRA: Tool này có đang chạy không?
        const isRunning = !!runningTools[tool.id]; // Dùng !! để chuyển thành boolean (true/false)

        return (
          <SimpleCard
            key={tool.id}
            className="bg-primary-background border-primary-border-subtler p-base"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              border: isActive ? "2px solid #007bff" : "2px solid transparent",
              // (Tùy chọn: Làm mờ card nếu đang chạy)
              opacity: isRunning ? 0.7 : 1,
            }}
          >
            {/* Phần thông tin (Tên và Endpoint) */}
            <div style={{ flex: 1, marginRight: "1rem" }}>
              {/* ... (Code hiển thị tên và endpoint giữ nguyên) ... */}
              <Typography variant="body" size="medium" weight="medium">
                {tool.name || "Untitled Tool"}
                {/* ... (code 'isActive' giữ nguyên) ... */}
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
                    width: "74px", // (Đặt chiều rộng cố định bằng nút "Run Tool")
                    height: "32px", // (Đặt chiều cao cố định)
                  }}
                >
                  <Spinner size="small" />
                </div>
              ) : (
                // (b) Nếu không chạy: Hiển thị nút "Run Tool"
                <Button
                  size="small"
                  look="outline" // (Dùng 'outline' cho đỡ rối mắt)
                  onClick={() => onRunTool(tool)}
                  aria-label={`Run ${tool.name}`}
                >
                  Run Tool
                </Button>
              )}

              <Button
                size="small"
                onClick={() => onEdit(tool)}
                aria-label={`Edit ${tool.name}`}
                disabled={isRunning} // (5) Vô hiệu hóa "Edit" khi đang chạy
              >
                Edit
              </Button>
              <Button
                size="small"
                look="danger"
                onClick={() => onDelete(tool)}
                aria-label={`Delete ${tool.name}`}
                disabled={isRunning} // (6) Vô hiệu hóa "Delete" khi đang chạy
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
