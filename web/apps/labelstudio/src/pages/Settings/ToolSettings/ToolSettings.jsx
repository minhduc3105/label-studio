import { useCallback, useContext, useEffect, useState } from "react";
import {
  Button,
  Typography,
  Spinner,
  EmptyState,
  SimpleCard,
  Label,
} from "@humansignal/ui";
import { useUpdatePageTitle, createTitleFromSegments } from "@humansignal/core";
import { modal } from "../../../components/Modal/Modal";
import { IconSettings } from "@humansignal/icons";
import { useAPI } from "../../../providers/ApiProvider";
import { ProjectContext } from "../../../providers/ProjectProvider";
import { ToolSettingsForm } from "./Forms";
import { ToolList } from "./ToolList";
import "./ToolSettings.scss";

export const ToolSettings = () => {
  const api = useAPI();
  const { project, fetchProject } = useContext(ProjectContext);

  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [runningTools, setRunningTools] = useState({});

  useUpdatePageTitle(
    createTitleFromSegments([project?.title, "Tool Settings"])
  );

  // Helper lấy token/CSRF và build headers
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

  // === HÀM 1: LẤY DANH SÁCH TOOL (FETCH) ===
  const fetchTools = useCallback(async () => {
    setLoading(true);

    // Loại bỏ 'api' khỏi dependency vì không còn sử dụng api.callApi

    try {
      // TẠO URL TRỰC TIẾP ĐẾN BACKEND
      const url = `/api/tools?project=${encodeURIComponent(project.id)}`;

      // GỌI API BẰNG FETCH (GET method mặc định)
      const resp = await fetch(url, {
        method: "GET", // Tường minh hóa method là GET
        headers: buildAuthHeaders(),
      });

      // Xử lý lỗi HTTP (Đây là logic tối ưu hơn logic fallback cũ)
      if (!resp.ok) {
        let errorBody = await resp.text();
        try {
          errorBody = JSON.parse(errorBody);
        } catch {}

        console.error("HTTP Error fetching tools:", resp.status, errorBody);
        throw new Error(`HTTP ${resp.status} - Failed to fetch tools`);
      }

      // Trả về dữ liệu JSON
      const data = await resp.json();
      setTools(data || []);
    } catch (e) {
      // Xử lý lỗi mạng hoặc lỗi HTTP đã được raise
      console.error("Failed to fetch tools (Direct HTTP)", e);
      setTools([]);
    }

    setLoading(false);
    setLoaded(true);
  }, [project.id]);

  // === HÀM 2: MỞ MODAL (Thêm & Sửa) ===
  const showToolModal = useCallback(
    (tool = null) => {
      let modalRef;
      const isEdit = !!tool;

      // BỎ BIẾN ACTION NÀY VÀ THAY BẰNG FLAG BOOLEAN (nếu form được sửa)
      // Nếu form vẫn cần action string, chúng ta giữ nguyên tên:
      const action = isEdit ? "api_tools_partial_update" : "api_tools_create";
      const title = isEdit ? "Edit Tool" : "Add New Tool";

      const handleSubmit = (response) => {
        modalRef?.close();
        // Sau khi tạo/sửa thành công, gọi lại hàm fetch Tools
        fetchTools();
      };

      modalRef = modal({
        title: title,
        style: { width: 760 },
        closeOnClickOutside: false,
        body: (
          <ToolSettingsForm
            // VẪN TRUYỀN ACTION NÀY XUỐNG, GIẢ SỬ FORM VẪN CẦN NÓ ĐỂ XÁC ĐỊNH LÀ CREATE HAY UPDATE
            action={action}
            project={project}
            tool={tool}
            onSubmit={handleSubmit}
          />
        ),
      });
    },
    // SỬA ĐỔI: BỎ 'api' khỏi dependency array
    [project, fetchTools]
  );
  // === HÀM 3: XÓA TOOL (DELETE) ===
  const handleDeleteTool = useCallback(
    async (tool) => {
      if (confirm(`Are you sure you want to delete the tool "${tool.name}"?`)) {
        try {
          // SỬA ĐỔI: CHỈ GIỮ LẠI LOGIC FETCH TRỰC TIẾP
          const url = `/api/tools/${tool.id}`;
          const resp = await fetch(url, {
            method: "DELETE",
            headers: buildAuthHeaders(),
          });

          // DRF trả về 204 No Content khi DELETE thành công, resp.ok vẫn là true
          if (!resp.ok) {
            // Xử lý lỗi chi tiết hơn nếu cần
            let errorBody = await resp.text();
            try {
              errorBody = JSON.parse(errorBody);
            } catch {}
            console.error("HTTP Error deleting tool:", resp.status, errorBody);
            throw new Error(`HTTP ${resp.status} - Failed to delete tool`);
          }

          fetchTools(); // Tải lại danh sách sau khi xóa
        } catch (e) {
          console.error("Failed to delete tool:", e);
          // Bạn có thể hiển thị thông báo lỗi modal ở đây nếu muốn
        }
      }
    },
    // SỬA ĐỔI: BỎ 'api' khỏi dependency array
    [fetchTools]
  );

  // === HÀM 4: CHẠY TOOL (RUN) ===
  const handleRunTool = useCallback(
    async (tool) => {
      let loadingModalRef;
      
      // Show beautiful loading modal
      loadingModalRef = modal({
        title: "",
        style: { width: 480, textAlign: "center" },
        closeOnClickOutside: false,
        bare: true,
        body: (
          <div style={{ padding: "3rem 2rem" }}>
            {/* Animated Icon */}
            <div style={{ 
              marginBottom: "2rem",
              display: "flex",
              justifyContent: "center"
            }}>
              <div style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "pulse-animation 2s ease-in-out infinite"
              }}>
                <Spinner size={40} style={{ color: "white" }} />
              </div>
            </div>

            {/* Title */}
            <Typography 
              variant="body" 
              size="large" 
              weight="bold" 
              style={{ 
                marginBottom: "0.75rem",
                fontSize: "20px",
                color: "#1e293b"
              }}
            >
              Running Tool
            </Typography>

            {/* Tool Name */}
            <Typography 
              variant="body" 
              size="medium" 
              style={{ 
                marginBottom: "0.5rem",
                color: "#64748b",
                fontSize: "15px"
              }}
            >
              {tool.name}
            </Typography>

            {/* Description */}
            <Typography 
              variant="body" 
              size="small" 
              className="text-neutral-content-subtler"
              style={{ 
                marginBottom: "2rem",
                color: "#94a3b8",
                fontSize: "13px"
              }}
            >
              Please wait while we process your request...
            </Typography>

            {/* Animated Loading Bar */}
            <div style={{ 
              height: "6px", 
              backgroundColor: "#e2e8f0",
              borderRadius: "3px",
              overflow: "hidden",
              position: "relative"
            }}>
              <div style={{
                height: "100%",
                background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
                animation: "loading-bar-slide 1.5s ease-in-out infinite",
                width: "40%",
                borderRadius: "3px"
              }} />
            </div>
          </div>
        ),
      });

      setRunningTools((prev) => ({ ...prev, [tool.id]: true }));
      
      try {
        const url = `/api/tools/${tool.id}/run`;
        const resp = await fetch(url, {
          method: "POST",
          headers: buildAuthHeaders(),
          body: JSON.stringify(tool.input_data || {}),
        });

        if (!resp.ok) {
          let errorBody = await resp.text();
          try {
            errorBody = JSON.parse(errorBody);
          } catch {}
          console.error("HTTP Error running tool:", resp.status, errorBody);
          throw new Error(errorBody?.detail || `HTTP ${resp.status}`);
        }

        const result = await resp.json();

        // Close loading modal
        loadingModalRef?.close();

        // Show beautiful success modal
        const successModalRef = modal({
          title: "",
          style: { width: 520 },
          closeOnClickOutside: true,
          bare: true,
          body: (
            <div style={{ padding: "2.5rem 2rem" }}>
              {/* Success Icon */}
              <div style={{ 
                marginBottom: "2rem",
                display: "flex",
                justifyContent: "center"
              }}>
                <div style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: "scale-in 0.3s ease-out"
                }}>
                  <span style={{ fontSize: "40px" }}>✓</span>
                </div>
              </div>

              {/* Title */}
              <Typography 
                variant="body" 
                size="large" 
                weight="bold" 
                style={{ 
                  marginBottom: "0.75rem",
                  fontSize: "22px",
                  color: "#059669",
                  textAlign: "center"
                }}
              >
                Success!
              </Typography>

              {/* Description */}
              <Typography 
                variant="body" 
                size="medium"
                style={{ 
                  marginBottom: "2rem",
                  color: "#64748b",
                  textAlign: "center",
                  fontSize: "14px"
                }}
              >
                Tool executed successfully. The page will refresh automatically.
              </Typography>

              {/* Response Section */}
              <div style={{
                backgroundColor: "#f8fafc",
                borderRadius: "8px",
                padding: "1rem",
                border: "1px solid #e2e8f0",
                marginBottom: "1.5rem"
              }}>
                <Label 
                  text="Response from Tool" 
                  large 
                  style={{ 
                    marginBottom: "0.75rem",
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: "600"
                  }} 
                />
                <pre
                  style={{
                    background: "white",
                    padding: "1rem",
                    borderRadius: "6px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    border: "1px solid #e2e8f0",
                    maxHeight: "250px",
                    overflow: "auto",
                    fontSize: "12px",
                    color: "#334155",
                    lineHeight: "1.5",
                    margin: 0
                  }}
                >
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>

              {/* Auto-close indicator */}
              <Typography 
                variant="body" 
                size="small"
                style={{ 
                  color: "#94a3b8",
                  textAlign: "center",
                  fontSize: "12px"
                }}
              >
                Refreshing page in 3 seconds...
              </Typography>
            </div>
          ),
        });

        // Auto-close after 3 seconds and reload page
        setTimeout(() => {
          successModalRef?.close();
          window.location.reload(); // Refresh the entire page
        }, 3000);

      } catch (e) {
        // Close loading modal
        loadingModalRef?.close();
        
        // Show beautiful error modal
        modal({
          title: "",
          style: { width: 500 },
          closeOnClickOutside: true,
          bare: true,
          body: (
            <div style={{ padding: "2.5rem 2rem" }}>
              {/* Error Icon */}
              <div style={{ 
                marginBottom: "2rem",
                display: "flex",
                justifyContent: "center"
              }}>
                <div style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: "shake 0.5s ease-in-out"
                }}>
                  <span style={{ fontSize: "40px", color: "white" }}>✕</span>
                </div>
              </div>

              {/* Title */}
              <Typography 
                variant="body" 
                size="large" 
                weight="bold" 
                style={{ 
                  marginBottom: "0.75rem",
                  fontSize: "22px",
                  color: "#dc2626",
                  textAlign: "center"
                }}
              >
                Failed to Run Tool
              </Typography>

              {/* Tool Name */}
              <Typography 
                variant="body" 
                size="medium"
                style={{ 
                  marginBottom: "1.5rem",
                  color: "#64748b",
                  textAlign: "center",
                  fontSize: "14px"
                }}
              >
                {tool.name}
              </Typography>

              {/* Error Message */}
              <div style={{
                padding: "1.25rem",
                backgroundColor: "#fef2f2",
                borderRadius: "8px",
                border: "1px solid #fecaca",
                marginBottom: "1rem"
              }}>
                <Typography 
                  variant="body" 
                  size="small" 
                  weight="medium"
                  style={{ 
                    color: "#991b1b",
                    fontSize: "13px",
                    lineHeight: "1.6"
                  }}
                >
                  {e.message || "An unexpected error occurred. Please try again."}
                </Typography>
              </div>
            </div>
          ),
        });
      } finally {
        setRunningTools((prev) => ({ ...prev, [tool.id]: false }));
      }
    },
    [buildAuthHeaders]
  );

  useEffect(() => {
    // Chỉ gọi fetchTools nếu project đã có ID (đã được tải)
    if (project?.id) {
      fetchTools();
    }
  }, [project?.id, fetchTools]);
  // === PHẦN RENDER (JSX) ===
  // (Phần này đã đúng, không cần sửa)
  return (
    <section style={{ padding: "2rem 0" }}>
      <div className="w-[42rem]">
        <div style={{ marginBottom: "2rem" }}>
          <Typography 
            variant="headline" 
            size="large" 
            weight="bold"
            style={{ marginBottom: "0.5rem", color: "var(--color-neutral-content, #212529)" }}
          >
            🛠️ Tools
          </Typography>
          <Typography 
            variant="body" 
            size="medium"
            className="text-neutral-content-subtler"
            style={{ color: "var(--color-neutral-content-subtle, #6c757d)" }}
          >
            Integration by iSE Research Lab - Configure and manage labeling tools for your annotation workflow.
          </Typography>
        </div>

        {loading && <Spinner size={32} />}

        {loaded && tools.length === 0 && (
          <SimpleCard
            title=""
            className="bg-primary-background border-primary-border-subtler p-base"
            style={{
              borderRadius: "12px",
              padding: "3rem 2rem",
              backgroundColor: "var(--color-neutral-background-subtle, #f8f9fa)",
              border: "2px dashed var(--color-neutral-border, #dee2e6)"
            }}
          >
            <EmptyState
              size="large"
              variant="primary"
              icon={<IconSettings style={{ width: "48px", height: "48px" }} />}
              title="No tools connected yet"
              description="Integration by iSE Research Lab - Connect or configure labeling tools for your project. Customize annotation interfaces and control labeling behavior to streamline your workflow."
              actions={
                <Button
                  variant="primary"
                  look="filled"
                  onClick={() => showToolModal()}
                  aria-label="Add new tool"
                  style={{ 
                    padding: "0.75rem 2rem",
                    fontSize: "14px",
                    fontWeight: "500"
                  }}
                >
                  ✨ Add Your First Tool
                </Button>
              }
            />
          </SimpleCard>
        )}

        {loaded && tools.length > 0 && (
          <>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "1.5rem",
              padding: "1rem",
              backgroundColor: "var(--color-neutral-background-subtle, #f8f9fa)",
              borderRadius: "8px"
            }}>
              <Typography variant="body" size="medium" weight="medium">
                {tools.length} {tools.length === 1 ? 'Tool' : 'Tools'} Connected
              </Typography>
              <Button
                variant="primary"
                look="filled"
                onClick={() => showToolModal()}
                aria-label="Add new tool"
                style={{ minWidth: "120px" }}
              >
                + Add Tool
              </Button>
            </div>

            <ToolList
              tools={tools}
              onEdit={showToolModal}
              onDelete={handleDeleteTool}
              onRunTool={handleRunTool}
              runningTools={runningTools}
              onToolClick={(tool) => {
                modal({
                  title: `Tool: ${tool.name}`,
                  style: { width: 600 },
                  closeOnClickOutside: true,
                  body: (
                    <div style={{ padding: "1.5rem 0" }}>
                      <div style={{ marginBottom: "2rem" }}>
                        <Typography variant="body" size="large" weight="medium" style={{ marginBottom: "0.75rem" }}>
                          {tool.name}
                        </Typography>
                        <div style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "0.5rem",
                          padding: "0.75rem",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0"
                        }}>
                          <Typography variant="body" size="small" style={{ color: "#64748b" }}>
                            🔗 Endpoint:
                          </Typography>
                          <Typography variant="body" size="small" style={{ color: "#334155", wordBreak: "break-all" }}>
                            {tool.endpoint}
                          </Typography>
                        </div>
                      </div>

                      <div style={{ 
                        display: "flex", 
                        gap: "0.75rem", 
                        justifyContent: "center",
                        paddingTop: "1rem",
                        borderTop: "1px solid #e2e8f0"
                      }}>
                        <Button
                          look="filled"
                          onClick={() => {
                            handleRunTool(tool);
                          }}
                          style={{
                            backgroundColor: "#3b82f6",
                            color: "white",
                            padding: "0.625rem 1.5rem",
                            fontSize: "14px",
                            fontWeight: "500",
                            flex: 1
                          }}
                        >
                          Run Tool
                        </Button>
                        <Button
                          onClick={() => {
                            showToolModal(tool);
                          }}
                          style={{
                            padding: "0.625rem 1.5rem",
                            fontSize: "14px",
                            fontWeight: "500",
                            flex: 1
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          look="danger"
                          onClick={() => {
                            handleDeleteTool(tool);
                          }}
                          style={{
                            padding: "0.625rem 1.5rem",
                            fontSize: "14px",
                            fontWeight: "500",
                            flex: 1
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ),
                });
              }}
            />
          </>
        )}
      </div>
    </section>
  );
};

ToolSettings.title = "Tools";
ToolSettings.path = "/tools";
