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
 * Modal content component for tool interaction
 * Manages its own state for running, editing, and deleting tools
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
   * Handle running the tool with beautiful loading states
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
    if (confirm("Edit this tool in Project Settings? The page will navigate to the Tools settings.")) {
      window.location.href = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/settings/tools');
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
        <div style={{
          padding: "0.75rem",
          backgroundColor: "#f8fafc",
          borderRadius: "6px",
          border: "1px solid #e2e8f0"
        }}>
          <Typography
            variant="body"
            size="small"
            style={{ 
              wordBreak: "break-all",
              color: "#64748b",
              fontSize: "13px"
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
          marginBottom: "1rem"
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
              borderRadius: "6px"
            }}
          >
            <Spinner size="small" />
            <span style={{ marginLeft: "8px", color: "#3b82f6", fontWeight: "500" }}>
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
                fontWeight: "500"
              }}
            >
              Run Tool
            </Button>
            <Button 
              size="small" 
              onClick={handleEditTool}
              style={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0"
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
                border: "1px solid #fecaca"
              }}
            >
              Delete
            </Button>
          </>
        )}
      </div>

      {/* Success Result */}
      {runResult && (
        <div style={{
          padding: "1rem",
          backgroundColor: "#f0fdf4",
          borderRadius: "8px",
          border: "1px solid #86efac"
        }}>
          <Typography 
            variant="body" 
            weight="medium" 
            style={{ 
              color: "#16a34a",
              marginBottom: "0.75rem",
              fontSize: "14px"
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
              fontSize: "12px"
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
              margin: 0
            }}
          >
            {JSON.stringify(runResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Error Result */}
      {runError && (
        <div style={{
          padding: "1rem",
          backgroundColor: "#fef2f2",
          borderRadius: "8px",
          border: "1px solid #fecaca"
        }}>
          <Typography 
            variant="body" 
            weight="medium" 
            style={{ 
              color: "#dc2626",
              marginBottom: "0.5rem",
              fontSize: "14px"
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
              margin: 0
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

    const onLabelAll = () => {
      localStorage.setItem("dm:labelstream:mode", "all");
      store.startLabelStream();
    };

    const onLabelVisible = () => {
      localStorage.setItem("dm:labelstream:mode", "filtered");
      store.startLabelStream();
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
                  <Menu.Item onClick={onLabelVisible}>
                    Label Tasks As Displayed
                  </Menu.Item>
                  
                  {(tools.length > 0 || isLoadingTools) && <Menu.Divider />}
                  
                  {isLoadingTools && (
                    <Menu.Item disabled style={{ color: "#94a3b8", fontStyle: "italic" }}>
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
                    <Menu.Item disabled style={{ color: "#94a3b8", fontStyle: "italic" }}>
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
