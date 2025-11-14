import { inject } from "mobx-react";
// MỚI: Thêm Spinner và Typography
import { Button, ButtonGroup, Spinner, Typography } from "@humansignal/ui";
import { Interface } from "../../Common/Interface";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronDown } from "@humansignal/icons";
import { Dropdown } from "../../Common/Dropdown/DropdownComponent";
import { Menu } from "../../Common/Menu/Menu";
// MỚI: Thêm modal
import { modal } from "../../Common/Modal/Modal";

// ===================================================================
// === BẮT ĐẦU COMPONENT MỚI ĐỂ HIỂN THỊ TRONG MODAL ===
// ===================================================================
/**
 * Component này sẽ được render bên trong modal.
 * Nó quản lý state (trạng thái) của riêng nó.
 */
const ToolModalContent = ({
  tool,
  buildAuthHeaders,
  closeModal,
  onToolDeleted,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState(null);

  /**
   * Sao chép logic chạy tool từ ToolSettings.jsx
   */
  const handleRunTool = async () => {
    setIsRunning(true);
    setRunResult(null);
    setRunError(null);
    try {
      const url = `/api/tools/${tool.id}/run`;
      const resp = await fetch(url, {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify(tool.input_data || {}),
      });

      if (!resp.ok) {
        let errorBody = "Unknown error";
        try {
          errorBody = (await resp.json())?.detail;
        } catch (e) {
          errorBody = await resp.text();
        }
        throw new Error(errorBody || `HTTP ${resp.status}`);
      }

      const result = await resp.json();
      setRunResult(result); // Đánh dấu là "Finish"
    } catch (e) {
      console.error("Failed to run tool:", e);
      setRunError(e.message);
    } finally {
      setIsRunning(false); // Dừng chạy
    }
  };

  /**
   * Logic cho nút Edit: Chỉ thông báo
   */
  const handleEditTool = () => {
    alert(
      "Việc chỉnh sửa Tool chỉ có sẵn trong trang Project Settings > Tools."
    );
  };

  /**
   * Sao chép logic xóa tool từ ToolSettings.jsx
   */
  const handleDeleteTool = async () => {
    if (confirm(`Bạn có chắc chắn muốn xóa tool "${tool.name}" không?`)) {
      setIsRunning(true); // Tái sử dụng state 'isRunning' để khóa UI
      setRunError(null);
      setRunResult(null);
      try {
        const url = `/api/tools/${tool.id}`;
        const resp = await fetch(url, {
          method: "DELETE",
          headers: buildAuthHeaders(),
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} - Không thể xóa tool`);
        }

        alert("Đã xóa tool thành công.");
        onToolDeleted(); // Gọi hàm của component cha để tải lại danh sách
        closeModal(); // Đóng modal
      } catch (e) {
        console.error("Failed to delete tool:", e);
        setRunError(e.message);
        setIsRunning(false); // Mở khóa UI nếu xóa thất bại
      }
    }
  };

  // Giao diện (JSX) của nội dung modal
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* 1. Phần thông tin (Tên và Endpoint) */}
      <div>
        <Typography variant="body" size="medium" weight="medium">
          {tool.name || "Untitled Tool"}
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

      {/* 2. Phần các nút bấm (Run, Edit, Delete) */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexShrink: 0,
          borderTop: "1px solid #e0e0e0",
          paddingTop: "1rem",
        }}
      >
        {isRunning ? (
          // Hiển thị Spinner và text "Running..." khi đang chạy
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "32px",
            }}
          >
            <Spinner size="small" />
            <span style={{ marginLeft: "8px", color: "#555" }}>Running...</span>
          </div>
        ) : (
          // Hiển thị nút "Run Tool"
          <Button size="small" look="outline" onClick={handleRunTool}>
            Run Tool
          </Button>
        )}
        <Button size="small" onClick={handleEditTool} disabled={isRunning}>
          Edit
        </Button>
        <Button
          size="small"
          look="danger"
          onClick={handleDeleteTool}
          disabled={isRunning}
        >
          Delete
        </Button>
      </div>

      {/* 3. Phần kết quả (Finish hoặc Error) */}
      {runResult && (
        <div style={{ marginTop: "1rem" }}>
          <Typography variant="body" weight="medium" style={{ color: "green" }}>
            ✅ Finish: Đã chạy thành công
          </Typography>
          <pre
            style={{
              background: "#f0f9f0",
              padding: "10px",
              borderRadius: "4px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: "200px",
              overflowY: "auto",
              border: "1px solid #d0e0d0",
            }}
          >
            {JSON.stringify(runResult, null, 2)}
          </pre>
        </div>
      )}
      {runError && (
        <div style={{ marginTop: "1rem" }}>
          <Typography variant="body" weight="medium" style={{ color: "red" }}>
            ❌ Error: Chạy thất bại
          </Typography>
          <pre
            style={{
              background: "#fff0f0",
              color: "red",
              padding: "10px",
              borderRadius: "4px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              border: "1px solid #e0d0d0",
            }}
          >
            {runError}
          </pre>
        </div>
      )}
    </div>
  );
};
// ===================================================================
// === KẾT THÚC COMPONENT MỚI ===
// ===================================================================

const injector = inject(({ store }) => {
  const { dataStore, currentView } = store;
  const totalTasks =
    store.project?.task_count ?? store.project?.task_number ?? 0;
  const foundTasks = dataStore?.total ?? 0;

  return {
    store,
    canLabel: totalTasks > 0 || foundTasks > 0,
    target: currentView?.target ?? "tasks",
    selectedCount: currentView?.selectedCount,
    allSelected: currentView?.allSelected,
    project: store.project, // Đã có project
  };
});

export const LabelButton = injector(
  ({ store, canLabel, size, target, selectedCount, project }) => {
    // Đã nhận project
    const disabled = target === "annotations";
    const triggerRef = useRef();
    const [isOpen, setIsOpen] = useState(false);

    const [tools, setTools] = useState([]);
    const [isLoadingTools, setIsLoadingTools] = useState(false);

    // --- Các hàm helper (đã copy) ---
    const getCookie = (name) =>
      document.cookie
        .split("; ")
        .find((v) => v.startsWith(name + "="))
        ?.split("=")[1];

    const buildAuthHeaders = () => {
      const headers = { "Content-Type": "application/json" };
      const token =
        localStorage.getItem("access") || localStorage.getItem("token") || null;
      if (token) headers["Authorization"] = `Bearer ${token}`;
      else {
        const csrftoken = getCookie("csrftoken");
        if (csrftoken) headers["X-CSRFToken"] = csrftoken;
      }
      return headers;
    };
    // --- Hết hàm helper ---

    const handleClickOutside = useCallback((e) => {
      const el = triggerRef.current;

      if (el && !el.contains(e.target)) {
        setIsOpen(false);
      }
    }, []);

    useEffect(() => {
      document.addEventListener("click", handleClickOutside, { capture: true });

      return () => {
        document.removeEventListener("click", handleClickOutside, {
          capture: true,
        });
      };
    }, []);

    // MỚI: Tách fetchTools ra ngoài để có thể gọi lại
    const fetchTools = useCallback(async () => {
      if (!project || !project.id) return; // Kiểm tra project

      setIsLoadingTools(true);
      try {
        const url = `/api/tools?project=${encodeURIComponent(project.id)}`;
        const resp = await fetch(url, {
          method: "GET",
          headers: buildAuthHeaders(),
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} - Failed to fetch tools`);
        }

        const data = await resp.json();
        setTools(data || []);
      } catch (e) {
        console.error("Failed to fetch tools (Direct HTTP)", e);
        setTools([]);
      } finally {
        setIsLoadingTools(false);
      }
    }, [project]); // Phụ thuộc vào 'project'

    // useEffect chính giờ chỉ gọi fetchTools
    useEffect(() => {
      fetchTools();
    }, [fetchTools]); // Phụ thuộc vào hàm đã được useCallback

    const onLabelAll = () => {
      localStorage.setItem("dm:labelstream:mode", "all");
      store.startLabelStream();
    };

    const onLabelVisible = () => {
      localStorage.setItem("dm:labelstream:mode", "filtered");
      store.startLabelStream();
    };

    // MỚI: Cập nhật onToolClick để sử dụng Modal
    const onToolClick = (tool) => {
      let modalRef; // Biến để giữ tham chiếu tới modal

      // Hàm này sẽ được truyền xuống modal để nó
      // có thể yêu cầu component cha (LabelButton) tải lại list tool
      const handleToolDeleted = () => {
        fetchTools();
      };

      // Mở modal
      modalRef = modal({
        title: `Tool: ${tool.name}`,
        canClose: true,
        style: { width: "500px" }, // Tùy chỉnh độ rộng
        body: (
          <ToolModalContent
            tool={tool}
            buildAuthHeaders={buildAuthHeaders}
            closeModal={() => modalRef.close()} // Hàm để modal tự đóng
            onToolDeleted={handleToolDeleted} // Hàm để làm mới danh sách
          />
        ),
      });
    };

    const triggerStyle = {
      width: 24,
      padding: 0,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: isOpen ? 0 : undefined,
      boxShadow: "none",
    };

    const primaryStyle = {
      width: 160,
      padding: 0,
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
      borderBottomLeftRadius: isOpen ? 0 : undefined,
    };

    // ... (secondStyle và selectedCount giữ nguyên) ...
    const secondStyle = {
      /* ... */
    };
    selectedCount;

    // --- (Phần JSX return giữ nguyên như file của bạn) ---
    return canLabel ? (
      <Interface name="labelButton">
        <div>
          <ButtonGroup>
            <Button
              size={size ?? "small"}
              variant="primary"
              look="outlined"
              disabled={disabled}
              style={primaryStyle}
              onClick={onLabelAll}
            >
              Label {selectedCount ? selectedCount : "All"} Task
              {!selectedCount || selectedCount > 1 ? "s" : ""}
            </Button>
            <Dropdown.Trigger
              align="bottom-right"
              content={
                <Menu size="compact">
                  {/* 1. Giữ lại mục cũ */}
                  <Menu.Item onClick={onLabelVisible}>
                    Label Tasks As Displayed
                  </Menu.Item>
                  {/* 2. Thêm vạch ngăn */}
                  {(tools.length > 0 || isLoadingTools) && <Menu.Divider />}
                  {/* 3. Hiển thị trạng thái loading */}
                  {isLoadingTools && (
                    <Menu.Item disabled style={{ color: "#999" }}>
                      Loading tools...
                    </Menu.Item>
                  )}
                  {/* 4. Lặp qua mảng tools và tạo Menu.Item */}
                  {!isLoadingTools &&
                    tools.map((tool) => (
                      <Menu.Item
                        key={tool.id}
                        onClick={() => onToolClick(tool)}
                      >
                        {tool.name}
                      </Menu.Item>
                    ))}
                  {/* 5. Hiển thị nếu không có tool */}
                  {!isLoadingTools && tools.length === 0 && (
                    <Menu.Item disabled style={{ color: "#999" }}>
                      Could not found tool
                    </Menu.Item>
                  )}{" "}
                </Menu>
              }
            >
              <Button
                size={size}
                look="outlined"
                variant="primary"
                aria-label={"Toggle open"}
              >
                <IconChevronDown />
              </Button>
            </Dropdown.Trigger>
          </ButtonGroup>
        </div>
      </Interface>
    ) : null;
  }
);
