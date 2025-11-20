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
// === [COMPONENT 1] MODAL UPLOAD FILE CSV (GỌI API MERGE) ===
// ===================================================================
const ImportLabelModal = ({ project, buildAuthHeaders, closeModal }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 1. Tạo ref để điều khiển thẻ input file
  const fileInputRef = useRef(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("csv_file", file);

    try {
      const url = `/api/projects/${project.id}/import?merge=true`;

      const headers = buildAuthHeaders();
      if (headers["Content-Type"]) {
        delete headers["Content-Type"];
      }

      const resp = await fetch(url, {
        method: "POST",
        headers: headers,
        body: formData,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || "Upload failed");
      }

      const data = await resp.json();

      setResult(data);

      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      // -----------------------

      // Tự động reload sau 2s
      setTimeout(() => {
        closeModal();
        window.location.reload();
      }, 2000);
    } catch (e) {
      console.error(e);
      setError(e.message || "Error occurred");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: "1rem 0" }}>
      <Typography style={{ marginBottom: "1rem" }}>
        Upload a CSV file containing <code>image_name</code> and{" "}
        <code>label</code> columns to merge labels into existing tasks.
      </Typography>

      <div
        style={{
          border: "2px dashed #e2e8f0",
          padding: "2rem",
          borderRadius: "8px",
          textAlign: "center",
          marginBottom: "1rem",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files[0])}
          disabled={uploading || result}
          style={{ display: "block", margin: "0 auto" }}
        />
      </div>

      {error && (
        <div
          style={{
            color: "red",
            marginBottom: "1rem",
            background: "#fee2e2",
            padding: "0.5rem",
            borderRadius: "4px",
          }}
        >
          ❌ {error}
        </div>
      )}

      {result && (
        <div
          style={{
            color: "green",
            marginBottom: "1rem",
            background: "#dcfce7",
            padding: "0.5rem",
            borderRadius: "4px",
          }}
        >
          ✅ {result.message || "Merged successfully!"}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Button onClick={closeModal} disabled={uploading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleUpload}
          disabled={!file || uploading || result}
        >
          {uploading ? (
            <>
              <Spinner size="small" /> Merging...
            </>
          ) : result ? (
            "Done"
          ) : (
            "Upload & Merge"
          )}
        </Button>
      </div>
    </div>
  );
};
// ===================================================================
// === BẮT ĐẦU COMPONENT MỚI ĐỂ HIỂN THỊ TRONG MODAL ===
// ===================================================================
/**
 * Modal content component for tool interaction
 * Manages its own state for running, editing, and deleting tools
 */
const ToolModalContent = ({
  tool,
  buildAuthHeaders,
  closeModal,
  onToolDeleted,
  selectedTasks,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState(null);

  /**
   * Handle running the tool with beautiful loading states
   */
  const handleRunTool = async () => {
    setIsRunning(true);
    setRunResult(null);
    setRunError(null);

    try {
      const payload = {
        ...(tool.input_data || {}),
        selected_tasks: selectedTasks || [],
        selected_tasks_ids: selectedTasks?.map((t) => t.id) || [],
        project_id: tool.project_id,
      };
      const url = `/api/tools/${tool.id}/run`;
      const resp = await fetch(url, {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify(payload),
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
      setRunResult(result);

      // Auto-refresh page after 3 seconds on success
      setTimeout(() => {
        closeModal();
        window.location.reload();
      }, 3000);
    } catch (e) {
      console.error("Failed to run tool:", e);
      setRunError(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  /**
   * Handle edit - redirect to settings page
   */
  const handleEditTool = () => {
    if (
      confirm(
        "Edit this tool in Project Settings? The page will navigate to the Tools settings."
      )
    ) {
      window.location.href =
        window.location.origin +
        window.location.pathname.replace(/\/[^/]*$/, "/settings/tools");
    }
  };

  /**
   * Handle deleting the tool
   */
  const handleDeleteTool = async () => {
    if (confirm(`Are you sure you want to delete the tool "${tool.name}"?`)) {
      setIsRunning(true);
      setRunError(null);
      setRunResult(null);

      try {
        const url = `/api/tools/${tool.id}`;
        const resp = await fetch(url, {
          method: "DELETE",
          headers: buildAuthHeaders(),
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} - Failed to delete tool`);
        }

        // Success - refresh page
        closeModal();
        window.location.reload();
      } catch (e) {
        console.error("Failed to delete tool:", e);
        setRunError(e.message);
        setIsRunning(false);
      }
    }
  };

  // Beautiful modal UI
  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Tool Information */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Typography
          variant="body"
          size="large"
          weight="medium"
          style={{ marginBottom: "0.5rem", color: "#1e293b" }}
        >
          {tool.name || "Untitled Tool"}
        </Typography>
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "#f8fafc",
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
          }}
        >
          <Typography
            variant="body"
            size="small"
            style={{
              wordBreak: "break-all",
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            🔗 {tool.endpoint || "No endpoint URL"}
          </Typography>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          paddingTop: "1rem",
          borderTop: "1px solid #e2e8f0",
          marginBottom: "1rem",
        }}
      >
        {isRunning ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              padding: "0.5rem",
              backgroundColor: "#f0f7ff",
              borderRadius: "6px",
            }}
          >
            <Spinner size="small" />
            <span
              style={{ marginLeft: "8px", color: "#3b82f6", fontWeight: "500" }}
            >
              Processing...
            </span>
          </div>
        ) : (
          <>
            <Button
              size="small"
              look="filled"
              onClick={handleRunTool}
              style={{
                flex: 1,
                backgroundColor: "#3b82f6",
                color: "white",
                fontWeight: "500",
              }}
            >
              Run Tool
            </Button>
            <Button
              size="small"
              onClick={handleEditTool}
              style={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
              }}
            >
              Edit
            </Button>
            <Button
              size="small"
              look="danger"
              onClick={handleDeleteTool}
              style={{
                backgroundColor: "white",
                color: "#ef4444",
                border: "1px solid #fecaca",
              }}
            >
              Delete
            </Button>
          </>
        )}
      </div>

      {/* Success Result */}
      {runResult && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#f0fdf4",
            borderRadius: "8px",
            border: "1px solid #86efac",
          }}
        >
          <Typography
            variant="body"
            weight="medium"
            style={{
              color: "#16a34a",
              marginBottom: "0.75rem",
              fontSize: "14px",
            }}
          >
            ✅ Success! Tool executed successfully
          </Typography>
          <Typography
            variant="body"
            size="small"
            style={{
              color: "#15803d",
              marginBottom: "1rem",
              fontSize: "12px",
            }}
          >
            Page will refresh in 3 seconds...
          </Typography>
          <pre
            style={{
              background: "white",
              padding: "0.75rem",
              borderRadius: "6px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: "200px",
              overflowY: "auto",
              border: "1px solid #86efac",
              fontSize: "12px",
              color: "#334155",
              margin: 0,
            }}
          >
            {JSON.stringify(runResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Error Result */}
      {runError && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#fef2f2",
            borderRadius: "8px",
            border: "1px solid #fecaca",
          }}
        >
          <Typography
            variant="body"
            weight="medium"
            style={{
              color: "#dc2626",
              marginBottom: "0.5rem",
              fontSize: "14px",
            }}
          >
            ❌ Error: Failed to run tool
          </Typography>
          <pre
            style={{
              background: "white",
              color: "#991b1b",
              padding: "0.75rem",
              borderRadius: "6px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              border: "1px solid #fecaca",
              fontSize: "12px",
              margin: 0,
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
    selectedTasks: currentView?.selectedTasks,
    allSelected: currentView?.allSelected,
    project: store.project,
  };
});

export const LabelButton = injector(
  ({
    store,
    canLabel,
    size,
    target,
    selectedCount,
    project,
    selectedTasks,
  }) => {
    // Đã nhận project
    const disabled = target === "annotations";
    const triggerRef = useRef();
    const [isOpen, setIsOpen] = useState(false);

    const [tools, setTools] = useState([]);
    const [isLoadingTools, setIsLoadingTools] = useState(false);

    // --- Các hàm helper ---
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

    // Fetch tools from API
    const fetchTools = useCallback(async () => {
      if (!project || !project.id) return;

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
        console.error("Failed to fetch tools", e);
        setTools([]);
      } finally {
        setIsLoadingTools(false);
      }
    }, [project]);

    useEffect(() => {
      fetchTools();
    }, [fetchTools]);

    const showChoiceModal = (mode) => {
      let choiceModalRef;

      // Logic xử lý khi chọn Manual
      const startManual = () => {
        choiceModalRef.close();
        // Logic cũ: set mode và start stream
        localStorage.setItem("dm:labelstream:mode", mode);
        store.startLabelStream();
      };

      // Logic xử lý khi chọn Import
      const startImport = () => {
        choiceModalRef.close();
        // Mở tiếp Modal Upload
        const importModalRef = modal({
          title: "Import Labels from File",
          style: { width: 500 },
          body: (
            <ImportLabelModal
              project={project}
              buildAuthHeaders={buildAuthHeaders}
              closeModal={() => importModalRef.close()}
            />
          ),
        });
      };

      // Hiển thị Modal Lựa chọn 2 Option
      choiceModalRef = modal({
        title: "Choose Labeling Method",
        style: { width: 400 },
        body: (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              padding: "1rem 0",
            }}
          >
            <Button
              onClick={startImport}
              style={{
                height: "50px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                fontSize: "16px",
              }}
            >
              📁 1. Import Label File
            </Button>

            <Button
              variant="primary"
              onClick={startManual}
              style={{
                height: "50px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                fontSize: "16px",
              }}
            >
              ✍️ 2. Manual Labeling
            </Button>
          </div>
        ),
      });
    };

    const onLabelAll = () => {
      showChoiceModal("all");
    };

    const onLabelVisible = () => {
      showChoiceModal("filtered");
    };

    // Handle tool click to open beautiful modal
    const onToolClick = (tool) => {
      let modalRef;

      const handleToolDeleted = () => {
        fetchTools();
      };

      // Open beautiful modal
      modalRef = modal({
        title: `Tool: ${tool.name}`,
        canClose: true,
        style: { width: "540px" },
        body: (
          <ToolModalContent
            tool={tool}
            buildAuthHeaders={buildAuthHeaders}
            closeModal={() => modalRef.close()}
            onToolDeleted={handleToolDeleted}
            selectedTasks={selectedTasks}
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
      width: triggerStyle.width + primaryStyle.width,
      padding: 0,
      display: isOpen ? "flex" : "none",
      position: "absolute",
      zIndex: 10,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
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
              {!selectedCount || selectedCount > 1 ? "s" : "s"}
            </Button>
            <Dropdown.Trigger
              align="bottom-right"
              content={
                <Menu size="compact">
                  <Menu.Item onClick={onLabelVisible}>
                    Label Tasks As Displayed
                  </Menu.Item>

                  {(tools.length > 0 || isLoadingTools) && <Menu.Divider />}

                  {isLoadingTools && (
                    <Menu.Item
                      disabled
                      style={{ color: "#94a3b8", fontStyle: "italic" }}
                    >
                      Loading tools...
                    </Menu.Item>
                  )}

                  {!isLoadingTools &&
                    tools.map((tool) => (
                      <Menu.Item
                        key={tool.id}
                        onClick={() => onToolClick(tool)}
                        style={{ fontWeight: "500" }}
                      >
                        🛠️ {tool.name}
                      </Menu.Item>
                    ))}

                  {!isLoadingTools && tools.length === 0 && (
                    <Menu.Item
                      disabled
                      style={{ color: "#94a3b8", fontStyle: "italic" }}
                    >
                      No tools available
                    </Menu.Item>
                  )}
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
